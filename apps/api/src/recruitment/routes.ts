import { Router, type Request } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  applicationStatusSchema,
  candidateQuerySchema,
  interviewCreateSchema,
  isApplicationTransitionAllowed,
  offerCreateSchema,
  panelAssignmentCreateSchema,
  requisitionCreateSchema,
  requisitionDecisionSchema,
  requisitionUpdateSchema,
  scorecardCreateSchema,
  vacancyPublishSchema,
  vacancyQuerySchema,
  type ApplicationDto,
  type InterviewDto,
  type PanelAssignmentDto,
  type ScorecardDto,
  type VacancyDto,
} from '@umu-hr/shared';
import { prisma } from '../db.js';
import { parseDate, today, toDateOnly } from '../dates.js';
import { asyncRoute, conflict, forbidden, invalidTransition, notFound } from '../errors.js';
import { sendPaginated } from '../http.js';
import { requireAuth, requirePermission } from '../access/middleware.js';
import { effectiveGrantsFor } from '../access/policy.js';
import { auditFields, recordAudit } from '../audit/service.js';
import { notifyUsers } from '../notifications/service.js';
import { metadata, userDisplayName } from '../phase2/service.js';

const router = Router();

type Db = PrismaClient | Prisma.TransactionClient;

const SCOPE_PERMISSIONS = ['recruitment.view', 'recruitment.manage'] as const;
const DECISION_STATUSES = new Set(['ACCEPTED', 'DECLINED', 'REJECTED', 'WITHDRAWN']);
const OFFERABLE_STATUSES = new Set(['SHORTLISTED', 'INTERVIEW']);
const INTERVIEWABLE_STATUSES = new Set(['SHORTLISTED', 'INTERVIEW']);
const SCORECARD_STATUSES = new Set(['SHORTLISTED', 'INTERVIEW']);
const VISIBLE_VACANCY_STATUSES = ['PUBLISHED', 'CLOSED'] as const;

const vacancyInclude = {
  unit: { select: { id: true, name: true } },
  position: { select: { id: true, title: true } },
} satisfies Prisma.VacancyInclude;
type VacancyRow = Prisma.VacancyGetPayload<{ include: typeof vacancyInclude }>;

const applicationInclude = {
  vacancy: { select: { id: true, title: true } },
  applicant: {
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, coverNote: true, qualifications: true },
  },
  events: { orderBy: { createdAt: 'asc' } },
  interviews: {
    orderBy: { scheduledAt: 'asc' },
    include: { panelAssignment: { select: { userId: true } } },
  },
  scorecards: {
    orderBy: { submittedAt: 'asc' },
    include: { panelAssignment: { select: { userId: true } } },
  },
} satisfies Prisma.ApplicationInclude;
type ApplicationRow = Prisma.ApplicationGetPayload<{ include: typeof applicationInclude }>;

const panelAssignmentInclude = {
  vacancy: { select: { title: true } },
  user: { select: { email: true } },
} satisfies Prisma.PanelAssignmentInclude;
type PanelAssignmentRow = Prisma.PanelAssignmentGetPayload<{ include: typeof panelAssignmentInclude }>;

const interviewInclude = {
  application: { select: { reference: true } },
  panelAssignment: { select: { userId: true } },
} satisfies Prisma.InterviewInclude;
type InterviewRow = Prisma.InterviewGetPayload<{ include: typeof interviewInclude }>;

const scorecardInclude = {
  panelAssignment: { select: { userId: true } },
} satisfies Prisma.ScorecardInclude;
type ScorecardRow = Prisma.ScorecardGetPayload<{ include: typeof scorecardInclude }>;

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function csvCell(value: string | null | undefined): string {
  return `"${(value ?? '').replace(/"/g, '""')}"`;
}

function vacancyScope(req: Request): { all: boolean; unitIds: string[] } {
  const grants = SCOPE_PERMISSIONS.flatMap((permission) => effectiveGrantsFor(req.auth!, permission));
  return {
    all: grants.some((grant) => grant.all),
    unitIds: [...new Set(grants.flatMap((grant) => grant.scopeUnitIds))],
  };
}

function vacancyVisibilityWhere(req: Request): Prisma.VacancyWhereInput {
  const scope = vacancyScope(req);
  if (scope.all) return {};
  const conditions: Prisma.VacancyWhereInput[] = [];
  if (scope.unitIds.length > 0) conditions.push({ unitId: { in: scope.unitIds } });
  conditions.push({ panelAssignments: { some: { userId: req.auth!.userId } } });
  return { OR: conditions };
}

function applicationVisibilityWhere(req: Request): Prisma.ApplicationWhereInput {
  const scope = vacancyScope(req);
  if (scope.all) return {};
  const conditions: Prisma.ApplicationWhereInput[] = [];
  if (scope.unitIds.length > 0) conditions.push({ vacancy: { unitId: { in: scope.unitIds } } });
  conditions.push({ vacancy: { panelAssignments: { some: { userId: req.auth!.userId } } } });
  return { OR: conditions };
}

