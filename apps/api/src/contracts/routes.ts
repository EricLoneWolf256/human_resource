import { Router, type Request } from 'express';
import type { Prisma } from '@prisma/client';
import {
  CONTRACT_STATUSES,
  CONTRACT_TYPES,
  PROBATION_OUTCOMES,
  contractCreateSchema,
  contractUpdateSchema,
  probationCreateSchema,
  probationReviewSchema,
  type ContractDto,
  type ContractStatus,
  type ContractType,
  type ProbationOutcome,
  type ProbationRecordDto,
} from '@umu-hr/shared';
import { prisma } from '../db.js';
import { addDays, parseDate, toDateOnly, today } from '../dates.js';
import { asyncRoute, badRequest, notFound } from '../errors.js';
import { sendPaginated } from '../http.js';
import { requireAuth, requirePermission } from '../access/middleware.js';
import { auditFields, recordAudit } from '../audit/service.js';
import { notifyUsers } from '../notifications/service.js';
import {
  accessibleEmployeeWhere,
  employeeName,
  metadata,
  requireEmployeeInScope,
  userDisplayName,
} from '../phase2/service.js';

const router = Router();

interface Pagination {
  page: number;
  pageSize: number;
}

interface ContractFilters {
  employeeId?: string;
  status?: ContractStatus;
  type?: ContractType;
  q?: string;
}

const employeeNameSelect = { firstName: true, lastName: true } satisfies Prisma.EmployeeSelect;

const contractInclude = { employee: { select: employeeNameSelect } } satisfies Prisma.ContractInclude;
type ContractRow = Prisma.ContractGetPayload<{ include: typeof contractInclude }>;

const probationInclude = { employee: { select: employeeNameSelect } } satisfies Prisma.ProbationRecordInclude;
type ProbationRow = Prisma.ProbationRecordGetPayload<{ include: typeof probationInclude }>;

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

function parseDaysAhead(query: Request['query']): number {
  const raw = stringQuery(query.daysAhead);
  if (raw === undefined) return 30;
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw badRequest('daysAhead must be an integer between 1 and 365');
  }
  return days;
}

function contractFilters(req: Request): ContractFilters {
  return {
    employeeId: stringQuery(req.query.employeeId),
    status: enumValue(stringQuery(req.query.status), CONTRACT_STATUSES, 'status'),
    type: enumValue(stringQuery(req.query.type), CONTRACT_TYPES, 'type'),
    q: stringQuery(req.query.q),
  };
}

function contractWhere(req: Request, filters: ContractFilters): Prisma.ContractWhereInput {
  const conditions: Prisma.ContractWhereInput[] = [
    { employee: accessibleEmployeeWhere(req, 'contract.view') },
  ];
  if (filters.employeeId) conditions.push({ employeeId: filters.employeeId });
  if (filters.status) conditions.push({ status: filters.status });
  if (filters.type) conditions.push({ type: filters.type });
  if (filters.q) {
    conditions.push({
      OR: [
        { id: { contains: filters.q } },
        { notes: { contains: filters.q } },
        { employee: { staffNumber: { contains: filters.q } } },
        { employee: { firstName: { contains: filters.q } } },
        { employee: { lastName: { contains: filters.q } } },
      ],
    });
  }
  return { AND: conditions };
}

function probationWhere(
  req: Request,
  employeeId: string | undefined,
  outcome: ProbationOutcome | undefined,
): Prisma.ProbationRecordWhereInput {
  const conditions: Prisma.ProbationRecordWhereInput[] = [
    { employee: accessibleEmployeeWhere(req, 'probation.view') },
  ];
  if (employeeId) conditions.push({ employeeId });
  if (outcome) conditions.push({ outcome });
  return { AND: conditions };
}

