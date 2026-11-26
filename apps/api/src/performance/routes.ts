import { Router, type Request, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import {
  appraisalCycleCreateSchema,
  appraisalCycleUpdateSchema,
  appraisalCreateSchema,
  appraisalFinalizeSchema,
  appraisalQuerySchema,
  appraisalReviewSchema,
  appraisalSelfReviewSchema,
  isAppraisalTransitionAllowed,
  type AppraisalCycleDto,
  type AppraisalDto,
  type AppraisalObjectiveDto,
} from '@umu-hr/shared';
import { prisma } from '../db.js';
import { isCurrent, parseDate, today, toDateOnly } from '../dates.js';
import { asyncRoute, conflict, forbidden, invalidTransition, notFound } from '../errors.js';
import { sendPaginated } from '../http.js';
import { requireAuth, requirePermission } from '../access/middleware.js';
import { canAccessEmployee, effectiveGrantsFor, employeeWhere, hasPermission } from '../access/policy.js';
import { auditFields, recordAudit } from '../audit/service.js';
import { notifyUsers } from '../notifications/service.js';
import { currentUnitIds, findEmployeeOrThrow } from '../employees/service.js';
import { employeeName, metadata } from '../phase2/service.js';

const router = Router();

const cycleInclude = {
  _count: { select: { appraisals: true } },
} satisfies Prisma.AppraisalCycleInclude;

type CycleRow = Prisma.AppraisalCycleGetPayload<{ include: typeof cycleInclude }>;

const appraisalInclude = {
  cycle: { select: { id: true, name: true } },
  employee: {
    select: {
      id: true,
      staffNumber: true,
      firstName: true,
      lastName: true,
      assignments: { select: { unitId: true, startDate: true, endDate: true } },
    },
  },
  objectives: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.AppraisalInclude;

type AppraisalRow = Prisma.AppraisalGetPayload<{ include: typeof appraisalInclude }>;
type CycleStatus = AppraisalCycleDto['status'];

const REVIEW_TRANSITIONS = {
  SUPERVISOR: { from: 'SELF_REVIEW', to: 'SUPERVISOR_REVIEW' },
  HOD: { from: 'SUPERVISOR_REVIEW', to: 'HOD_REVIEW' },
  HR: { from: 'HOD_REVIEW', to: 'HR_VALIDATION' },
} as const;

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function parsePositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function canChangeCycleStatus(from: CycleStatus, to: CycleStatus): boolean {
  if (from === to) return true;
  if (to === 'OPEN') return from === 'DRAFT';
  if (to === 'CLOSED') return from === 'OPEN';
  if (to === 'ARCHIVED') return from === 'CLOSED';
  return false;
}

function toCycleDto(row: CycleRow): AppraisalCycleDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    templateType: row.templateType,
    startDate: toDateOnly(row.startDate),
    endDate: toDateOnly(row.endDate),
    status: row.status,
    appraisalCount: row._count.appraisals,
  };
}

function toObjectiveDto(objective: {
  id: string;
  title: string;
  target: string;
  weight: number;
  selfRating: number | null;
  supervisorRating: number | null;
}): AppraisalObjectiveDto {
  return {
    id: objective.id,
    title: objective.title,
    target: objective.target,
    weight: objective.weight,
    selfRating: objective.selfRating,
    supervisorRating: objective.supervisorRating,
  };
}

function toAppraisalDto(row: AppraisalRow): AppraisalDto {
  return {
    id: row.id,
    cycleId: row.cycleId,
    cycleName: row.cycle.name,
    employeeId: row.employeeId,
    employeeName: employeeName(row.employee),
    staffNumber: row.employee.staffNumber,
    templateType: row.templateType,
    status: row.status,
    objectives: row.objectives.map(toObjectiveDto),
    selfRating: row.selfRating,
    selfComment: row.selfComment,
    supervisorRating: row.supervisorRating,
    supervisorComment: row.supervisorComment,
    hodRating: row.hodRating,
    hodComment: row.hodComment,
    hrComment: row.hrComment,
    finalRating: row.finalRating,
    finalComment: row.finalComment,
    developmentPlan: row.developmentPlan,
    submittedAt: isoOrNull(row.submittedAt),
    finalizedAt: isoOrNull(row.finalizedAt),
    createdAt: row.createdAt.toISOString(),
  };
}

