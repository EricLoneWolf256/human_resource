import { randomBytes } from 'node:crypto';
import { Router, type Request } from 'express';
import type { Prisma, TrainingCourse } from '@prisma/client';
import { z } from 'zod';
import {
  employeeSkillCreateSchema,
  isTrainingTransitionAllowed,
  paginationSchema,
  trainingCompletionSchema,
  trainingCourseCreateSchema,
  trainingCourseUpdateSchema,
  trainingDecisionSchema,
  trainingQuerySchema,
  trainingRequestCreateSchema,
  trainingStatusSchema,
  TRAINING_COURSE_CATEGORIES,
  type EmployeeSkillDto,
  type TrainingCourseDto,
  type TrainingRecordDto,
  type TrainingRequestDto,
  type TrainingRequestStatus,
} from '@umu-hr/shared';
import { prisma } from '../db.js';
import { parseDate, toDateOnly, today } from '../dates.js';
import { asyncRoute, badRequest, conflict, forbidden, invalidTransition, notFound } from '../errors.js';
import { sendPaginated } from '../http.js';
import { requireAuth, requirePermission } from '../access/middleware.js';
import { canAccessEmployee, employeeWhere, hasPermission } from '../access/policy.js';
import { auditFields, recordAudit } from '../audit/service.js';
import { notifyUsers } from '../notifications/service.js';
import { currentUnitIds } from '../employees/service.js';
import {
  employeeName,
  metadata,
  requireEmployeeInScope,
  requireOwnEmployee,
  userDisplayName,
} from '../phase2/service.js';

const router = Router();

const activeFlag = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

const courseQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  category: z.enum(TRAINING_COURSE_CATEGORIES).optional(),
  active: activeFlag,
  isActive: activeFlag,
});

const recordQuerySchema = paginationSchema.extend({
  employeeId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
});

const skillQuerySchema = paginationSchema.extend({
  employeeId: z.string().uuid().optional(),
});

const employeeScopeSelect = {
  id: true,
  firstName: true,
  lastName: true,
  assignments: { select: { startDate: true, endDate: true, unitId: true } },
} satisfies Prisma.EmployeeSelect;

const courseTitleSelect = { title: true } satisfies Prisma.TrainingCourseSelect;

const trainingRequestInclude = {
  employee: { select: employeeScopeSelect },
  course: { select: courseTitleSelect },
} satisfies Prisma.TrainingRequestInclude;
type TrainingRequestRow = Prisma.TrainingRequestGetPayload<{ include: typeof trainingRequestInclude }>;

const trainingRecordInclude = {
  employee: { select: employeeScopeSelect },
  course: { select: courseTitleSelect },
} satisfies Prisma.TrainingRecordInclude;
type TrainingRecordRow = Prisma.TrainingRecordGetPayload<{ include: typeof trainingRecordInclude }>;

type ScopedEmployee = {
  assignments: { startDate: Date; endDate: Date | null; unitId: string }[];
};

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function dateOrNull(value: Date | null): string | null {
  return value ? toDateOnly(value) : null;
}

function toCourseDto(row: TrainingCourse): TrainingCourseDto {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    category: row.category,
    provider: row.provider,
    durationHours: row.durationHours,
    isActive: row.isActive,
  };
}

async function toRequestDto(row: TrainingRequestRow): Promise<TrainingRequestDto> {
  return {
    id: row.id,
    reference: row.reference,
    employeeId: row.employeeId,
    employeeName: employeeName(row.employee),
    courseId: row.courseId,
    courseTitle: row.course.title,
    reason: row.reason,
    neededBy: dateOrNull(row.neededBy),
    status: row.status,
    supervisorComment: row.supervisorComment,
    hrComment: row.hrComment,
    decidedByName: await userDisplayName(prisma, row.decidedById),
    decidedAt: isoOrNull(row.decidedAt),
    completedAt: dateOrNull(row.completedAt),
    createdAt: row.createdAt.toISOString(),
  };
}

function toRecordDto(row: TrainingRecordRow): TrainingRecordDto {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: employeeName(row.employee),
    courseId: row.courseId,
    courseTitle: row.course.title,
    requestId: row.requestId,
    completedAt: toDateOnly(row.completedAt),
    score: row.score,
    certificateNumber: row.certificateNumber,
    expiryDate: dateOrNull(row.expiryDate),
    createdAt: row.createdAt.toISOString(),
  };
}

