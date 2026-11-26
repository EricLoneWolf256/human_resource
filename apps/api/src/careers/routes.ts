import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  applicationCreateSchema,
  applicationTrackSchema,
  isApplicationTransitionAllowed,
  offerResponseSchema,
  type ApplicationTrackingDto,
  type PublicVacancyDto,
} from '@umu-hr/shared';
import { prisma } from '../db.js';
import { today, toDateOnly } from '../dates.js';
import { asyncRoute, conflict, invalidTransition, notFound } from '../errors.js';
import { auditFields, recordAudit } from '../audit/service.js';
import { notifyUsers } from '../notifications/service.js';
import { metadata } from '../phase2/service.js';

const router = Router();

const vacancyInclude = {
  unit: { select: { name: true } },
  position: { select: { title: true } },
} satisfies Prisma.VacancyInclude;
type VacancyRow = Prisma.VacancyGetPayload<{ include: typeof vacancyInclude }>;

const applicationInclude = {
  vacancy: { select: { title: true } },
  applicant: { select: { email: true } },
} satisfies Prisma.ApplicationInclude;
type ApplicationRow = Prisma.ApplicationGetPayload<{ include: typeof applicationInclude }>;

const offerResponseInputSchema = offerResponseSchema.extend({
  email: z.string().trim().email().max(254),
});

const OFFER_STATUSES = new Set(['OFFERED', 'ACCEPTED', 'DECLINED']);
const responseAttempts = new Map<string, { count: number; resetAt: number }>();

function throttle(key: string): void {
  const now = Date.now();
  const current = responseAttempts.get(key);
  if (!current || current.resetAt <= now) {
    responseAttempts.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }
  if (current.count >= 10) throw conflict('Too many attempts. Please try again later.');
  current.count += 1;
}

function toPublicVacancyDto(row: VacancyRow): PublicVacancyDto {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    requirements: row.requirements,
    unitName: row.unit.name,
    positionTitle: row.position?.title ?? null,
    employmentType: row.employmentType,
    openings: row.openings,
    closingDate: toDateOnly(row.closingDate),
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
  };
}

function toTrackingDto(row: ApplicationRow): ApplicationTrackingDto {
  return {
    reference: row.reference,
    vacancyTitle: row.vacancy.title,
    status: row.status,
    submittedAt: row.submittedAt.toISOString(),
    decisionAt: row.decisionAt ? row.decisionAt.toISOString() : null,
    offerDetails: OFFER_STATUSES.has(row.status) ? row.offerDetails : null,
  };
}