async function findVisibleVacancyOrThrow(id: string, req: Request): Promise<VacancyRow> {
  const row = await prisma.vacancy.findFirst({
    where: { id, ...vacancyVisibilityWhere(req) },
    include: vacancyInclude,
  });
  if (row) return row;
  const existing = await prisma.vacancy.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw notFound('Vacancy not found');
  throw forbidden('This vacancy is outside your access scope');
}

async function findVisibleApplicationOrThrow(id: string, req: Request): Promise<ApplicationRow> {
  const row = await prisma.application.findFirst({
    where: { id, ...applicationVisibilityWhere(req) },
    include: applicationInclude,
  });
  if (row) return row;
  const existing = await prisma.application.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw notFound('Application not found');
  throw forbidden('This application is outside your access scope');
}

async function activeRecruitmentManagerIds(db: Db): Promise<string[]> {
  const assignments = await db.roleAssignment.findMany({
    where: {
      revokedAt: null,
      role: { permissions: { some: { permissionKey: 'recruitment.manage' } } },
      startDate: { lte: today() },
      OR: [{ endDate: null }, { endDate: { gte: today() } }],
    },
    select: { userId: true },
  });
  const userIds = [...new Set(assignments.map((assignment) => assignment.userId))];
  if (userIds.length === 0) return [];
  const users = await db.user.findMany({
    where: { id: { in: userIds }, status: 'ACTIVE' },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

async function panelChairUserId(db: Db, vacancyId: string): Promise<string | null> {
  const assignment = await db.panelAssignment.findFirst({
    where: { vacancyId, role: 'CHAIR' },
    select: { userId: true },
  });
  return assignment?.userId ?? null;
}

function parseCriteria(value: Prisma.JsonValue): ScorecardDto['criteria'] {
  const items: readonly Prisma.JsonValue[] = Array.isArray(value) ? (value as Prisma.JsonValue[]) : [];
  return items.map((item) => {
    const record = item && typeof item === 'object' && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
    return {
      name: typeof record.name === 'string' ? record.name : '',
      score: typeof record.score === 'number' ? record.score : 0,
      comment: typeof record.comment === 'string' ? record.comment : null,
    };
  });
}

function averageCriteria(criteria: ScorecardDto['criteria']): number {
  if (criteria.length === 0) return 0;
  const total = criteria.reduce((sum, criterion) => sum + criterion.score, 0);
  return Number((total / criteria.length).toFixed(2));
}

async function toVacancyDto(row: VacancyRow, db: Db): Promise<VacancyDto> {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    requirements: row.requirements,
    unitId: row.unitId,
    unitName: row.unit.name,
    positionId: row.positionId,
    positionTitle: row.position?.title ?? null,
    employmentType: row.employmentType,
    openings: row.openings,
    closingDate: toDateOnly(row.closingDate),
    salaryGrade: row.salaryGrade,
    status: row.status,
    publishedAt: isoOrNull(row.publishedAt),
    approvedByName: await userDisplayName(db, row.approvedById),
    createdAt: row.createdAt.toISOString(),
  };
}

async function toApplicationDto(row: ApplicationRow, db: Db): Promise<ApplicationDto> {
  const [decisionByName, events, interviews, scorecards] = await Promise.all([
    userDisplayName(db, row.decisionById),
    Promise.all(
      row.events.map(async (event) => ({
        id: event.id,
        action: event.action,
        note: event.note,
        actorName: await userDisplayName(db, event.actorUserId),
        createdAt: event.createdAt.toISOString(),
      })),
    ),
    Promise.all(
      row.interviews.map(async (interview) => ({
        id: interview.id,
        applicationId: interview.applicationId,
        applicationReference: row.reference,
        scheduledAt: interview.scheduledAt.toISOString(),
        location: interview.location,
        note: interview.note,
        panelMemberName: await userDisplayName(db, interview.panelAssignment?.userId ?? null),
        createdAt: interview.createdAt.toISOString(),
      })),
    ),
    Promise.all(
      row.scorecards.map(async (scorecard) => {
        const criteria = parseCriteria(scorecard.criteria);
        return {
          id: scorecard.id,
          applicationId: scorecard.applicationId,
          panelAssignmentId: scorecard.panelAssignmentId,
          panelMemberName: await userDisplayName(db, scorecard.panelAssignment?.userId ?? null),
          criteria,
          averageScore: averageCriteria(criteria),
          recommendation: scorecard.recommendation,
          strengths: scorecard.strengths,
          concerns: scorecard.concerns,
          submittedAt: scorecard.submittedAt.toISOString(),
        };
      }),
    ),
  ]);

  return {
    id: row.id,
    reference: row.reference,
    vacancyId: row.vacancyId,
    vacancyTitle: row.vacancy.title,
    applicantId: row.applicantId,
    applicantName: `${row.applicant.firstName} ${row.applicant.lastName}`,
    email: row.applicant.email,
    phone: row.applicant.phone,
    coverNote: row.applicant.coverNote,
    qualifications: row.applicant.qualifications,
    status: row.status,
    submittedAt: row.submittedAt.toISOString(),
    screeningNote: row.screeningNote,
    decisionNote: row.decisionNote,
    decisionByName,
    decisionAt: isoOrNull(row.decisionAt),
    offerDetails: row.offerDetails,
    offeredAt: isoOrNull(row.offeredAt),
    offerRespondedAt: isoOrNull(row.offerRespondedAt),
    createdAt: row.createdAt.toISOString(),
    events,
    interviews,
    scorecards,
  };
}

async function toPanelAssignmentDto(row: PanelAssignmentRow, db: Db): Promise<PanelAssignmentDto> {
  return {
    id: row.id,
    vacancyId: row.vacancyId,
    vacancyTitle: row.vacancy.title,
    userId: row.userId,
    userName: (await userDisplayName(db, row.userId)) ?? row.user.email,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  };
}

async function toInterviewDto(row: InterviewRow, db: Db): Promise<InterviewDto> {
  return {
    id: row.id,
    applicationId: row.applicationId,
    applicationReference: row.application.reference,
    scheduledAt: row.scheduledAt.toISOString(),
    location: row.location,
    note: row.note,
    panelMemberName: await userDisplayName(db, row.panelAssignment?.userId ?? null),
    createdAt: row.createdAt.toISOString(),
  };
}

async function toScorecardDto(row: ScorecardRow, db: Db): Promise<ScorecardDto> {
  const criteria = parseCriteria(row.criteria);
  return {
    id: row.id,
    applicationId: row.applicationId,
    panelAssignmentId: row.panelAssignmentId,
    panelMemberName: await userDisplayName(db, row.panelAssignment?.userId ?? null),
    criteria,
    averageScore: averageCriteria(criteria),
    recommendation: row.recommendation,
    strengths: row.strengths,
    concerns: row.concerns,
    submittedAt: row.submittedAt.toISOString(),
  };
}

router.post(
  '/requisitions',
  requireAuth,
  requirePermission('recruitment.create'),
  asyncRoute(async (req, res) => {
    const input = requisitionCreateSchema.parse(req.body);
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.vacancy.create({
        data: {
          code: input.code,
          title: input.title,
          description: input.description ?? null,
          requirements: input.requirements ?? null,
          unitId: input.unitId,
          positionId: input.positionId ?? null,
          employmentType: input.employmentType,
          openings: input.openings,
          closingDate: parseDate(input.closingDate),
          salaryGrade: input.salaryGrade ?? null,
          status: 'DRAFT',
          createdById: req.auth!.userId,
        },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'recruitment.requisition_created',
          entityType: 'Vacancy',
          entityId: row.id,
          after: auditFields(row, ['code', 'title', 'unitId', 'employmentType', 'openings', 'closingDate', 'status']),
        },
        tx,
      );
      return tx.vacancy.findUniqueOrThrow({ where: { id: row.id }, include: vacancyInclude });
    });
    res.status(201).json(await toVacancyDto(created, prisma));
  }),
);