function hasInstitutionGrant(req: Request, permission: string): boolean {
  return effectiveGrantsFor(req.auth!, permission).some((grant) => grant.all);
}

async function cycleScopeWhere(req: Request): Promise<Prisma.AppraisalCycleWhereInput> {
  if (hasInstitutionGrant(req, 'appraisal.view')) return {};
  const employees = await prisma.employee.findMany({
    where: employeeWhere(req.auth!, 'employee.view'),
    select: { id: true },
  });
  const employeesInScope = employees.map((employee) => employee.id);
  const users = employeesInScope.length
    ? await prisma.user.findMany({
        where: { employeeId: { in: employeesInScope } },
        select: { id: true },
      })
    : [];
  const userIds = [...new Set([...users.map((user) => user.id), req.auth!.userId])];
  return { createdById: { in: userIds } };
}

async function findCycleOrThrow(req: Request, id: string): Promise<CycleRow> {
  const cycle = await prisma.appraisalCycle.findFirst({
    where: { id, ...(await cycleScopeWhere(req)) },
    include: cycleInclude,
  });
  if (!cycle) throw notFound('Appraisal cycle not found');
  return cycle;
}

async function changeCycleStatus(req: Request, res: Response, target: CycleStatus): Promise<void> {
  const id = req.params.id as string;
  const current = await findCycleOrThrow(req, id);
  if (!canChangeCycleStatus(current.status, target)) {
    throw invalidTransition(`Cannot change appraisal cycle status from ${current.status} to ${target}`);
  }
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.appraisalCycle.update({
      where: { id },
      data: { status: target },
      include: cycleInclude,
    });
    await recordAudit(
      {
        ...metadata(req),
        actorId: req.auth!.userId,
        action: `performance.cycle_${target.toLowerCase()}`,
        entityType: 'AppraisalCycle',
        entityId: id,
        before: { status: current.status },
        after: { status: target },
      },
      tx,
    );
    return row;
  });
  res.json(toCycleDto(updated));
}

function appraisalVisibilityWhere(req: Request): Prisma.AppraisalWhereInput {
  return {
    employee: {
      OR: [
        employeeWhere(req.auth!, 'appraisal.view'),
        employeeWhere(req.auth!, 'employee.view'),
        { id: req.auth!.employeeId ?? '__none__' },
      ],
    },
  };
}

function canViewAppraisal(req: Request, row: AppraisalRow): boolean {
  const target = { id: row.employeeId, currentUnitIds: currentUnitIds(row.employee) };
  return (
    row.employeeId === req.auth!.employeeId ||
    canAccessEmployee(req.auth!, target, 'appraisal.view') ||
    canAccessEmployee(req.auth!, target, 'employee.view')
  );
}

async function findAppraisalOrThrow(id: string): Promise<AppraisalRow> {
  const appraisal = await prisma.appraisal.findUnique({ where: { id }, include: appraisalInclude });
  if (!appraisal) throw notFound('Appraisal not found');
  return appraisal;
}

async function userIdsForEmployee(employeeId: string): Promise<string[]> {
  const users = await prisma.user.findMany({ where: { employeeId }, select: { id: true } });
  return users.map((user) => user.id);
}

async function hrReviewerUserIds(): Promise<string[]> {
  const now = today();
  const assignments = await prisma.roleAssignment.findMany({
    where: {
      revokedAt: null,
      scopeType: 'INSTITUTION',
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
      role: { permissions: { some: { permissionKey: 'appraisal.finalize' } } },
    },
    select: { userId: true },
  });
  return [...new Set(assignments.map((assignment) => assignment.userId))];
}

router.post(
  '/cycles',
  requireAuth,
  requirePermission('appraisal.create'),
  asyncRoute(async (req, res) => {
    const input = appraisalCycleCreateSchema.parse(req.body);
    const existing = await prisma.appraisalCycle.findUnique({ where: { code: input.code }, select: { id: true } });
    if (existing) throw conflict('Appraisal cycle code already exists');
    const cycle = await prisma.$transaction(async (tx) => {
      const row = await tx.appraisalCycle.create({
        data: {
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          templateType: input.templateType,
          startDate: parseDate(input.startDate),
          endDate: parseDate(input.endDate),
          status: 'DRAFT',
          createdById: req.auth!.userId,
        },
        include: cycleInclude,
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'performance.cycle_created',
          entityType: 'AppraisalCycle',
          entityId: row.id,
          after: {
            code: input.code,
            name: input.name,
            templateType: input.templateType,
            startDate: input.startDate,
            endDate: input.endDate,
            status: 'DRAFT',
          },
        },
        tx,
      );
      return row;
    });
    res.status(201).json(toCycleDto(cycle));
  }),
);