function toSkillDto(row: {
  id: string;
  employeeId: string;
  name: string;
  certificateNumber: string | null;
  issuedAt: Date;
  expiryDate: Date | null;
}): EmployeeSkillDto {
  return {
    id: row.id,
    employeeId: row.employeeId,
    name: row.name,
    certificateNumber: row.certificateNumber,
    issuedAt: toDateOnly(row.issuedAt),
    expiryDate: dateOrNull(row.expiryDate),
    isExpired: row.expiryDate !== null && row.expiryDate < today(),
  };
}

function trainingEmployeeWhere(req: Request): Prisma.EmployeeWhereInput {
  return {
    OR: [
      { id: req.auth!.employeeId ?? '__none__' },
      employeeWhere(req.auth!, 'training.view'),
      employeeWhere(req.auth!, 'employee.view'),
    ],
  };
}

function canViewTrainingEmployee(req: Request, employeeId: string, employee: ScopedEmployee): boolean {
  const target = { id: employeeId, currentUnitIds: currentUnitIds(employee) };
  return (
    employeeId === req.auth!.employeeId ||
    canAccessEmployee(req.auth!, target, 'training.view') ||
    canAccessEmployee(req.auth!, target, 'employee.view')
  );
}

async function findRequestOrThrow(id: string): Promise<TrainingRequestRow> {
  const row = await prisma.trainingRequest.findUnique({ where: { id }, include: trainingRequestInclude });
  if (!row) throw notFound('Training request not found');
  return row;
}

function assertRequestVisibility(req: Request, row: TrainingRequestRow): void {
  if (!canViewTrainingEmployee(req, row.employeeId, row.employee)) {
    throw forbidden('This training request is outside your access scope');
  }
}

function nextTrainingReference(): string {
  return `TRN-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString('hex').toUpperCase()}`.slice(0, 30);
}

async function activeTrainingApproverIds(): Promise<string[]> {
  const now = today();
  const assignments = await prisma.roleAssignment.findMany({
    where: {
      revokedAt: null,
      role: { permissions: { some: { permissionKey: 'training.approve' } } },
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
    select: { userId: true },
  });
  const userIds = [...new Set(assignments.map((assignment) => assignment.userId))];
  if (userIds.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, status: 'ACTIVE' },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

async function employeeUserIds(employeeId: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { employeeId, status: 'ACTIVE' },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

router.post(
  '/courses',
  requireAuth,
  requirePermission('training.manage'),
  asyncRoute(async (req, res) => {
    const input = trainingCourseCreateSchema.parse(req.body);
    const duplicate = await prisma.trainingCourse.findUnique({
      where: { code: input.code },
      select: { id: true },
    });
    if (duplicate) throw conflict('A training course with this code already exists');
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.trainingCourse.create({ data: input });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'training.course_created',
          entityType: 'TrainingCourse',
          entityId: row.id,
          after: auditFields(input, ['code', 'title', 'category', 'provider', 'durationHours', 'isActive']),
        },
        tx,
      );
      return row;
    });
    res.status(201).json(toCourseDto(created));
  }),
);

router.get(
  '/courses',
  requireAuth,
  asyncRoute(async (req, res) => {
    const query = courseQuerySchema.parse(req.query);
    const activeOnly =
      query.active ?? query.isActive ?? (hasPermission(req.auth!, 'training.manage') ? undefined : true);
    const filters: Prisma.TrainingCourseWhereInput[] = [];
    if (activeOnly !== undefined) filters.push({ isActive: activeOnly });
    if (query.category) filters.push({ category: query.category });
    if (query.q) {
      filters.push({
        OR: [
          { code: { contains: query.q } },
          { title: { contains: query.q } },
          { provider: { contains: query.q } },
        ],
      });
    }
    const where: Prisma.TrainingCourseWhereInput = filters.length > 0 ? { AND: filters } : {};
    const [rows, total] = await Promise.all([
      prisma.trainingCourse.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.trainingCourse.count({ where }),
    ]);
    sendPaginated(res, rows.map(toCourseDto), total, query.page, query.pageSize);
  }),
);