router.get(
  '/requisitions',
  requireAuth,
  requirePermission('recruitment.view'),
  asyncRoute(async (req, res) => {
    const query = vacancyQuerySchema.parse(req.query);
    const filters: Prisma.VacancyWhereInput[] = [vacancyVisibilityWhere(req)];
    if (query.status) filters.push({ status: query.status });
    if (query.unitId) filters.push({ unitId: query.unitId });
    if (query.q) {
      filters.push({
        OR: [
          { code: { contains: query.q } },
          { title: { contains: query.q } },
          { description: { contains: query.q } },
        ],
      });
    }
    const where: Prisma.VacancyWhereInput = { AND: filters };
    const [rows, total] = await Promise.all([
      prisma.vacancy.findMany({
        where,
        include: vacancyInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.vacancy.count({ where }),
    ]);
    const items = await Promise.all(rows.map((row) => toVacancyDto(row, prisma)));
    sendPaginated(res, items, total, query.page, query.pageSize);
  }),
);

router.get(
  '/requisitions/:id',
  requireAuth,
  requirePermission('recruitment.view'),
  asyncRoute(async (req, res) => {
    const vacancy = await findVisibleVacancyOrThrow(req.params.id as string, req);
    res.json(await toVacancyDto(vacancy, prisma));
  }),
);

router.patch(
  '/requisitions/:id',
  requireAuth,
  requirePermission('recruitment.manage'),
  asyncRoute(async (req, res) => {
    const id = req.params.id as string;
    const input = requisitionUpdateSchema.parse(req.body);
    const current = await prisma.vacancy.findUnique({ where: { id } });
    if (!current) throw notFound('Requisition not found');
    if (current.status !== 'DRAFT') throw conflict('Only draft requisitions can be edited');
    const { closingDate, ...rest } = input;
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.vacancy.update({
        where: { id },
        data: { ...rest, ...(closingDate ? { closingDate: parseDate(closingDate) } : {}) },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'recruitment.requisition_updated',
          entityType: 'Vacancy',
          entityId: id,
          before: auditFields(current, ['title', 'unitId', 'employmentType', 'openings', 'closingDate']),
          after: auditFields(row, ['title', 'unitId', 'employmentType', 'openings', 'closingDate']),
        },
        tx,
      );
      return tx.vacancy.findUniqueOrThrow({ where: { id }, include: vacancyInclude });
    });
    res.json(await toVacancyDto(updated, prisma));
  }),
);