router.get(
  '/cycles',
  requireAuth,
  requirePermission('appraisal.view'),
  asyncRoute(async (req, res) => {
    const page = parsePositiveInt(req.query.page, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = parsePositiveInt(req.query.pageSize, 20, 100);
    const status = req.query.status
      ? appraisalCycleUpdateSchema.shape.status.parse(req.query.status)
      : undefined;
    const where: Prisma.AppraisalCycleWhereInput = {
      AND: [await cycleScopeWhere(req), ...(status ? [{ status }] : [])],
    };
    const [rows, total] = await Promise.all([
      prisma.appraisalCycle.findMany({
        where,
        include: cycleInclude,
        orderBy: { startDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.appraisalCycle.count({ where }),
    ]);
    sendPaginated(
      res,
      rows.map(toCycleDto),
      total,
      page,
      pageSize,
    );
  }),
);

router.get(
  '/cycles/:id',
  requireAuth,
  requirePermission('appraisal.view'),
  asyncRoute(async (req, res) => {
    const cycle = await findCycleOrThrow(req, req.params.id as string);
    res.json(toCycleDto(cycle));
  }),
);

router.patch(
  '/cycles/:id',
  requireAuth,
  requirePermission('appraisal.create'),
  asyncRoute(async (req, res) => {
    const id = req.params.id as string;
    const input = appraisalCycleUpdateSchema.parse(req.body);
    const current = await findCycleOrThrow(req, id);
    if (input.status && !canChangeCycleStatus(current.status, input.status)) {
      throw invalidTransition(`Cannot change appraisal cycle status from ${current.status} to ${input.status}`);
    }
    const nextStart = input.startDate ? parseDate(input.startDate) : current.startDate;
    const nextEnd = input.endDate ? parseDate(input.endDate) : current.endDate;
    if (nextEnd < nextStart) throw conflict('End date must be on or after start date');
    const data: Prisma.AppraisalCycleUpdateInput = {
      ...input,
      startDate: input.startDate ? nextStart : undefined,
      endDate: input.endDate ? nextEnd : undefined,
    };
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.appraisalCycle.update({
        where: { id },
        data,
        include: cycleInclude,
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action:
            input.status && input.status !== current.status
              ? `performance.cycle_${input.status.toLowerCase()}`
              : 'performance.cycle_updated',
          entityType: 'AppraisalCycle',
          entityId: id,
          before: auditFields(current, ['name', 'description', 'templateType', 'startDate', 'endDate', 'status']),
          after: auditFields(row, ['name', 'description', 'templateType', 'startDate', 'endDate', 'status']),
        },
        tx,
      );
      return row;
    });
    res.json(toCycleDto(updated));
  }),
);

router.post(
  '/cycles/:id/open',
  requireAuth,
  requirePermission('appraisal.create'),
  asyncRoute(async (req, res) => {
    await changeCycleStatus(req, res, 'OPEN');
  }),
);

router.post(
  '/cycles/:id/close',
  requireAuth,
  requirePermission('appraisal.create'),
  asyncRoute(async (req, res) => {
    await changeCycleStatus(req, res, 'CLOSED');
  }),
);

router.post(
  '/cycles/:id/archive',
  requireAuth,
  requirePermission('appraisal.create'),
  asyncRoute(async (req, res) => {
    await changeCycleStatus(req, res, 'ARCHIVED');
  }),
);

router.post(
  '/appraisals',
  requireAuth,
  requirePermission('appraisal.create'),
  asyncRoute(async (req, res) => {
    const input = appraisalCreateSchema.parse(req.body);
    const cycle = await prisma.appraisalCycle.findUnique({ where: { id: input.cycleId } });
    if (!cycle) throw notFound('Appraisal cycle not found');
    if (cycle.status !== 'OPEN') throw conflict('Appraisals can only be created for open cycles');
    const employee = await findEmployeeOrThrow(input.employeeId);
    const target = { id: employee.id, currentUnitIds: currentUnitIds(employee) };
    if (
      !canAccessEmployee(req.auth!, target, 'employee.view') &&
      !canAccessEmployee(req.auth!, target, 'appraisal.view')
    ) {
      throw forbidden('This employee record is outside your access scope');
    }
    const duplicate = await prisma.appraisal.findUnique({
      where: { cycleId_employeeId: { cycleId: input.cycleId, employeeId: input.employeeId } },
      select: { id: true },
    });
    if (duplicate) throw conflict('An appraisal already exists for this employee and cycle');

    const currentAssignments = employee.assignments.filter((assignment) => isCurrent(assignment));
    const assignment =
      currentAssignments.find((item) => item.assignmentType === 'PRIMARY') ?? currentAssignments[0];
    const supervisorUserId = assignment?.supervisorEmployeeId
      ? (await prisma.user.findFirst({
          where: { employeeId: assignment.supervisorEmployeeId },
          select: { id: true },
        }))?.id ?? null
      : null;
    let hodUserId: string | null = null;
    if (assignment?.unitId) {
      const unit = await prisma.orgUnit.findUnique({
        where: { id: assignment.unitId },
        select: { headEmployeeId: true },
      });
      if (unit?.headEmployeeId) {
        hodUserId =
          (await prisma.user.findFirst({
            where: { employeeId: unit.headEmployeeId },
            select: { id: true },
          }))?.id ?? null;
      }
    }
    const employeeRecipients = await userIdsForEmployee(input.employeeId);

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.appraisal.create({
        data: {
          cycleId: cycle.id,
          employeeId: employee.id,
          supervisorUserId,
          hodUserId,
          templateType: cycle.templateType,
          status: 'DRAFT',
          objectives: {
            create: input.objectives.map((objective) => ({
              title: objective.title,
              target: objective.target,
              weight: objective.weight,
            })),
          },
        },
        include: appraisalInclude,
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'performance.appraisal_created',
          entityType: 'Appraisal',
          entityId: row.id,
          after: {
            cycleId: cycle.id,
            employeeId: employee.id,
            templateType: cycle.templateType,
            status: 'DRAFT',
            objectiveCount: input.objectives.length,
          },
        },
        tx,
      );
      await notifyUsers(tx, employeeRecipients, {
        eventType: 'performance.appraisal_created',
        title: 'Appraisal created',
        safeSummary: `An appraisal for the ${cycle.name} cycle has been created.`,
        relatedEntityType: 'Appraisal',
        relatedEntityId: row.id,
      });
      return row;
    });
    res.status(201).json(toAppraisalDto(created));
  }),
);