router.get(
  '/courses/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const id = req.params.id as string;
    const row = await prisma.trainingCourse.findUnique({ where: { id } });
    if (!row || (!row.isActive && !hasPermission(req.auth!, 'training.manage'))) {
      throw notFound('Training course not found');
    }
    res.json(toCourseDto(row));
  }),
);

router.patch(
  '/courses/:id',
  requireAuth,
  requirePermission('training.manage'),
  asyncRoute(async (req, res) => {
    const id = req.params.id as string;
    const input = trainingCourseUpdateSchema.parse(req.body);
    const current = await prisma.trainingCourse.findUnique({ where: { id } });
    if (!current) throw notFound('Training course not found');
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.trainingCourse.update({ where: { id }, data: input });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'training.course_updated',
          entityType: 'TrainingCourse',
          entityId: id,
          before: auditFields(current, ['title', 'category', 'provider', 'durationHours', 'isActive']),
          after: auditFields(row, ['title', 'category', 'provider', 'durationHours', 'isActive']),
        },
        tx,
      );
      return row;
    });
    res.json(toCourseDto(updated));
  }),
);

router.post(
  '/requests',
  requireAuth,
  asyncRoute(async (req, res) => {
    const input = trainingRequestCreateSchema.parse(req.body);
    let employeeId: string;
    if (input.employeeId && input.employeeId !== req.auth!.employeeId) {
      if (!hasPermission(req.auth!, 'training.manage')) {
        throw forbidden('Only training managers can submit requests for another employee');
      }
      await requireEmployeeInScope(req, input.employeeId, 'training.manage');
      employeeId = input.employeeId;
    } else {
      employeeId = input.employeeId ?? requireOwnEmployee(req);
    }

    const course = await prisma.trainingCourse.findUnique({
      where: { id: input.courseId },
      select: { id: true, isActive: true },
    });
    if (!course || !course.isActive) throw notFound('Active training course not found');
    const reference = nextTrainingReference();

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.trainingRequest.create({
        data: {
          reference,
          employeeId,
          courseId: input.courseId,
          reason: input.reason,
          neededBy: input.neededBy ? parseDate(input.neededBy) : null,
          status: 'REQUESTED',
        },
        include: trainingRequestInclude,
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'training.request_submitted',
          entityType: 'TrainingRequest',
          entityId: row.id,
          after: { reference, employeeId, courseId: input.courseId, status: 'REQUESTED' },
        },
        tx,
      );
      await notifyUsers(tx, await activeTrainingApproverIds(), {
        eventType: 'training.approval_required',
        title: 'Training approval required',
        safeSummary: `Training request ${reference} is waiting for approval.`,
        relatedEntityType: 'TrainingRequest',
        relatedEntityId: row.id,
      });
      return row;
    });
    res.status(201).json(await toRequestDto(created));
  }),
);

router.get(
  '/requests',
  requireAuth,
  asyncRoute(async (req, res) => {
    const query = trainingQuerySchema.parse(req.query);
    const filters: Prisma.TrainingRequestWhereInput[] = [{ employee: trainingEmployeeWhere(req) }];
    if (query.status) filters.push({ status: query.status });
    if (query.employeeId) filters.push({ employeeId: query.employeeId });
    if (query.courseId) filters.push({ courseId: query.courseId });
    const where: Prisma.TrainingRequestWhereInput = { AND: filters };
    const [rows, total] = await Promise.all([
      prisma.trainingRequest.findMany({
        where,
        include: trainingRequestInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.trainingRequest.count({ where }),
    ]);
    const items = await Promise.all(rows.map((row) => toRequestDto(row)));
    sendPaginated(res, items, total, query.page, query.pageSize);
  }),
);

router.get(
  '/requests/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const row = await findRequestOrThrow(req.params.id as string);
    assertRequestVisibility(req, row);
    res.json(await toRequestDto(row));
  }),
);