function nextApplicationReference(): string {
  return `APP-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

async function activeRecruitmentManagerIds(): Promise<string[]> {
  const assignments = await prisma.roleAssignment.findMany({
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
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, status: 'ACTIVE' },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

router.get(
  '/vacancies',
  asyncRoute(async (_req, res) => {
    const vacancies = await prisma.vacancy.findMany({
      where: { status: 'PUBLISHED', closingDate: { gte: today() } },
      include: vacancyInclude,
      orderBy: { publishedAt: 'desc' },
    });
    res.json(vacancies.map(toPublicVacancyDto));
  }),
);

router.get(
  '/vacancies/:id',
  asyncRoute(async (req, res) => {
    const vacancy = await prisma.vacancy.findFirst({
      where: { id: req.params.id as string, status: 'PUBLISHED', closingDate: { gte: today() } },
      include: vacancyInclude,
    });
    if (!vacancy) throw notFound('Vacancy not found');
    res.json(toPublicVacancyDto(vacancy));
  }),
);

router.post(
  '/applications',
  asyncRoute(async (req, res) => {
    const input = applicationCreateSchema.parse(req.body);
    const vacancy = await prisma.vacancy.findFirst({
      where: { id: input.vacancyId, status: 'PUBLISHED', closingDate: { gte: today() } },
      select: { id: true, title: true },
    });
    if (!vacancy) throw notFound('Published vacancy not found');
    const existingApplicants = await prisma.applicant.findMany({
      where: { email: input.email },
      select: { id: true },
    });
    if (existingApplicants.length > 0) {
      const duplicate = await prisma.application.findFirst({
        where: { vacancyId: vacancy.id, applicantId: { in: existingApplicants.map((item) => item.id) } },
        select: { id: true },
      });
      if (duplicate) throw conflict('An application has already been submitted for this email');
    }
    const timestamp = new Date();
    const reference = nextApplicationReference();
    const created = await prisma.$transaction(async (tx) => {
      const applicant = await tx.applicant.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone ?? null,
          coverNote: input.coverNote ?? null,
          qualifications: input.qualifications ?? null,
        },
      });
      const application = await tx.application.create({
        data: {
          reference,
          vacancyId: vacancy.id,
          applicantId: applicant.id,
          status: 'SUBMITTED',
          submittedAt: timestamp,
        },
      });
      await tx.applicationEvent.create({
        data: { applicationId: application.id, action: 'SUBMITTED' },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorLabel: 'Public careers portal',
          action: 'recruitment.application_submitted',
          entityType: 'Application',
          entityId: application.id,
          after: { reference, vacancyId: vacancy.id, status: 'SUBMITTED' },
        },
        tx,
      );
      return application;
    });
    await notifyUsers(prisma, await activeRecruitmentManagerIds(), {
      eventType: 'recruitment.application_submitted',
      title: 'New application submitted',
      safeSummary: `A new application was submitted for ${vacancy.title}.`,
      relatedEntityType: 'Application',
      relatedEntityId: created.id,
    });
    res.status(201).json({
      reference: created.reference,
      status: created.status,
      submittedAt: created.submittedAt.toISOString(),
    });
  }),
);

router.get(
  '/applications/track',
  asyncRoute(async (req, res) => {
    const input = applicationTrackSchema.parse(req.query);
    throttle(`${req.ip ?? 'unknown'}:track:${input.email.toLowerCase()}`);
    const application = await prisma.application.findUnique({
      where: { reference: input.reference },
      include: applicationInclude,
    });
    const matched = Boolean(application && application.applicant.email.toLowerCase() === input.email.toLowerCase());
    if (application) {
      await recordAudit({
        ...metadata(req),
        actorLabel: 'Public careers portal',
        action: 'recruitment.application_tracked',
        entityType: 'Application',
        entityId: application.id,
        after: { reference: input.reference, matched },
      });
    }
    if (!application || !matched) throw notFound('Application not found');
    res.json(toTrackingDto(application));
  }),
);

router.post(
  '/applications/:reference/response',
  asyncRoute(async (req, res) => {
    const input = offerResponseInputSchema.parse(req.body);
    const reference = req.params.reference as string;
    throttle(`${req.ip ?? 'unknown'}:response:${input.email.toLowerCase()}`);
    const application = await prisma.application.findUnique({
      where: { reference },
      include: applicationInclude,
    });
    if (!application || application.applicant.email.toLowerCase() !== input.email.toLowerCase()) {
      throw notFound('Application not found');
    }
    if (application.status !== 'OFFERED') throw conflict('There is no offer awaiting a response');
    const targetStatus = input.action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
    if (!isApplicationTransitionAllowed(application.status, targetStatus)) {
      throw invalidTransition(`Cannot change application status from ${application.status} to ${targetStatus}`);
    }
    const timestamp = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.application.update({
        where: { id: application.id },
        data: {
          status: targetStatus,
          decisionNote: input.note ?? application.decisionNote,
          offerRespondedAt: timestamp,
        },
      });
      await tx.applicationEvent.create({
        data: {
          applicationId: application.id,
          action: input.action === 'ACCEPT' ? 'OFFER_ACCEPTED' : 'OFFER_DECLINED',
          note: input.note ?? null,
        },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorLabel: 'Public careers portal',
          action: 'recruitment.offer_responded',
          entityType: 'Application',
          entityId: application.id,
          before: auditFields(application, ['status', 'decisionNote', 'offerRespondedAt']),
          after: auditFields(row, ['status', 'decisionNote', 'offerRespondedAt']),
        },
        tx,
      );
      return tx.application.findUniqueOrThrow({ where: { id: application.id }, include: applicationInclude });
    });
    if (targetStatus === 'ACCEPTED') {
      await notifyUsers(prisma, await activeRecruitmentManagerIds(), {
        eventType: 'recruitment.offer_accepted',
        title: 'Offer accepted',
        safeSummary: `An offer was accepted for ${updated.vacancy.title}.`,
        relatedEntityType: 'Application',
        relatedEntityId: updated.id,
      });
    }
    res.json(toTrackingDto(updated));
  }),
);

export default router;