router.post(
  '/requisitions/:id/submit',
  requireAuth,
  requirePermission('recruitment.manage'),
  asyncRoute(async (req, res) => {
    const id = req.params.id as string;
    const current = await prisma.vacancy.findUnique({ where: { id } });
    if (!current) throw notFound('Requisition not found');
    if (current.status !== 'DRAFT') throw invalidTransition('Only draft requisitions can be submitted');
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.vacancy.update({ where: { id }, data: { status: 'PENDING_APPROVAL' } });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'recruitment.requisition_submitted',
          entityType: 'Vacancy',
          entityId: id,
          before: auditFields(current, ['status']),
          after: auditFields(row, ['status']),
        },
        tx,
      );
      return tx.vacancy.findUniqueOrThrow({ where: { id }, include: vacancyInclude });
    });
    res.json(await toVacancyDto(updated, prisma));
  }),
);

router.post(
  '/requisitions/:id/decision',
  requireAuth,
  requirePermission('recruitment.approve'),
  asyncRoute(async (req, res) => {
    const id = req.params.id as string;
    const input = requisitionDecisionSchema.parse(req.body);
    const current = await prisma.vacancy.findUnique({ where: { id } });
    if (!current) throw notFound('Requisition not found');
    if (current.status !== 'PENDING_APPROVAL') {
      throw invalidTransition('Only pending requisitions can be approved or rejected');
    }
    const targetStatus = input.action === 'APPROVE' ? 'APPROVED' : 'CANCELLED';
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.vacancy.update({
        where: { id },
        data: {
          status: targetStatus,
          approvedById: input.action === 'APPROVE' ? req.auth!.userId : current.approvedById,
        },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'recruitment.requisition_decided',
          entityType: 'Vacancy',
          entityId: id,
          reason: input.comment,
          before: auditFields(current, ['status', 'approvedById']),
          after: auditFields(row, ['status', 'approvedById']),
        },
        tx,
      );
      return tx.vacancy.findUniqueOrThrow({ where: { id }, include: vacancyInclude });
    });
    res.json(await toVacancyDto(updated, prisma));
  }),
);

router.post(
  '/requisitions/:id/publish',
  requireAuth,
  requirePermission('vacancy.publish'),
  asyncRoute(async (req, res) => {
    const id = req.params.id as string;
    const input = vacancyPublishSchema.parse(req.body ?? {});
    const current = await prisma.vacancy.findUnique({ where: { id } });
    if (!current) throw notFound('Requisition not found');
    if (current.status !== 'APPROVED') {
      throw invalidTransition('Only approved vacancies can be published');
    }
    const timestamp = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.vacancy.update({
        where: { id },
        data: { status: 'PUBLISHED', publishedAt: timestamp },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'recruitment.vacancy_published',
          entityType: 'Vacancy',
          entityId: id,
          reason: input.note ?? null,
          before: auditFields(current, ['status', 'publishedAt']),
          after: auditFields(row, ['status', 'publishedAt']),
        },
        tx,
      );
      return tx.vacancy.findUniqueOrThrow({ where: { id }, include: vacancyInclude });
    });
    await notifyUsers(prisma, await activeRecruitmentManagerIds(prisma), {
      eventType: 'recruitment.vacancy_published',
      title: 'Vacancy published',
      safeSummary: `Vacancy ${current.title} is now published.`,
      relatedEntityType: 'Vacancy',
      relatedEntityId: current.id,
    });
    res.json(await toVacancyDto(updated, prisma));
  }),
);

router.post(
  '/requisitions/:id/close',
  requireAuth,
  requirePermission('vacancy.publish'),
  asyncRoute(async (req, res) => {
    const id = req.params.id as string;
    const input = vacancyPublishSchema.parse(req.body ?? {});
    const current = await prisma.vacancy.findUnique({ where: { id } });
    if (!current) throw notFound('Vacancy not found');
    if (current.status !== 'PUBLISHED') throw invalidTransition('Only published vacancies can be closed');
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.vacancy.update({ where: { id }, data: { status: 'CLOSED' } });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'recruitment.vacancy_closed',
          entityType: 'Vacancy',
          entityId: id,
          reason: input.note ?? null,
          before: auditFields(current, ['status']),
          after: auditFields(row, ['status']),
        },
        tx,
      );
      return tx.vacancy.findUniqueOrThrow({ where: { id }, include: vacancyInclude });
    });
    res.json(await toVacancyDto(updated, prisma));
  }),
);

