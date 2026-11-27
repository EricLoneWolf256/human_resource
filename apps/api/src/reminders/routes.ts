import { Router, type Request } from 'express';
import type { Prisma, Reminder } from '@prisma/client';
import {
  REMINDER_TYPES,
  reminderScanSchema,
  type ReminderDto,
  type ReminderType,
} from '@umu-hr/shared';
import { prisma } from '../db.js';
import { addDays, toDateOnly, today } from '../dates.js';
import { asyncRoute, badRequest, forbidden, notFound } from '../errors.js';
import { sendPaginated } from '../http.js';
import { requireAuth, requirePermission } from '../access/middleware.js';
import { buildAccessContext, canAccessEmployee, hasPermission } from '../access/policy.js';
import { auditFields, recordAudit } from '../audit/service.js';
import { currentUnitIds } from '../employees/service.js';
import { notifyUsers } from '../notifications/service.js';
import { metadata, userDisplayName } from '../phase2/service.js';

const router = Router();

const REMINDER_STATUSES = ['PENDING', 'SENT', 'DISMISSED'] as const;

interface Pagination {
  page: number;
  pageSize: number;
}

interface ReminderTarget {
  type: ReminderType;
  permission: 'contract.view' | 'probation.view';
  entityType: string;
  entityId: string;
  dueDate: Date;
  employee: ScanEmployee;
}

const employeeForReminderSelect = {
  id: true,
  assignments: { select: { unitId: true, startDate: true, endDate: true } },
} satisfies Prisma.EmployeeSelect;

const employeeForReminderArgs = { select: employeeForReminderSelect } satisfies Prisma.EmployeeDefaultArgs;

type ScanEmployee = Prisma.EmployeeGetPayload<typeof employeeForReminderArgs>;
type ContractScanRow = Prisma.ContractGetPayload<{ include: { employee: typeof employeeForReminderArgs } }>;
type ProbationScanRow = Prisma.ProbationRecordGetPayload<{
  include: { employee: typeof employeeForReminderArgs };
}>;

const candidateUserSelect = {
  id: true,
  email: true,
  status: true,
  mustChangePassword: true,
  mfaEnabled: true,
  employeeId: true,
  lastLoginAt: true,
  employee: {
    select: {
      id: true,
      staffNumber: true,
      firstName: true,
      lastName: true,
      preferredName: true,
    },
  },
} satisfies Prisma.UserSelect;

type CandidateUser = Prisma.UserGetPayload<{ select: typeof candidateUserSelect }>;

function stringQuery(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === 'string') {
      const trimmed = first.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
  }
  return undefined;
}

function parsePagination(query: Request['query']): Pagination {
  const pageRaw = stringQuery(query.page);
  const pageSizeRaw = stringQuery(query.pageSize);
  const page = pageRaw === undefined ? 1 : Number(pageRaw);
  const pageSize = pageSizeRaw === undefined ? 20 : Number(pageSizeRaw);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  ) {
    throw badRequest('Invalid pagination parameters');
  }
  return { page, pageSize };
}

function enumValue<T extends string>(
  raw: string | undefined,
  values: readonly T[],
  field: string,
): T | undefined {
  if (raw === undefined) return undefined;
  const match = values.find((value) => value === raw);
  if (!match) throw badRequest(`Invalid ${field}`);
  return match;
}

function toReminderDto(row: Reminder, recipientName: string | null): ReminderDto {
  return {
    id: row.id,
    type: row.type,
    entityType: row.entityType,
    entityId: row.entityId,
    recipientUserId: row.recipientUserId,
    recipientName: recipientName ?? row.recipientUserId,
    dueDate: toDateOnly(row.dueDate),
    status: row.status as ReminderDto['status'],
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
  };
}

async function findCandidateUsers(permission: string, at: Date): Promise<CandidateUser[]> {
  return prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      roleAssignments: {
        some: {
          revokedAt: null,
          startDate: { lte: at },
          OR: [{ endDate: null }, { endDate: { gte: at } }],
          role: { permissions: { some: { permissionKey: permission } } },
        },
      },
    },
    select: candidateUserSelect,
  });
}

function reminderMessage(type: ReminderType, dueDate: Date): string {
  return type === 'CONTRACT_EXPIRY'
    ? `Contract expires on ${toDateOnly(dueDate)}. Review the contract record.`
    : `Probation review is due on ${toDateOnly(dueDate)}. Review the probation record.`;
}