function toContractDto(row: ContractRow): ContractDto {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: employeeName(row.employee),
    type: row.type,
    status: row.status,
    renewalStatus: row.renewalStatus,
    startDate: toDateOnly(row.startDate),
    endDate: row.endDate ? toDateOnly(row.endDate) : null,
    documentId: row.documentId,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function toProbationDto(row: ProbationRow, reviewedByName: string | null): ProbationRecordDto {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: employeeName(row.employee),
    startDate: toDateOnly(row.startDate),
    endDate: toDateOnly(row.endDate),
    reviewDate: toDateOnly(row.reviewDate),
    outcome: row.outcome,
    notes: row.notes,
    reviewedByName,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
  };
}

async function toProbationDtos(rows: ProbationRow[]): Promise<ProbationRecordDto[]> {
  return Promise.all(
    rows.map(async (row) => toProbationDto(row, await userDisplayName(prisma, row.reviewedById))),
  );
}

router.get(
  '/expiring',
  requireAuth,
  requirePermission('contract.view'),
  asyncRoute(async (req, res) => {
    const { page, pageSize } = parsePagination(req.query);
    const daysAhead = parseDaysAhead(req.query);
    const from = today();
    const where: Prisma.ContractWhereInput = {
      AND: [
        { employee: accessibleEmployeeWhere(req, 'contract.view') },
        { status: 'ACTIVE' },
        { endDate: { gte: from, lte: addDays(from, daysAhead) } },
      ],
    };
    const [rows, total] = await Promise.all([
      prisma.contract.findMany({
        where,
        include: contractInclude,
        orderBy: [{ endDate: 'asc' }, { startDate: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.contract.count({ where }),
    ]);
    sendPaginated(res, rows.map(toContractDto), total, page, pageSize);
  }),
);

router.get(
  '/',
  requireAuth,
  requirePermission('contract.view'),
  asyncRoute(async (req, res) => {
    const { page, pageSize } = parsePagination(req.query);
    const where = contractWhere(req, contractFilters(req));
    const [rows, total] = await Promise.all([
      prisma.contract.findMany({
        where,
        include: contractInclude,
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.contract.count({ where }),
    ]);
    sendPaginated(res, rows.map(toContractDto), total, page, pageSize);
  }),
);

router.post(
  '/',
  requireAuth,
  requirePermission('contract.manage'),
  asyncRoute(async (req, res) => {
    const input = contractCreateSchema.parse(req.body);
    await requireEmployeeInScope(req, input.employeeId, 'contract.view');
    if (
      input.documentId &&
      !(await prisma.document.findUnique({ where: { id: input.documentId }, select: { id: true } }))
    ) {
      throw notFound('Document not found');
    }

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.contract.create({
        data: {
          employeeId: input.employeeId,
          type: input.type,
          status: input.status,
          renewalStatus: input.renewalStatus,
          startDate: parseDate(input.startDate),
          endDate: input.endDate ? parseDate(input.endDate) : null,
          documentId: input.documentId ?? null,
          notes: input.notes ?? null,
          createdById: req.auth!.userId,
        },
        include: contractInclude,
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'contract.created',
          entityType: 'Contract',
          entityId: row.id,
          after: auditFields(row, [
            'employeeId',
            'type',
            'status',
            'renewalStatus',
            'startDate',
            'endDate',
            'documentId',
            'notes',
          ]),
        },
        tx,
      );
      return row;
    });
    res.status(201).json(toContractDto(created));
  }),
);

router.get(
  '/probations',
  requireAuth,
  requirePermission('probation.view'),
  asyncRoute(async (req, res) => {
    const { page, pageSize } = parsePagination(req.query);
    const employeeId = stringQuery(req.query.employeeId);
    const outcome = enumValue(stringQuery(req.query.outcome), PROBATION_OUTCOMES, 'outcome');
    const where = probationWhere(req, employeeId, outcome);
    const [rows, total] = await Promise.all([
      prisma.probationRecord.findMany({
        where,
        include: probationInclude,
        orderBy: [{ reviewDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.probationRecord.count({ where }),
    ]);
    sendPaginated(res, await toProbationDtos(rows), total, page, pageSize);
  }),
);

router.post(
  '/probations',
  requireAuth,
  requirePermission('probation.manage'),
  asyncRoute(async (req, res) => {
    const input = probationCreateSchema.parse(req.body);
    await requireEmployeeInScope(req, input.employeeId, 'probation.view');
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.probationRecord.create({
        data: {
          employeeId: input.employeeId,
          startDate: parseDate(input.startDate),
          endDate: parseDate(input.endDate),
          reviewDate: parseDate(input.reviewDate),
          notes: input.notes ?? null,
        },
        include: probationInclude,
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'probation.created',
          entityType: 'ProbationRecord',
          entityId: row.id,
          after: auditFields(row, ['employeeId', 'startDate', 'endDate', 'reviewDate', 'notes']),
        },
        tx,
      );
      return row;
    });
    res.status(201).json(toProbationDto(created, await userDisplayName(prisma, created.reviewedById)));
  }),
);

router.post(
  '/probations/:id/review',
  requireAuth,
  requirePermission('probation.manage'),
  asyncRoute(async (req, res) => {
    const input = probationReviewSchema.parse(req.body);
    const id = req.params.id as string;
    const existing = await prisma.probationRecord.findUnique({ where: { id }, include: probationInclude });
    if (!existing) throw notFound('Probation record not found');
    await requireEmployeeInScope(req, existing.employeeId, 'probation.view');

    const reviewedAt = new Date();
    const data: Prisma.ProbationRecordUpdateInput = {
      outcome: input.outcome,
      notes: input.notes ?? null,
      reviewedBy: { connect: { id: req.auth!.userId } },
      reviewedAt,
    };
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.probationRecord.update({ where: { id }, data, include: probationInclude });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'probation.reviewed',
          entityType: 'ProbationRecord',
          entityId: id,
          before: auditFields(existing, ['outcome', 'notes', 'reviewedById', 'reviewedAt']),
          after: {
            ...auditFields(row, ['outcome', 'notes', 'reviewedById', 'reviewedAt']),
            effectiveDate: input.effectiveDate ?? null,
          },
        },
        tx,
      );
      return row;
    });

    const linkedUser = await prisma.user.findFirst({
      where: { employeeId: existing.employeeId },
      select: { id: true },
    });
    if (linkedUser) {
      await notifyUsers(prisma, [linkedUser.id], {
        eventType: 'probation.reviewed',
        title: 'Probation review recorded',
        safeSummary: 'Your probation review outcome has been recorded. Contact HR for details.',
        relatedEntityType: 'ProbationRecord',
        relatedEntityId: id,
      });
    }
    res.json(toProbationDto(updated, await userDisplayName(prisma, updated.reviewedById)));
  }),
);

router.patch(
  '/:id',
  requireAuth,
  requirePermission('contract.manage'),
  asyncRoute(async (req, res) => {
    const input = contractUpdateSchema.parse(req.body);
    const id = req.params.id as string;
    const existing = await prisma.contract.findUnique({ where: { id }, include: contractInclude });
    if (!existing) throw notFound('Contract not found');
    await requireEmployeeInScope(req, existing.employeeId, 'contract.view');
    if (
      input.documentId &&
      !(await prisma.document.findUnique({ where: { id: input.documentId }, select: { id: true } }))
    ) {
      throw notFound('Document not found');
    }

    const data: Prisma.ContractUpdateInput = {
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.startDate !== undefined ? { startDate: parseDate(input.startDate) } : {}),
      ...(input.endDate !== undefined
        ? { endDate: input.endDate ? parseDate(input.endDate) : null }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.renewalStatus !== undefined ? { renewalStatus: input.renewalStatus } : {}),
      ...(input.documentId !== undefined ? { documentId: input.documentId } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    };
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.contract.update({ where: { id }, data, include: contractInclude });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'contract.updated',
          entityType: 'Contract',
          entityId: id,
          before: auditFields(existing, Object.keys(data)),
          after: auditFields(row, Object.keys(data)),
        },
        tx,
      );
      return row;
    });
    res.json(toContractDto(updated));
  }),
);

export default router;