router.get(
  '/appraisals',
  requireAuth,
  requirePermission('appraisal.view'),
  asyncRoute(async (req, res) => {
    const query = appraisalQuerySchema.parse(req.query);
    const filters: Prisma.AppraisalWhereInput[] = [appraisalVisibilityWhere(req)];
    if (query.cycleId) filters.push({ cycleId: query.cycleId });
    if (query.employeeId) filters.push({ employeeId: query.employeeId });
    if (query.status) filters.push({ status: query.status });
    const where: Prisma.AppraisalWhereInput = { AND: filters };
    const [rows, total] = await Promise.all([
      prisma.appraisal.findMany({
        where,
        include: appraisalInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.appraisal.count({ where }),
    ]);
    sendPaginated(
      res,
      rows.map(toAppraisalDto),
      total,
      query.page,
      query.pageSize,
    );
  }),
);

router.get(
  '/appraisals/:id',
  requireAuth,
  requirePermission('appraisal.view'),
  asyncRoute(async (req, res) => {
    const appraisal = await findAppraisalOrThrow(req.params.id as string);
    if (!canViewAppraisal(req, appraisal)) throw forbidden('This appraisal is outside your access scope');
    res.json(toAppraisalDto(appraisal));
  }),
);

router.post(
  '/appraisals/:id/self-review',
  requireAuth,
  asyncRoute(async (req, res) => {
    const id = req.params.id as string;
    const input = appraisalSelfReviewSchema.parse(req.body);
    const current = await findAppraisalOrThrow(id);
    if (current.employeeId !== req.auth!.employeeId) {
      throw forbidden('Only the employee can submit a self-review');
    }
    if (!isAppraisalTransitionAllowed(current.status, 'SELF_REVIEW')) {
      throw invalidTransition(`Cannot submit a self-review in status ${current.status}`);
    }
    const objectiveIds = current.objectives.map((objective) => objective.id);
    const submittedIds = input.objectiveRatings.map((rating) => rating.id);
    if (
      new Set(submittedIds).size !== submittedIds.length ||
      submittedIds.length !== objectiveIds.length ||
      !objectiveIds.every((id) => submittedIds.includes(id))
    ) {
      throw conflict('All appraisal objectives must be rated exactly once');
    }
    const recipients = [current.supervisorUserId, current.hodUserId].filter(
      (userId): userId is string => Boolean(userId) && userId !== req.auth!.userId,
    );
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.appraisal.update({
        where: { id },
        data: {
          selfRating: input.selfRating,
          selfComment: input.selfComment,
          developmentPlan: input.developmentPlan,
          status: 'SELF_REVIEW',
          submittedAt: new Date(),
        },
        include: appraisalInclude,
      });
      for (const rating of input.objectiveRatings) {
        await tx.appraisalObjective.updateMany({
          where: { id: rating.id, appraisalId: id },
          data: { selfRating: rating.rating },
        });
      }
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'performance.self_review_submitted',
          entityType: 'Appraisal',
          entityId: id,
          before: auditFields(current, ['status', 'selfRating', 'selfComment', 'developmentPlan']),
          after: auditFields(row, ['status', 'selfRating', 'selfComment', 'developmentPlan', 'submittedAt']),
        },
        tx,
      );
      await notifyUsers(tx, recipients, {
        eventType: 'performance.self_review_submitted',
        title: 'Appraisal self-review submitted',
        safeSummary: `A self-review was submitted for the ${row.cycle.name} cycle.`,
        relatedEntityType: 'Appraisal',
        relatedEntityId: id,
      });
      return tx.appraisal.findUniqueOrThrow({ where: { id }, include: appraisalInclude });
    });
    res.json(toAppraisalDto(updated));
  }),
);