router.post(
  '/requisitions/:id/reopen',
  requireAuth,
  requirePermission('vacancy.publish'),
  asyncRoute(async (req, res) => {
    const id = req.params.id as string;
    const input = vacancyPublishSchema.parse(req.body ?? {});
    const current = await prisma.vacancy.findUnique({ where: { id } });
    if (!current) throw notFound('Vacancy not found');
    if (current.status !== 'CLOSED') throw invalidTransition('Only closed vacancies can be reopened');
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.vacancy.update({ where: { id }, data: { status: 'PUBLISHED' } });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'recruitment.vacancy_reopened',
          entityType: 'Vacancy',
          entityId: id,
          reason: input.note ?? null,
          before: auditFields(current, ['status']),
          after: auditFields(row, ['status']),
        },
        tx,
      );
      return tx.vacancy.findUniqueOrThrow({ where: { id }, include: vacancyInclude });
    });
    res.json(await toVacancyDto(updated, prisma));
  }),
);

router.get(
  '/vacancies',
  requireAuth,
  requirePermission('recruitment.view', 'candidate.view'),
  asyncRoute(async (req, res) => {
    const query = vacancyQuerySchema.parse(req.query);
    const filters: Prisma.VacancyWhereInput[] = [vacancyVisibilityWhere(req)];
    if (query.status) filters.push({ status: query.status });
    else filters.push({ status: { in: [...VISIBLE_VACANCY_STATUSES] } });
    if (query.unitId) filters.push({ unitId: query.unitId });
    if (query.q) {
      filters.push({
        OR: [
          { code: { contains: query.q } },
          { title: { contains: query.q } },
          { description: { contains: query.q } },
        ],
      });
    }
    const where: Prisma.VacancyWhereInput = { AND: filters };
    const [rows, total] = await Promise.all([
      prisma.vacancy.findMany({
        where,
        include: vacancyInclude,
        orderBy: { publishedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.vacancy.count({ where }),
    ]);
    const items = await Promise.all(rows.map((row) => toVacancyDto(row, prisma)));
    sendPaginated(res, items, total, query.page, query.pageSize);
  }),
);

router.get(
  '/vacancies/:id',
  requireAuth,
  requirePermission('recruitment.view', 'candidate.view'),
  asyncRoute(async (req, res) => {
    const id = req.params.id as string;
    await findVisibleVacancyOrThrow(id, req);
    const row = await prisma.vacancy.findFirst({
      where: { id, status: { in: [...VISIBLE_VACANCY_STATUSES] } },
      include: vacancyInclude,
    });
    if (!row) throw notFound('Vacancy not found');
    res.json(await toVacancyDto(row, prisma));
  }),
);

router.get(
  '/applications/export',
  requireAuth,
  requirePermission('candidate.export'),
  asyncRoute(async (req, res) => {
    const query = candidateQuerySchema.parse(req.query);
    const filters: Prisma.ApplicationWhereInput[] = [applicationVisibilityWhere(req)];
    if (query.vacancyId) filters.push({ vacancyId: query.vacancyId });
    if (query.status) filters.push({ status: query.status });
    if (query.q) {
      filters.push({
        OR: [
          { reference: { contains: query.q } },
          { applicant: { firstName: { contains: query.q } } },
          { applicant: { lastName: { contains: query.q } } },
          { applicant: { email: { contains: query.q } } },
        ],
      });
    }
    const rows = await prisma.application.findMany({
      where: { AND: filters },
      include: { vacancy: { select: { title: true } }, applicant: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { submittedAt: 'desc' },
    });
    const lines = [
      ['reference', 'vacancy title', 'applicant name', 'email', 'status', 'submittedAt', 'decision'].join(','),
      ...rows.map((row) =>
        [
          row.reference,
          row.vacancy.title,
          `${row.applicant.firstName} ${row.applicant.lastName}`,
          row.applicant.email,
          row.status,
          row.submittedAt.toISOString(),
          row.decisionNote,
        ]
          .map(csvCell)
          .join(','),
      ),
    ];
    await recordAudit({
      ...metadata(req),
      actorId: req.auth!.userId,
      action: 'recruitment.candidates_exported',
      entityType: 'Application',
      after: {
        count: rows.length,
        filters: { vacancyId: query.vacancyId ?? null, status: query.status ?? null, q: query.q ?? null },
      },
    });
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="candidates.csv"');
    res.send(`${lines.join('\n')}\n`);
  }),
);

router.get(
  '/applications',
  requireAuth,
  requirePermission('recruitment.view', 'candidate.view'),
  asyncRoute(async (req, res) => {
    const query = candidateQuerySchema.parse(req.query);
    const filters: Prisma.ApplicationWhereInput[] = [applicationVisibilityWhere(req)];
    if (query.vacancyId) filters.push({ vacancyId: query.vacancyId });
    if (query.status) filters.push({ status: query.status });
    if (query.q) {
      filters.push({
        OR: [
          { reference: { contains: query.q } },
          { applicant: { firstName: { contains: query.q } } },
          { applicant: { lastName: { contains: query.q } } },
          { applicant: { email: { contains: query.q } } },
        ],
      });
    }
    const where: Prisma.ApplicationWhereInput = { AND: filters };
    const [rows, total] = await Promise.all([
      prisma.application.findMany({
        where,
        include: applicationInclude,
        orderBy: { submittedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.application.count({ where }),
    ]);
    const items = await Promise.all(rows.map((row) => toApplicationDto(row, prisma)));
    sendPaginated(res, items, total, query.page, query.pageSize);
  }),
);

router.get(
  '/applications/:id',
  requireAuth,
  requirePermission('recruitment.view', 'candidate.view'),
  asyncRoute(async (req, res) => {
    const application = await findVisibleApplicationOrThrow(req.params.id as string, req);
    res.json(await toApplicationDto(application, prisma));
  }),
);

router.post(
  '/applications/:id/status',
  requireAuth,
  requirePermission('recruitment.manage'),
  asyncRoute(async (req, res) => {
    const id = req.params.id as string;
    const input = applicationStatusSchema.parse(req.body);
    const current = await findVisibleApplicationOrThrow(id, req);
    if (!isApplicationTransitionAllowed(current.status, input.status)) {
      throw invalidTransition(`Cannot change application status from ${current.status} to ${input.status}`);
    }
    const timestamp = new Date();
    const isDecision = DECISION_STATUSES.has(input.status);
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.application.update({
        where: { id },
        data: {
          status: input.status,
          screeningNote: input.status === 'SCREENING' ? input.note ?? null : current.screeningNote,
          decisionNote: isDecision ? input.note ?? null : current.decisionNote,
          decisionById: isDecision ? req.auth!.userId : current.decisionById,
          decisionAt: isDecision ? timestamp : current.decisionAt,
        },
      });
      await tx.applicationEvent.create({
        data: { applicationId: id, actorUserId: req.auth!.userId, action: 'STATUS_CHANGED', note: input.note ?? null },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'recruitment.application_status_changed',
          entityType: 'Application',
          entityId: id,
          reason: input.note ?? null,
          before: auditFields(current, ['status', 'screeningNote', 'decisionNote', 'decisionById', 'decisionAt']),
          after: auditFields(row, ['status', 'screeningNote', 'decisionNote', 'decisionById', 'decisionAt']),
        },
        tx,
      );
      return tx.application.findUniqueOrThrow({ where: { id }, include: applicationInclude });
    });
    if (input.status === 'INTERVIEW') {
      const chair = await panelChairUserId(prisma, current.vacancyId);
      await notifyUsers(prisma, chair ? [chair] : [], {
        eventType: 'recruitment.interview_stage',
        title: 'Candidate ready for interview',
        safeSummary: `Application ${current.reference} has moved to interview.`,
        relatedEntityType: 'Application',
        relatedEntityId: current.id,
      });
    }
    res.json(await toApplicationDto(updated, prisma));
  }),
);

router.post(
  '/applications/:id/offer',
  requireAuth,
  requirePermission('recruitment.approve'),
  asyncRoute(async (req, res) => {
    const id = req.params.id as string;
    const input = offerCreateSchema.parse(req.body);
    const current = await findVisibleApplicationOrThrow(id, req);
    if (!OFFERABLE_STATUSES.has(current.status)) {
      throw conflict('Offers require a shortlisted or interviewed application');
    }
    if (!isApplicationTransitionAllowed(current.status, 'OFFERED')) {
      throw invalidTransition(`Cannot change application status from ${current.status} to OFFERED`);
    }
    const recommendations = await prisma.scorecard.count({
      where: { applicationId: id, recommendation: { in: ['STRONG_YES', 'YES'] } },
    });
    if (recommendations === 0) {
      throw conflict('A panel member must recommend the candidate before an offer is made');
    }
    const timestamp = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.application.update({
        where: { id },
        data: {
          status: 'OFFERED',
          decisionNote: input.note,
          decisionById: req.auth!.userId,
          decisionAt: timestamp,
          offerDetails: input.offerDetails,
          offeredAt: timestamp,
          offerRespondedAt: null,
        },
      });
      await tx.applicationEvent.create({
        data: { applicationId: id, actorUserId: req.auth!.userId, action: 'OFFER_MADE', note: input.note },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'recruitment.offer_created',
          entityType: 'Application',
          entityId: id,
          reason: input.note,
          before: auditFields(current, [
            'status',
            'decisionNote',
            'decisionById',
            'decisionAt',
            'offerDetails',
            'offeredAt',
            'offerRespondedAt',
          ]),
          after: auditFields(row, [
            'status',
            'decisionNote',
            'decisionById',
            'decisionAt',
            'offerDetails',
            'offeredAt',
            'offerRespondedAt',
          ]),
        },
        tx,
      );
      return tx.application.findUniqueOrThrow({ where: { id }, include: applicationInclude });
    });
    const chair = await panelChairUserId(prisma, current.vacancyId);
    await notifyUsers(prisma, chair ? [chair] : [], {
      eventType: 'recruitment.offer_made',
      title: 'Offer made',
      safeSummary: `An offer was made for application ${current.reference}.`,
      relatedEntityType: 'Application',
      relatedEntityId: current.id,
    });
    res.json(await toApplicationDto(updated, prisma));
  }),
);

router.post(
  '/panels',
  requireAuth,
  requirePermission('panel.manage'),
  asyncRoute(async (req, res) => {
    const input = panelAssignmentCreateSchema.parse(req.body);
    await findVisibleVacancyOrThrow(input.vacancyId, req);
    const user = await prisma.user.findFirst({
      where: { id: input.userId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!user) throw notFound('Active user not found');
    const where = { vacancyId_userId: { vacancyId: input.vacancyId, userId: input.userId } };
    const assignment = await prisma.$transaction(async (tx) => {
      const before = await tx.panelAssignment.findUnique({ where });
      const row = await tx.panelAssignment.upsert({
        where,
        create: {
          vacancyId: input.vacancyId,
          userId: input.userId,
          role: input.role,
          createdById: req.auth!.userId,
        },
        update: { role: input.role },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'recruitment.panel_assigned',
          entityType: 'PanelAssignment',
          entityId: row.id,
          before: before ? auditFields(before, ['vacancyId', 'userId', 'role']) : null,
          after: auditFields(row, ['vacancyId', 'userId', 'role']),
        },
        tx,
      );
      return tx.panelAssignment.findUniqueOrThrow({ where: { id: row.id }, include: panelAssignmentInclude });
    });
    res.status(201).json(await toPanelAssignmentDto(assignment, prisma));
  }),
);

router.get(
  '/panels',
  requireAuth,
  requirePermission('panel.manage', 'recruitment.view'),
  asyncRoute(async (req, res) => {
    const vacancyId = z.string().uuid().optional().parse(req.query.vacancyId);
    if (vacancyId) await findVisibleVacancyOrThrow(vacancyId, req);
    const rows = await prisma.panelAssignment.findMany({
      where: { AND: [{ vacancy: vacancyVisibilityWhere(req) }, ...(vacancyId ? [{ vacancyId }] : [])] },
      include: panelAssignmentInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json(await Promise.all(rows.map((row) => toPanelAssignmentDto(row, prisma))));
  }),
);

router.post(
  '/interviews',
  requireAuth,
  requirePermission('interview.manage'),
  asyncRoute(async (req, res) => {
    const input = interviewCreateSchema.parse(req.body);
    const application = await findVisibleApplicationOrThrow(input.applicationId, req);
    if (!INTERVIEWABLE_STATUSES.has(application.status)) {
      throw conflict('Interviews can only be scheduled for shortlisted or interviewed applications');
    }
    let assignment: { id: string; userId: string } | null = null;
    if (input.panelAssignmentId) {
      const panelAssignment = await prisma.panelAssignment.findUnique({
        where: { id: input.panelAssignmentId },
        select: { id: true, userId: true, vacancyId: true },
      });
      if (!panelAssignment) throw notFound('Panel assignment not found');
      if (panelAssignment.vacancyId !== application.vacancyId) {
        throw conflict('Panel assignment belongs to a different vacancy');
      }
      assignment = { id: panelAssignment.id, userId: panelAssignment.userId };
    } else {
      const chair = await panelChairUserId(prisma, application.vacancyId);
      if (chair) {
        const panelAssignment = await prisma.panelAssignment.findFirst({
          where: { vacancyId: application.vacancyId, userId: chair },
          select: { id: true, userId: true },
        });
        assignment = panelAssignment ? { id: panelAssignment.id, userId: panelAssignment.userId } : null;
      }
    }
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.interview.create({
        data: {
          applicationId: application.id,
          panelAssignmentId: assignment?.id ?? null,
          scheduledAt: new Date(input.scheduledAt),
          location: input.location ?? null,
          note: input.note ?? null,
          createdById: req.auth!.userId,
        },
      });
      if (application.status === 'SHORTLISTED') {
        await tx.application.update({ where: { id: application.id }, data: { status: 'INTERVIEW' } });
        await tx.applicationEvent.create({
          data: {
            applicationId: application.id,
            actorUserId: req.auth!.userId,
            action: 'STATUS_CHANGED',
            note: `Moved to interview: ${input.note ?? 'interview scheduled'}`,
          },
        });
        await recordAudit(
          {
            ...metadata(req),
            actorId: req.auth!.userId,
            action: 'recruitment.application_status_changed',
            entityType: 'Application',
            entityId: application.id,
            reason: input.note ?? null,
            before: auditFields(application, ['status']),
            after: { status: 'INTERVIEW' },
          },
          tx,
        );
      }
      await tx.applicationEvent.create({
        data: {
          applicationId: application.id,
          actorUserId: req.auth!.userId,
          action: 'INTERVIEW_SCHEDULED',
          note: input.note ?? null,
        },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'recruitment.interview_scheduled',
          entityType: 'Interview',
          entityId: row.id,
          reason: input.note ?? null,
          after: auditFields(row, ['applicationId', 'panelAssignmentId', 'scheduledAt', 'location']),
        },
        tx,
      );
      return tx.interview.findUniqueOrThrow({ where: { id: row.id }, include: interviewInclude });
    });
    await notifyUsers(prisma, assignment ? [assignment.userId] : [], {
      eventType: 'recruitment.interview_scheduled',
      title: 'Interview scheduled',
      safeSummary: `An interview for application ${application.reference} has been scheduled.`,
      relatedEntityType: 'Interview',
      relatedEntityId: created.id,
    });
    res.status(201).json(await toInterviewDto(created, prisma));
  }),
);

router.get(
  '/interviews',
  requireAuth,
  requirePermission('recruitment.view', 'candidate.view'),
  asyncRoute(async (req, res) => {
    const applicationId = typeof req.query.applicationId === 'string' ? req.query.applicationId : undefined;
    if (applicationId) {
      const visible = await prisma.application.findFirst({
        where: { id: applicationId, ...applicationVisibilityWhere(req) },
        select: { id: true },
      });
      if (!visible) throw notFound('Application not found');
    }
    const rows = await prisma.interview.findMany({
      where: {
        ...(applicationId ? { applicationId } : {}),
        application: applicationVisibilityWhere(req),
      },
      include: interviewInclude,
      orderBy: { scheduledAt: 'asc' },
    });
    res.json(await Promise.all(rows.map((row) => toInterviewDto(row, prisma))));
  }),
);

router.post(
  '/scorecards',
  requireAuth,
  requirePermission('candidate.score'),
  asyncRoute(async (req, res) => {
    const input = scorecardCreateSchema.parse(req.body);
    const application = await prisma.application.findUnique({
      where: { id: input.applicationId },
      select: { id: true, vacancyId: true, status: true },
    });
    if (!application) throw notFound('Application not found');
    const assignment = await prisma.panelAssignment.findFirst({
      where: { vacancyId: application.vacancyId, userId: req.auth!.userId },
      select: { id: true },
    });
    if (!assignment) throw forbidden('Only assigned panel members can submit scorecards');
    const duplicate = await prisma.scorecard.findUnique({
      where: {
        applicationId_panelAssignmentId: { applicationId: application.id, panelAssignmentId: assignment.id },
      },
      select: { id: true },
    });
    if (duplicate) throw conflict('A scorecard has already been submitted by this panel member');
    if (!SCORECARD_STATUSES.has(application.status)) {
      throw conflict('Scorecards can only be submitted for shortlisted or interviewed applications');
    }
    const criteria: Prisma.InputJsonValue = input.criteria.map((criterion) => ({
      name: criterion.name,
      score: criterion.score,
      comment: criterion.comment ?? null,
    }));
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.scorecard.create({
        data: {
          applicationId: application.id,
          panelAssignmentId: assignment.id,
          criteria,
          recommendation: input.recommendation,
          strengths: input.strengths ?? null,
          concerns: input.concerns ?? null,
        },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'recruitment.scorecard_submitted',
          entityType: 'Scorecard',
          entityId: row.id,
          after: { applicationId: application.id, panelAssignmentId: assignment.id, recommendation: input.recommendation },
        },
        tx,
      );
      return tx.scorecard.findUniqueOrThrow({ where: { id: row.id }, include: scorecardInclude });
    });
    res.status(201).json(await toScorecardDto(created, prisma));
  }),
);

router.get(
  '/scorecards',
  requireAuth,
  requirePermission('recruitment.view', 'candidate.view'),
  asyncRoute(async (req, res) => {
    const applicationId = typeof req.query.applicationId === 'string' ? req.query.applicationId : undefined;
    if (applicationId) {
      const visible = await prisma.application.findFirst({
        where: { id: applicationId, ...applicationVisibilityWhere(req) },
        select: { id: true },
      });
      if (!visible) throw notFound('Application not found');
    }
    const rows = await prisma.scorecard.findMany({
      where: {
        ...(applicationId ? { applicationId } : {}),
        application: applicationVisibilityWhere(req),
      },
      include: scorecardInclude,
      orderBy: { submittedAt: 'asc' },
    });
    res.json(await Promise.all(rows.map((row) => toScorecardDto(row, prisma))));
  }),
);

export default router;