router.post(
  '/requests/:id/decision',
  requireAuth,
  requirePermission('training.approve', 'training.manage'),
  asyncRoute(async (req, res) => {
    const input = trainingDecisionSchema.parse(req.body);
    const id = req.params.id as string;
    const current = await findRequestOrThrow(id);
    const target = { id: current.employeeId, currentUnitIds: currentUnitIds(current.employee) };
    if (
      !canAccessEmployee(req.auth!, target, 'training.approve') &&
      !canAccessEmployee(req.auth!, target, 'training.manage')
    ) {
      throw forbidden('This training request is outside your access scope');
    }

    const status: TrainingRequestStatus =
      input.action === 'RECOMMEND' ? 'RECOMMENDED' : input.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    if (!isTrainingTransitionAllowed(current.status, status)) {
      throw invalidTransition(`Cannot change training request status from ${current.status} to ${status}`);
    }

    const timestamp = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.trainingRequest.update({
        where: { id },
        data: {
          status,
          supervisorComment: input.action === 'RECOMMEND' ? input.comment : current.supervisorComment,
          hrComment: input.action === 'RECOMMEND' ? current.hrComment : input.comment,
          decidedById: req.auth!.userId,
          decidedAt: timestamp,
        },
        include: trainingRequestInclude,
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action:
            input.action === 'RECOMMEND'
              ? 'training.request_recommended'
              : `training.request_${input.action.toLowerCase()}d`,
          entityType: 'TrainingRequest',
          entityId: id,
          reason: input.comment,
          before: auditFields(current, ['status', 'supervisorComment', 'hrComment', 'decidedById', 'decidedAt']),
          after: auditFields(row, ['status', 'supervisorComment', 'hrComment', 'decidedById', 'decidedAt']),
        },
        tx,
      );
      await notifyUsers(tx, await employeeUserIds(current.employeeId), {
        eventType: 'training.decision',
        title: 'Training request update',
        safeSummary: `Your training request ${current.reference} is now ${status.toLowerCase()}.`,
        relatedEntityType: 'TrainingRequest',
        relatedEntityId: id,
      });
      if (status === 'RECOMMENDED') {
        await notifyUsers(tx, await activeTrainingApproverIds(), {
          eventType: 'training.approval_required',
          title: 'Training approval required',
          safeSummary: `Training request ${current.reference} requires approval.`,
          relatedEntityType: 'TrainingRequest',
          relatedEntityId: id,
        });
      }
      return row;
    });
    res.json(await toRequestDto(updated));
  }),
);

router.post(
  '/requests/:id/status',
  requireAuth,
  requirePermission('training.manage'),
  asyncRoute(async (req, res) => {
    const input = trainingStatusSchema.parse(req.body);
    if (!['REGISTERED', 'CANCELLED'].includes(input.status)) {
      throw badRequest('Use the decision endpoint for approval, rejection and completion statuses');
    }
    const id = req.params.id as string;
    const current = await findRequestOrThrow(id);
    await requireEmployeeInScope(req, current.employeeId, 'training.manage');
    if (!isTrainingTransitionAllowed(current.status, input.status)) {
      throw invalidTransition(`Cannot change training request status from ${current.status} to ${input.status}`);
    }
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.trainingRequest.update({
        where: { id },
        data: {
          status: input.status,
          ...(input.comment ? { hrComment: input.comment } : {}),
        },
        include: trainingRequestInclude,
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'training.status_changed',
          entityType: 'TrainingRequest',
          entityId: id,
          reason: input.comment ?? null,
          before: auditFields(current, ['status', 'hrComment']),
          after: auditFields(row, ['status', 'hrComment']),
        },
        tx,
      );
      return row;
    });
    await notifyUsers(prisma, await employeeUserIds(current.employeeId), {
      eventType: 'training.status_changed',
      title: 'Training request update',
      safeSummary: `Your training request ${current.reference} is now ${input.status.toLowerCase()}.`,
      relatedEntityType: 'TrainingRequest',
      relatedEntityId: id,
    });
    res.json(await toRequestDto(updated));
  }),
);