router.post(
  '/appraisals/:id/review',
  requireAuth,
  requirePermission('appraisal.review'),
  asyncRoute(async (req, res) => {
    const id = req.params.id as string;
    const input = appraisalReviewSchema.parse(req.body);
    if (!hasPermission(req.auth!, 'appraisal.review')) {
      throw forbidden('Missing required permission: appraisal.review');
    }
    const current = await findAppraisalOrThrow(id);
    if (!canViewAppraisal(req, current)) throw forbidden('This appraisal is outside your access scope');
    const transition = REVIEW_TRANSITIONS[input.stage];
    if (
      current.status !== transition.from ||
      !isAppraisalTransitionAllowed(current.status, transition.to)
    ) {
      throw invalidTransition(`Cannot ${input.stage.toLowerCase()} review an appraisal in status ${current.status}`);
    }
    if (input.stage === 'SUPERVISOR') {
      if (req.auth!.userId !== current.supervisorUserId && !hasInstitutionGrant(req, 'appraisal.review')) {
        throw forbidden('Only the assigned supervisor can complete this review');
      }
    } else if (input.stage === 'HOD') {
      if (req.auth!.userId !== current.hodUserId && !hasInstitutionGrant(req, 'appraisal.review')) {
        throw forbidden('Only the assigned HOD can complete this review');
      }
    } else if (
      req.auth!.userId !== current.hrUserId &&
      !hasInstitutionGrant(req, 'appraisal.review') &&
      !hasInstitutionGrant(req, 'appraisal.finalize')
    ) {
      throw forbidden('Only the assigned HR reviewer can complete this review');
    }

    const data: Prisma.AppraisalUpdateInput = { status: transition.to };
    if (input.stage === 'SUPERVISOR') {
      data.supervisorRating = input.rating;
      data.supervisorComment = input.comment;
    } else if (input.stage === 'HOD') {
      data.hodRating = input.rating;
      data.hodComment = input.comment;
    } else {
      data.hrComment = input.comment;
    }
    if (input.developmentPlan !== undefined) data.developmentPlan = input.developmentPlan;

    const employeeRecipients = await userIdsForEmployee(current.employeeId);
    const nextHrReviewers = await hrReviewerUserIds();
    let recipients = employeeRecipients;
    if (input.stage === 'SUPERVISOR') {
      recipients = current.hodUserId ? [current.hodUserId] : nextHrReviewers.length ? nextHrReviewers : employeeRecipients;
    } else if (input.stage === 'HOD') {
      recipients = nextHrReviewers.length ? nextHrReviewers : employeeRecipients;
    }
    recipients = recipients.filter((userId) => userId !== req.auth!.userId);

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.appraisal.update({ where: { id }, data, include: appraisalInclude });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: `performance.${input.stage.toLowerCase()}_review`,
          entityType: 'Appraisal',
          entityId: id,
          reason: input.comment,
          before: auditFields(current, [
            'status',
            'supervisorRating',
            'supervisorComment',
            'hodRating',
            'hodComment',
            'hrComment',
            'developmentPlan',
          ]),
          after: auditFields(row, [
            'status',
            'supervisorRating',
            'supervisorComment',
            'hodRating',
            'hodComment',
            'hrComment',
            'developmentPlan',
          ]),
        },
        tx,
      );
      await notifyUsers(tx, recipients, {
        eventType: `performance.${input.stage.toLowerCase()}_review`,
        title: 'Appraisal review submitted',
        safeSummary: `An appraisal moved to ${transition.to.replace('_', ' ').toLowerCase()}.`,
        relatedEntityType: 'Appraisal',
        relatedEntityId: id,
      });
      return row;
    });
    res.json(toAppraisalDto(updated));
  }),
);

