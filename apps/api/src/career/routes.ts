import { randomBytes } from 'node:crypto';
import { Router, type Request } from 'express';
import type { Prisma } from '@prisma/client';
import {
  careerCaseCreateSchema,
  careerCaseQuerySchema,
  careerDecisionSchema,
  careerProgressSchema,
  isCareerTransitionAllowed,
  type CareerCaseDto,
  type CareerCaseEventDto,
} from '@umu-hr/shared';
import { prisma } from '../db.js';
import { addDays, parseDate, toDateOnly, today } from '../dates.js';
import { canAccessEmployee, currentAssignmentFilter, employeeWhere, hasPermission } from '../access/policy.js';
import { asyncRoute, conflict, forbidden, invalidTransition, notFound } from '../errors.js';
import { sendPaginated } from '../http.js';
import { requireAuth, requirePermission } from '../access/middleware.js';
import { recordAudit } from '../audit/service.js';
import { notifyPermissionHolders, notifyUsers } from '../notifications/service.js';
import { currentUnitIds, findEmployeeOrThrow } from '../employees/service.js';
import { employeeName, metadata, requireEmployeeInScope } from '../phase2/service.js';

const router = Router();

const caseInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      assignments: {
        where: currentAssignmentFilter,
        select: { unitId: true, endDate: true, startDate: true },
      },
    },
  },
  decidedBy: { select: { email: true, employee: { select: { firstName: true, lastName: true } } } },
  events: {
    orderBy: { createdAt: 'asc' },
    include: { actor: { select: { email: true, employee: { select: { firstName: true, lastName: true } } } } },
  },
} satisfies Prisma.CareerCaseInclude;

type CaseRow = Prisma.CareerCaseGetPayload<{ include: typeof caseInclude }>;

function actorName(user: { email: string; employee: { firstName: string; lastName: string } | null } | null): string | null {
  if (!user) return null;
  return user.employee ? employeeName(user.employee) : user.email;
}