router.post(
  '/requests/:id/complete',
  requireAuth,
  requirePermission('training.manage'),
  asyncRoute(async (req, res) => {
    const input = trainingCompletionSchema.parse(req.body);
    const id = req.params.id as string;
    const current = await findRequestOrThrow(id);
    await requireEmployeeInScope(req, current.employeeId, 'training.manage');
    if (current.status !== 'APPROVED' && current.status !== 'REGISTERED') {
      throw conflict('Training request must be approved or registered before completion');
    }

    const completedAt = parseDate(input.completedAt);
    const duplicate = await prisma.trainingRecord.findUnique({
      where: {
        employeeId_courseId_completedAt: {
          employeeId: current.employeeId,
          courseId: current.courseId,
          completedAt,
        },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw conflict('A training record already exists for this employee, course and completion date');
    }

    const expiryDate = input.expiryDate ? parseDate(input.expiryDate) : null;
    const updated = await prisma.$transaction(async (tx) => {
      try {
        await tx.trainingRecord.create({
          data: {
            employeeId: current.employeeId,
            courseId: current.courseId,
            requestId: id,
            completedAt,
            score: input.score ?? null,
            certificateNumber: input.certificateNumber ?? null,
            expiryDate,
          },
        });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          throw conflict('A training record already exists for this employee, course and completion date');
        }
        throw error;
      }
      if (input.skillName) {
        await tx.employeeSkill.create({
          data: {
            employeeId: current.employeeId,
            name: input.skillName,
            certificateNumber: input.certificateNumber ?? null,
            issuedAt: completedAt,
            expiryDate,
          },
        });
      }
      const row = await tx.trainingRequest.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt },
        include: trainingRequestInclude,
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'training.completed',
          entityType: 'TrainingRequest',
          entityId: id,
          before: auditFields(current, ['status', 'completedAt']),
          after: auditFields(row, ['status', 'completedAt']),
        },
        tx,
      );
      await notifyUsers(tx, await employeeUserIds(current.employeeId), {
        eventType: 'training.completed',
        title: 'Training completed',
        safeSummary: `Your training request ${current.reference} has been recorded as completed.`,
        relatedEntityType: 'TrainingRequest',
        relatedEntityId: id,
      });
      return row;
    });
    res.json(await toRequestDto(updated));
  }),
);

router.get(
  '/records',
  requireAuth,
  asyncRoute(async (req, res) => {
    const query = recordQuerySchema.parse(req.query);
    const filters: Prisma.TrainingRecordWhereInput[] = [{ employee: trainingEmployeeWhere(req) }];
    if (query.employeeId) filters.push({ employeeId: query.employeeId });
    if (query.courseId) filters.push({ courseId: query.courseId });
    const where: Prisma.TrainingRecordWhereInput = { AND: filters };
    const [rows, total] = await Promise.all([
      prisma.trainingRecord.findMany({
        where,
        include: trainingRecordInclude,
        orderBy: { completedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.trainingRecord.count({ where }),
    ]);
    sendPaginated(res, rows.map(toRecordDto), total, query.page, query.pageSize);
  }),
);

router.get(
  '/skills',
  requireAuth,
  asyncRoute(async (req, res) => {
    const query = skillQuerySchema.parse(req.query);
    const filters: Prisma.EmployeeSkillWhereInput[] = [{ employee: trainingEmployeeWhere(req) }];
    if (query.employeeId) filters.push({ employeeId: query.employeeId });
    const where: Prisma.EmployeeSkillWhereInput = { AND: filters };
    const [rows, total] = await Promise.all([
      prisma.employeeSkill.findMany({
        where,
        orderBy: { issuedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.employeeSkill.count({ where }),
    ]);
    sendPaginated(res, rows.map(toSkillDto), total, query.page, query.pageSize);
  }),
);

router.post(
  '/skills',
  requireAuth,
  requirePermission('training.manage'),
  asyncRoute(async (req, res) => {
    const input = employeeSkillCreateSchema.parse(req.body);
    await requireEmployeeInScope(req, input.employeeId, 'training.manage');
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.employeeSkill.create({
        data: {
          employeeId: input.employeeId,
          name: input.name,
          certificateNumber: input.certificateNumber ?? null,
          issuedAt: parseDate(input.issuedAt),
          expiryDate: input.expiryDate ? parseDate(input.expiryDate) : null,
        },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'training.skill_created',
          entityType: 'EmployeeSkill',
          entityId: row.id,
          after: auditFields(input, ['employeeId', 'name', 'certificateNumber', 'issuedAt', 'expiryDate']),
        },
        tx,
      );
      return row;
    });
    res.status(201).json(toSkillDto(created));
  }),
);

export default router;