router.post(
  '/appraisals/:id/finalize',
  requireAuth,
  requirePermission('appraisal.finalize'),
  asyncRoute(async (req, res) => {
    const id = req.params.id as string;
    const input = appraisalFinalizeSchema.parse(req.body);
    const current = await findAppraisalOrThrow(id);
    if (!canViewAppraisal(req, current)) throw forbidden('This appraisal is outside your access scope');
    if (current.hrUserId !== req.auth!.userId && !hasInstitutionGrant(req, 'appraisal.finalize')) {
      throw forbidden('Only the assigned HR reviewer can finalize this appraisal');
    }
    if (!isAppraisalTransitionAllowed(current.status, 'FINALIZED')) {
      throw invalidTransition(`Cannot finalize an appraisal in status ${current.status}`);
    }
    const recipients = await userIdsForEmployee(current.employeeId);
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.appraisal.update({
        where: { id },
        data: {
          status: 'FINALIZED',
          finalRating: input.finalRating,
          finalComment: input.comment,
          finalizedAt: new Date(),
          hrUserId: current.hrUserId ?? req.auth!.userId,
        },
        include: appraisalInclude,
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'performance.appraisal_finalized',
          entityType: 'Appraisal',
          entityId: id,
          reason: input.comment,
          before: auditFields(current, ['status', 'finalRating', 'finalComment', 'finalizedAt', 'hrUserId']),
          after: auditFields(row, ['status', 'finalRating', 'finalComment', 'finalizedAt', 'hrUserId']),
        },
        tx,
      );
      await notifyUsers(tx, recipients, {
        eventType: 'performance.appraisal_finalized',
        title: 'Appraisal finalized',
        safeSummary: `Your appraisal for the ${row.cycle.name} cycle has been finalized.`,
        relatedEntityType: 'Appraisal',
        relatedEntityId: id,
      });
      return row;
    });
    res.json(toAppraisalDto(updated));
  }),
);

router.post(
  '/appraisals/:id/archive',
  requireAuth,
  requirePermission('appraisal.finalize'),
  asyncRoute(async (req, res) => {
    const id = req.params.id as string;
    const current = await findAppraisalOrThrow(id);
    if (!canViewAppraisal(req, current)) throw forbidden('This appraisal is outside your access scope');
    if (current.hrUserId !== req.auth!.userId && !hasInstitutionGrant(req, 'appraisal.finalize')) {
      throw forbidden('Only the assigned HR reviewer can archive this appraisal');
    }
    if (!isAppraisalTransitionAllowed(current.status, 'ARCHIVED')) {
      throw invalidTransition(`Cannot archive an appraisal in status ${current.status}`);
    }
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.appraisal.update({
        where: { id },
        data: { status: 'ARCHIVED' },
        include: appraisalInclude,
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'performance.appraisal_archived',
          entityType: 'Appraisal',
          entityId: id,
          before: auditFields(current, ['status']),
          after: auditFields(row, ['status']),
        },
        tx,
      );
      return row;
    });
    res.json(toAppraisalDto(updated));
  }),
);

export default router;