function toDto(row: CaseRow): CareerCaseDto {
  return {
    id: row.id,
    reference: row.reference,
    employeeId: row.employeeId,
    employeeName: employeeName(row.employee),
    type: row.type,
    status: row.status,
    currentUnitId: row.currentUnitId,
    currentPositionId: row.currentPositionId,
    proposedUnitId: row.proposedUnitId,
    proposedPositionId: row.proposedPositionId,
    effectiveDate: toDateOnly(row.effectiveDate),
    reason: row.reason,
    eligibilityNote: row.eligibilityNote,
    documentsVerified: row.documentsVerified,
    committeeNote: row.committeeNote,
    decisionNote: row.decisionNote,
    decidedByName: actorName(row.decidedBy),
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    events: row.events.map((event): CareerCaseEventDto => ({
      id: event.id,
      action: event.action,
      note: event.note,
      actorName: actorName(event.actor),
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

function nextReference(): string {
  return `CAR-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`.slice(0, 30);
}

async function employeeUserId(employeeId: string): Promise<string | null> {
  const user = await prisma.user.findFirst({ where: { employeeId, status: 'ACTIVE' }, select: { id: true } });
  return user?.id ?? null;
}

async function notifyEmployee(employeeId: string, input: { eventType: string; title: string; safeSummary: string; entityId: string; priority?: 'NORMAL' | 'HIGH' }) {
  const userId = await employeeUserId(employeeId);
  if (!userId) return;
  await notifyUsers(prisma, [userId], {
    eventType: input.eventType,
    title: input.title,
    safeSummary: input.safeSummary,
    relatedEntityType: 'CareerCase',
    relatedEntityId: input.entityId,
    priority: input.priority,
  });
}

async function notifyReviewers(permission: 'promotion.review' | 'promotion.approve', row: CaseRow, input: { eventType: string; title: string; safeSummary: string; excludeUserId?: string }) {
  await notifyPermissionHolders(prisma, {
    permission,
    employeeId: row.employeeId,
    employeeUnitIds: currentUnitIds(row.employee),
    excludeUserId: input.excludeUserId,
    eventType: input.eventType,
    title: input.title,
    safeSummary: input.safeSummary,
    relatedEntityType: 'CareerCase',
    relatedEntityId: row.id,
  });
}

function canViewCase(req: Request, row: CaseRow): boolean {
  if (req.auth!.employeeId === row.employeeId) return true;
  const target = { id: row.employeeId, currentUnitIds: currentUnitIds(row.employee) };
  return canAccessEmployee(req.auth!, target, 'career.view') || canAccessEmployee(req.auth!, target, 'employee.view');
}

async function loadCaseOrThrow(id: string): Promise<CaseRow> {
  const row = await prisma.careerCase.findUnique({ where: { id }, include: caseInclude });
  if (!row) throw notFound('Career case not found');
  return row;
}

router.post(
  '/cases',
  requireAuth,
  requirePermission('career.submit'),
  asyncRoute(async (req, res) => {
    const input = careerCaseCreateSchema.parse(req.body);
    const employee = await findEmployeeOrThrow(input.employeeId);
    const target = { id: employee.id, currentUnitIds: currentUnitIds(employee) };
    if (
      !canAccessEmployee(req.auth!, target, 'career.submit') &&
      !canAccessEmployee(req.auth!, target, 'promotion.review')
    ) {
      throw forbidden('This employee record is outside your access scope');
    }

    if (input.proposedUnitId) {
      const unit = await prisma.orgUnit.findUnique({ where: { id: input.proposedUnitId }, select: { id: true } });
      if (!unit) throw notFound('Proposed organizational unit not found');
    }
    if (input.proposedPositionId) {
      const position = await prisma.position.findUnique({ where: { id: input.proposedPositionId }, select: { id: true } });
      if (!position) throw notFound('Proposed position not found');
    }

    const assignment = employee.assignments.find((item) => !item.endDate || item.endDate >= today());
    if (!assignment) throw conflict('Employee has no current active assignment');

    const effectiveDate = parseDate(input.effectiveDate);
    const reference = nextReference();
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.careerCase.create({
        data: {
          reference,
          employeeId: employee.id,
          type: input.type,
          status: 'NOMINATED',
          currentUnitId: assignment.unitId,
          currentPositionId: assignment.positionId,
          proposedUnitId: input.proposedUnitId ?? null,
          proposedPositionId: input.proposedPositionId ?? null,
          effectiveDate,
          reason: input.reason,
          events: {
            create: {
              actorUserId: req.auth!.userId,
              action: 'NOMINATED',
              note: input.reason,
            },
          },
        },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'career.case_nominated',
          entityType: 'CareerCase',
          entityId: row.id,
          after: {
            reference,
            employeeId: employee.id,
            type: input.type,
            status: 'NOMINATED',
            currentUnitId: assignment.unitId,
            currentPositionId: assignment.positionId,
            proposedUnitId: input.proposedUnitId ?? null,
            proposedPositionId: input.proposedPositionId ?? null,
            effectiveDate: input.effectiveDate,
          },
        },
        tx,
      );
      return tx.careerCase.findUniqueOrThrow({ where: { id: row.id }, include: caseInclude });
    });

    await notifyEmployee(employee.id, {
      eventType: 'career.case_nominated',
      title: 'Career case nominated',
      safeSummary: `A ${input.type.toLowerCase().replace('_', ' ')} case has been nominated for you.`,
      entityId: created.id,
    });
    await notifyReviewers('promotion.review', created, {
      eventType: 'career.case_nominated',
      title: 'Career case requires review',
      safeSummary: `Career case ${created.reference} requires review.`,
      excludeUserId: req.auth!.userId,
    });

    res.status(201).json(toDto(created));
  }),
);
router.get(
  '/cases',
  requireAuth,
  asyncRoute(async (req, res) => {
    const query = careerCaseQuerySchema.parse(req.query);
    const ownEmployeeId = req.auth!.employeeId;
    const canViewAll = hasPermission(req.auth!, 'career.view') || hasPermission(req.auth!, 'employee.view');
    const filters: Prisma.CareerCaseWhereInput[] = [];
    if (query.type) filters.push({ type: query.type });
    if (query.status) filters.push({ status: query.status });
    if (query.employeeId) filters.push({ employeeId: query.employeeId });

    const visibility: Prisma.CareerCaseWhereInput[] = [];
    if (ownEmployeeId) visibility.push({ employeeId: ownEmployeeId });
    if (hasPermission(req.auth!, 'career.view')) visibility.push({ employee: employeeWhere(req.auth!, 'career.view') });
    if (hasPermission(req.auth!, 'employee.view')) visibility.push({ employee: employeeWhere(req.auth!, 'employee.view') });
    if (visibility.length === 0) throw forbidden('Missing required permission: career.view or employee.view');

    const where: Prisma.CareerCaseWhereInput = {
      AND: [...filters, { OR: visibility }],
    };

    const [rows, total] = await Promise.all([
      prisma.careerCase.findMany({
        where,
        include: caseInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.careerCase.count({ where }),
    ]);

    const items = rows
      .filter((row) => canViewAll || row.employeeId === ownEmployeeId || canViewCase(req, row))
      .map(toDto);
    sendPaginated(res, items, total, query.page, query.pageSize);
  }),
);

router.get(
  '/cases/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const row = await loadCaseOrThrow(req.params.id as string);
    if (!canViewCase(req, row)) throw forbidden('This career case is outside your access scope');
    res.json(toDto(row));
  }),
);

router.get(
  '/cases/:id/events',
  requireAuth,
  asyncRoute(async (req, res) => {
    const row = await loadCaseOrThrow(req.params.id as string);
    if (!canViewCase(req, row)) throw forbidden('This career case is outside your access scope');
    res.json(toDto(row).events);
  }),
);
router.post(
  '/cases/:id/progress',
  requireAuth,
  requirePermission('promotion.review'),
  asyncRoute(async (req, res) => {
    const input = careerProgressSchema.parse(req.body);
    const current = await loadCaseOrThrow(req.params.id as string);
    await requireEmployeeInScope(req, current.employeeId, 'promotion.review');

    if (!isCareerTransitionAllowed(current.status, input.status)) {
      throw invalidTransition(`Cannot change career case status from ${current.status} to ${input.status}`);
    }

    const documentsVerified = input.documentsVerified ?? current.documentsVerified;
    if ((input.status === 'DOCUMENT_VERIFICATION' || input.status === 'COMMITTEE_REVIEW') && !documentsVerified) {
      throw conflict('documentsVerified must be true before document verification or committee review');
    }
    if (input.status === 'REJECTED' && (!input.note || input.note.trim().length < 3)) {
      throw conflict('A documented note of at least 3 characters is required to reject a career case');
    }
    const decidedAt = input.status === 'REJECTED' ? new Date() : current.decidedAt;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.careerCase.update({
        where: { id: current.id },
        data: {
          status: input.status,
          eligibilityNote: input.status === 'ELIGIBILITY_CHECK' ? input.note ?? current.eligibilityNote : current.eligibilityNote,
          documentsVerified,
          committeeNote: input.status === 'COMMITTEE_REVIEW' ? input.note ?? current.committeeNote : current.committeeNote,
          decisionNote: input.status === 'REJECTED' ? input.note ?? current.decisionNote : current.decisionNote,
          decidedById: input.status === 'REJECTED' ? req.auth!.userId : current.decidedById,
          decidedAt,
        },
      });
      await tx.careerCaseEvent.create({
        data: {
          caseId: current.id,
          actorUserId: req.auth!.userId,
          action: input.status,
          note: input.note ?? null,
        },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'career.case_progressed',
          entityType: 'CareerCase',
          entityId: current.id,
          reason: input.note ?? null,
          before: {
            status: current.status,
            decisionNote: current.decisionNote,
            decidedById: current.decidedById,
            decidedAt: current.decidedAt ? current.decidedAt.toISOString() : null,
          },
          after: {
            status: input.status,
            decisionNote: row.decisionNote,
            decidedById: row.decidedById,
            decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
          },
        },
        tx,
      );
      return tx.careerCase.findUniqueOrThrow({ where: { id: row.id }, include: caseInclude });
    });

    await notifyEmployee(current.employeeId, {
      eventType: 'career.case_progressed',
      title: 'Career case updated',
      safeSummary: `Career case ${current.reference} status is now ${input.status}.`,
      entityId: current.id,
    });
    if (input.status === 'RECOMMENDED') {
      await notifyReviewers('promotion.approve', updated, {
        eventType: 'career.case_recommended',
        title: 'Career case recommended for approval',
        safeSummary: `Career case ${current.reference} is recommended for approval.`,
        excludeUserId: req.auth!.userId,
      });
    }

    res.json(toDto(updated));
  }),
);
router.post(
  '/cases/:id/decision',
  requireAuth,
  requirePermission('promotion.approve'),
  asyncRoute(async (req, res) => {
    const input = careerDecisionSchema.parse(req.body);
    const current = await loadCaseOrThrow(req.params.id as string);
    await requireEmployeeInScope(req, current.employeeId, 'promotion.approve');

    const targetStatus = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    if (!isCareerTransitionAllowed(current.status, targetStatus)) {
      throw invalidTransition(`Cannot change career case status from ${current.status} to ${targetStatus}`);
    }

    if (!input.note || input.note.trim().length < 3) {
      throw conflict('A documented note of at least 3 characters is required');
    }

    const effectiveDate = input.effectiveDate ? parseDate(input.effectiveDate) : current.effectiveDate;
    const decidedAt = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.careerCase.update({
        where: { id: current.id },
        data: {
          status: targetStatus,
          effectiveDate,
          decisionNote: input.note,
          decidedById: req.auth!.userId,
          decidedAt,
        },
      });
      await tx.careerCaseEvent.create({
        data: {
          caseId: current.id,
          actorUserId: req.auth!.userId,
          action: targetStatus,
          note: input.note,
        },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: targetStatus === 'APPROVED' ? 'career.case_approved' : 'career.case_rejected',
          entityType: 'CareerCase',
          entityId: current.id,
          reason: input.note,
          before: { status: current.status, effectiveDate: toDateOnly(current.effectiveDate) },
          after: { status: targetStatus, effectiveDate: toDateOnly(effectiveDate) },
        },
        tx,
      );
      return tx.careerCase.findUniqueOrThrow({ where: { id: row.id }, include: caseInclude });
    });

    await notifyEmployee(current.employeeId, {
      eventType: targetStatus === 'APPROVED' ? 'career.case_approved' : 'career.case_rejected',
      title: targetStatus === 'APPROVED' ? 'Career case approved' : 'Career case rejected',
      safeSummary: `Career case ${current.reference} has been ${targetStatus.toLowerCase()}.`,
      entityId: current.id,
      priority: targetStatus === 'APPROVED' ? 'HIGH' : 'NORMAL',
    });

    res.json(toDto(updated));
  }),
);
router.post(
  '/cases/:id/effective',
  requireAuth,
  requirePermission('promotion.approve'),
  asyncRoute(async (req, res) => {
    const current = await loadCaseOrThrow(req.params.id as string);
    await requireEmployeeInScope(req, current.employeeId, 'promotion.approve');
    if (current.status !== 'APPROVED') {
      throw conflict('Only approved career cases can be made effective');
    }

    const effectiveDate = current.effectiveDate;
    const targetUnitId = current.proposedUnitId ?? current.currentUnitId;
    const targetPositionId = current.proposedPositionId ?? current.currentPositionId;
    const endDate = addDays(effectiveDate, -1);

    const updated = await prisma.$transaction(async (tx) => {
      const fresh = await tx.careerCase.findUnique({ where: { id: current.id }, select: { status: true } });
      if (!fresh) throw notFound('Career case not found');
      if (fresh.status !== 'APPROVED') {
        throw conflict('Only approved career cases can be made effective');
      }

      const activeAssignment = await tx.employeeAssignment.findFirst({
        where: {
          employeeId: current.employeeId,
          startDate: { lte: effectiveDate },
          OR: [{ endDate: null }, { endDate: { gte: effectiveDate } }],
        },
        orderBy: { startDate: 'desc' },
      });
      if (!activeAssignment) throw conflict('Employee has no assignment covering the effective date');
      if (activeAssignment.startDate >= effectiveDate) {
        throw conflict('The effective date must be after the current assignment start date');
      }
      const conflictingAssignment = await tx.employeeAssignment.findFirst({
        where: { employeeId: current.employeeId, startDate: effectiveDate },
        select: { id: true },
      });
      if (conflictingAssignment) throw conflict('An assignment already starts on the effective date');

      await tx.employeeAssignment.update({
        where: { id: activeAssignment.id },
        data: { endDate },
      });
      await tx.employeeAssignment.create({
        data: {
          employeeId: current.employeeId,
          unitId: targetUnitId,
          positionId: targetPositionId,
          supervisorEmployeeId: activeAssignment.supervisorEmployeeId,
          startDate: effectiveDate,
          assignmentType: current.type === 'ACTING_APPOINTMENT' ? 'ACTING' : 'PRIMARY',
          isActing: current.type === 'ACTING_APPOINTMENT',
          notes: `Career case ${current.reference}`,
          createdById: req.auth!.userId,
        },
      });

      const row = await tx.careerCase.update({
        where: { id: current.id },
        data: { status: 'EFFECTIVE' },
      });
      await tx.careerCaseEvent.create({
        data: {
          caseId: current.id,
          actorUserId: req.auth!.userId,
          action: 'EFFECTIVE',
          note: `Applied effective ${toDateOnly(effectiveDate)}`,
        },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'career.case_effective',
          entityType: 'CareerCase',
          entityId: current.id,
          before: { status: current.status, assignmentId: activeAssignment.id },
          after: {
            status: 'EFFECTIVE',
            unitId: targetUnitId,
            positionId: targetPositionId,
            effectiveDate: toDateOnly(effectiveDate),
          },
        },
        tx,
      );
      return tx.careerCase.findUniqueOrThrow({ where: { id: row.id }, include: caseInclude });
    });

    await notifyEmployee(current.employeeId, {
      eventType: 'career.case_effective',
      title: 'Career case applied',
      safeSummary: `Career case ${current.reference} is now effective.`,
      entityId: current.id,
      priority: 'HIGH',
    });

    res.json(toDto(updated));
  }),
);

export default router;