router.get(
  '/',
  requireAuth,
  requirePermission('reminder.view'),
  asyncRoute(async (req, res) => {
    const { page, pageSize } = parsePagination(req.query);
    const type = enumValue(stringQuery(req.query.type), REMINDER_TYPES, 'type');
    const status = enumValue(stringQuery(req.query.status), REMINDER_STATUSES, 'status');
    const where: Prisma.ReminderWhereInput = {
      recipientUserId: req.auth!.userId,
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.reminder.findMany({
        where,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.reminder.count({ where }),
    ]);
    const items = await Promise.all(
      rows.map(async (row) => toReminderDto(row, await userDisplayName(prisma, row.recipientUserId))),
    );
    sendPaginated(res, items, total, page, pageSize);
  }),
);

router.post(
  '/scan',
  requireAuth,
  requirePermission('contract.manage', 'probation.manage'),
  asyncRoute(async (req, res) => {
    const input = reminderScanSchema.parse(req.body ?? {});
    const from = today();
    const until = addDays(from, input.daysAhead);
    const [contracts, probations] = await Promise.all([
      input.type === 'PROBATION_REVIEW'
        ? Promise.resolve<ContractScanRow[]>([])
        : prisma.contract.findMany({
            where: {
              status: 'ACTIVE',
              endDate: { gte: from, lte: until },
            },
            include: { employee: employeeForReminderArgs },
            orderBy: { endDate: 'asc' },
          }),
      input.type === 'CONTRACT_EXPIRY'
        ? Promise.resolve<ProbationScanRow[]>([])
        : prisma.probationRecord.findMany({
            where: {
              outcome: 'PENDING',
              reviewDate: { gte: from, lte: until },
            },
            include: { employee: employeeForReminderArgs },
            orderBy: { reviewDate: 'asc' },
          }),
    ]);

    const targets: ReminderTarget[] = [];
    for (const contract of contracts) {
      if (!contract.endDate) continue;
      targets.push({
        type: 'CONTRACT_EXPIRY',
        permission: 'contract.view',
        entityType: 'Contract',
        entityId: contract.id,
        dueDate: contract.endDate,
        employee: contract.employee,
      });
    }
    for (const probation of probations) {
      targets.push({
        type: 'PROBATION_REVIEW',
        permission: 'probation.view',
        entityType: 'ProbationRecord',
        entityId: probation.id,
        dueDate: probation.reviewDate,
        employee: probation.employee,
      });
    }

    const candidateCache = new Map<string, CandidateUser[]>();
    const newRows: Prisma.ReminderCreateManyInput[] = [];

    for (const target of targets) {
      let candidates = candidateCache.get(target.permission);
      if (!candidates) {
        candidates = await findCandidateUsers(target.permission, from);
        candidateCache.set(target.permission, candidates);
      }
      const unitIds = currentUnitIds(target.employee);
      for (const user of candidates) {
        const ctx = await buildAccessContext(prisma, user, '', null, null);
        if (!canAccessEmployee(ctx, { id: target.employee.id, currentUnitIds: unitIds }, target.permission)) {
          continue;
        }
        const existing = await prisma.reminder.findUnique({
          where: {
            type_entityId_dueDate_recipientUserId: {
              type: target.type,
              entityId: target.entityId,
              dueDate: target.dueDate,
              recipientUserId: user.id,
            },
          },
          select: { id: true },
        });
        if (existing) continue;
        newRows.push({
          type: target.type,
          entityType: target.entityType,
          entityId: target.entityId,
          recipientUserId: user.id,
          dueDate: target.dueDate,
          status: 'PENDING',
          message: reminderMessage(target.type, target.dueDate),
        });
      }
    }

    const createdResult =
      newRows.length > 0
        ? await prisma.reminder.createMany({ data: newRows, skipDuplicates: true })
        : { count: 0 };

    for (const row of newRows) {
      await notifyUsers(prisma, [row.recipientUserId], {
        eventType: 'reminder.created',
        title:
          row.type === 'CONTRACT_EXPIRY' ? 'Contract expiry reminder' : 'Probation review reminder',
        safeSummary: row.message,
        relatedEntityType: row.entityType,
        relatedEntityId: row.entityId,
      });
    }

    await recordAudit({
      ...metadata(req),
      actorId: req.auth!.userId,
      action: 'reminder.scan',
      entityType: 'Reminder',
      after: {
        daysAhead: input.daysAhead,
        type: input.type ?? null,
        scanned: contracts.length + probations.length,
        created: createdResult.count,
      },
    });

    res.json({ created: createdResult.count, scanned: contracts.length + probations.length });
  }),
);

router.post(
  '/:id/send',
  requireAuth,
  requirePermission('reminder.view'),
  asyncRoute(async (req, res) => {
    const id = req.params.id as string;
    const reminder = await prisma.reminder.findUnique({ where: { id } });
    if (!reminder) throw notFound('Reminder not found');
    const isRecipient = reminder.recipientUserId === req.auth!.userId;
    const canManage =
      hasPermission(req.auth!, 'contract.manage') || hasPermission(req.auth!, 'probation.manage');
    if (!isRecipient && !canManage) throw forbidden('You cannot send this reminder');

    const sentAt = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.reminder.update({
        where: { id },
        data: { status: 'SENT', sentAt },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'reminder.sent',
          entityType: 'Reminder',
          entityId: id,
          before: auditFields(reminder, ['status', 'sentAt']),
          after: auditFields(row, ['status', 'sentAt']),
        },
        tx,
      );
      return row;
    });

    await notifyUsers(prisma, [updated.recipientUserId], {
      eventType: 'reminder.sent',
      title: reminder.type === 'CONTRACT_EXPIRY' ? 'Contract expiry reminder' : 'Probation review reminder',
      safeSummary: reminder.message,
      relatedEntityType: reminder.entityType,
      relatedEntityId: reminder.entityId,
    });
    res.json(toReminderDto(updated, await userDisplayName(prisma, updated.recipientUserId)));
  }),
);

router.post(
  '/:id/dismiss',
  requireAuth,
  requirePermission('reminder.view'),
  asyncRoute(async (req, res) => {
    const id = req.params.id as string;
    const reminder = await prisma.reminder.findUnique({ where: { id } });
    if (!reminder) throw notFound('Reminder not found');
    if (reminder.recipientUserId !== req.auth!.userId) {
      throw forbidden('Only the recipient can dismiss this reminder');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.reminder.update({ where: { id }, data: { status: 'DISMISSED' } });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'reminder.dismissed',
          entityType: 'Reminder',
          entityId: id,
          before: auditFields(reminder, ['status']),
          after: auditFields(row, ['status']),
        },
        tx,
      );
      return row;
    });
    res.json(toReminderDto(updated, await userDisplayName(prisma, updated.recipientUserId)));
  }),
);

export default router;
