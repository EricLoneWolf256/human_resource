import { Router } from 'express';
import type { Request } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  hrRequestAssignSchema,
  hrRequestCreateSchema,
  hrRequestFeedbackSchema,
  hrRequestQuerySchema,
  hrRequestStatusSchema,
  isHrRequestTransitionAllowed,
  type HrRequestDto,
} from '@umu-hr/shared';
import { prisma } from '../db.js';
import { asyncRoute, conflict, forbidden, invalidTransition, notFound } from '../errors.js';
import { sendPaginated } from '../http.js';
import { requireAuth, requirePermission } from '../access/middleware.js';
import { canAccessEmployee, hasPermission } from '../access/policy.js';
import { recordAudit } from '../audit/service.js';
import { notifyUsers } from '../notifications/service.js';
import { currentUnitIds, findEmployeeOrThrow } from '../employees/service.js';
import {
  accessibleEmployeeWhere,
  employeeName,
  metadata,
  nextRequestReference,
  requireEmployeeInScope,
  requireOwnEmployee,
  userDisplayName,
} from '../phase2/service.js';

const router = Router();
const RESTRICTED_SENSITIVITY = 'HIGHLY_RESTRICTED';
const RESTRICTED_VIEW_PERMISSIONS = [
  'complaint.view_assigned',
  'complaint.assign',
  'complaint.investigate',
  'complaint.close',
] as const;
const ASSIGN_SCOPE_PERMISSIONS = ['request.assign', 'complaint.assign'] as const;
const STATUS_SCOPE_PERMISSIONS = ['request.manage', 'complaint.investigate', 'complaint.close'] as const;

const requestInclude = {
  requester: { select: { firstName: true, lastName: true } },
  events: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.HrRequestInclude;

type RequestWithRelations = Prisma.HrRequestGetPayload<{ include: typeof requestInclude }>;
type RequestDb = PrismaClient | Prisma.TransactionClient;

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

async function toDto(request: RequestWithRelations, db: RequestDb): Promise<HrRequestDto> {
  const [assignedToName, events] = await Promise.all([
    userDisplayName(db, request.assignedToUserId),
    Promise.all(
      request.events.map(async (event) => ({
        id: event.id,
        action: event.action,
        comment: event.comment,
        actorName: await userDisplayName(db, event.actorUserId),
        createdAt: event.createdAt.toISOString(),
      })),
    ),
  ]);
  return {
    id: request.id,
    reference: request.reference,
    requesterEmployeeId: request.requesterEmployeeId,
    requesterName: employeeName(request.requester),
    requestedForEmployeeId: request.requestedForEmployeeId,
    category: request.category,
    subject: request.subject,
    description: request.description,
    sensitivity: request.sensitivity,
    status: request.status,
    assignedToUserId: request.assignedToUserId,
    assignedToName,
    dueAt: isoOrNull(request.dueAt),
    resolvedAt: isoOrNull(request.resolvedAt),
    closedAt: isoOrNull(request.closedAt),
    feedbackRating: request.feedbackRating,
    isRestricted: request.sensitivity === RESTRICTED_SENSITIVITY,
    createdAt: request.createdAt.toISOString(),
    events,
  };
}

function hasRestrictedViewPermission(req: Request): boolean {
  return RESTRICTED_VIEW_PERMISSIONS.some((permission) => hasPermission(req.auth!, permission));
}

function restrictedVisibilityWhere(req: Request): Prisma.HrRequestWhereInput {
  if (hasRestrictedViewPermission(req)) return {};
  return {
    OR: [
      { sensitivity: { not: RESTRICTED_SENSITIVITY } },
      { sensitivity: RESTRICTED_SENSITIVITY, assignedToUserId: req.auth!.userId },
    ],
  };
}

function assertRestrictedView(
  req: Request,
  request: Pick<RequestWithRelations, 'sensitivity' | 'assignedToUserId'>,
): void {
  const isRestricted = request.sensitivity === RESTRICTED_SENSITIVITY;
  const isAssignee = request.assignedToUserId === req.auth!.userId;
  if (isRestricted && !isAssignee && !hasRestrictedViewPermission(req)) {
    throw forbidden('This request is restricted');
  }
}

async function assertEmployeeScope(
  req: Request,
  employeeId: string,
  permissions: readonly string[],
): Promise<void> {
  const employee = await findEmployeeOrThrow(employeeId);
  const target = { id: employee.id, currentUnitIds: currentUnitIds(employee) };
  if (!permissions.some((permission) => canAccessEmployee(req.auth!, target, permission))) {
    throw forbidden('This request is outside your access scope');
  }
}

async function requesterUserId(employeeId: string): Promise<string | null> {
  const user = await prisma.user.findFirst({ where: { employeeId }, select: { id: true } });
  return user?.id ?? null;
}

async function notificationRecipients(requesterEmployeeId: string, extraIds: string[]): Promise<string[]> {
  const recipients: string[] = [];
  const requesterId = await requesterUserId(requesterEmployeeId);
  if (requesterId) recipients.push(requesterId);
  recipients.push(...extraIds);
  return [...new Set(recipients)];
}

router.post(
  '/',
  requireAuth,
  requirePermission('request.submit'),
  asyncRoute(async (req, res) => {
    const input = hrRequestCreateSchema.parse(req.body);
    const requesterEmployeeId = requireOwnEmployee(req);
    if (input.requestedForEmployeeId) {
      await requireEmployeeInScope(req, input.requestedForEmployeeId, 'request.submit');
    }
    const reference = nextRequestReference();
    const sensitivity = input.category === 'COMPLAINT' ? RESTRICTED_SENSITIVITY : input.sensitivity;
    const created = await prisma.$transaction(async (tx) => {
      const request = await tx.hrRequest.create({
        data: {
          reference,
          requesterEmployeeId,
          requestedForEmployeeId: input.requestedForEmployeeId ?? null,
          category: input.category,
          subject: input.subject,
          description: input.description,
          sensitivity,
          status: 'OPEN',
          relatedLeaveRequestId: input.relatedLeaveRequestId ?? null,
        },
      });
      await tx.hrRequestEvent.create({
        data: { requestId: request.id, actorUserId: req.auth!.userId, action: 'CREATED' },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'request.created',
          entityType: 'HrRequest',
          entityId: request.id,
          after: { reference, requesterEmployeeId, category: input.category, sensitivity, status: 'OPEN' },
        },
        tx,
      );
      return tx.hrRequest.findUniqueOrThrow({ where: { id: request.id }, include: requestInclude });
    });
    res.status(201).json(await toDto(created, prisma));
  }),
);

router.get(
  '/',
  requireAuth,
  requirePermission('request.view'),
  asyncRoute(async (req, res) => {
    const query = hrRequestQuerySchema.parse(req.query);
    const filters: Prisma.HrRequestWhereInput[] = [
      { requester: accessibleEmployeeWhere(req, 'request.view') },
      restrictedVisibilityWhere(req),
    ];
    if (query.mine === 'true') filters.push({ requesterEmployeeId: requireOwnEmployee(req) });
    if (query.status) filters.push({ status: query.status });
    if (query.category) filters.push({ category: query.category });
    if (query.assignedToUserId) filters.push({ assignedToUserId: query.assignedToUserId });
    if (query.q) {
      filters.push({
        OR: [{ subject: { contains: query.q } }, { description: { contains: query.q } }],
      });
    }
    const where: Prisma.HrRequestWhereInput = { AND: filters };
    const [rows, total] = await Promise.all([
      prisma.hrRequest.findMany({
        where,
        include: requestInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.hrRequest.count({ where }),
    ]);
    const items = await Promise.all(rows.map((row) => toDto(row, prisma)));
    sendPaginated(res, items, total, query.page, query.pageSize);
  }),
);

router.get(
  '/:id',
  requireAuth,
  requirePermission('request.view'),
  asyncRoute(async (req, res) => {
    const request = await prisma.hrRequest.findUnique({
      where: { id: req.params.id as string },
      include: requestInclude,
    });
    if (!request) throw notFound('HR request not found');
    await requireEmployeeInScope(req, request.requesterEmployeeId, 'request.view');
    assertRestrictedView(req, request);
    res.json(await toDto(request, prisma));
  }),
);

router.post(
  '/:id/assign',
  requireAuth,
  requirePermission(...ASSIGN_SCOPE_PERMISSIONS),
  asyncRoute(async (req, res) => {
    const input = hrRequestAssignSchema.parse(req.body);
    const current = await prisma.hrRequest.findUnique({ where: { id: req.params.id as string } });
    if (!current) throw notFound('HR request not found');
    await assertEmployeeScope(req, current.requesterEmployeeId, ASSIGN_SCOPE_PERMISSIONS);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.hrRequest.update({
        where: { id: current.id },
        data: { assignedToUserId: input.assignedToUserId, status: 'ASSIGNED' },
      });
      await tx.hrRequestEvent.create({
        data: {
          requestId: current.id,
          actorUserId: req.auth!.userId,
          action: 'ASSIGNED',
          comment: input.note ?? null,
        },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'request.assigned',
          entityType: 'HrRequest',
          entityId: current.id,
          reason: input.note ?? null,
          before: { assignedToUserId: current.assignedToUserId, status: current.status },
          after: { assignedToUserId: input.assignedToUserId, status: 'ASSIGNED' },
        },
        tx,
      );
      return tx.hrRequest.findUniqueOrThrow({ where: { id: current.id }, include: requestInclude });
    });
    const recipients = await notificationRecipients(current.requesterEmployeeId, [input.assignedToUserId]);
    await notifyUsers(prisma, recipients, {
      eventType: 'request.assigned',
      title: 'HR request assigned',
      safeSummary: `HR request ${current.reference} has been assigned.`,
      relatedEntityType: 'HrRequest',
      relatedEntityId: current.id,
      priority: current.sensitivity === RESTRICTED_SENSITIVITY ? 'HIGH' : 'NORMAL',
    });
    res.json(await toDto(updated, prisma));
  }),
);

router.post(
  '/:id/status',
  requireAuth,
  requirePermission(...STATUS_SCOPE_PERMISSIONS),
  asyncRoute(async (req, res) => {
    const input = hrRequestStatusSchema.parse(req.body);
    const current = await prisma.hrRequest.findUnique({ where: { id: req.params.id as string } });
    if (!current) throw notFound('HR request not found');
    await assertEmployeeScope(req, current.requesterEmployeeId, STATUS_SCOPE_PERMISSIONS);
    if (!isHrRequestTransitionAllowed(current.status, input.status)) {
      throw invalidTransition(`Cannot change HR request status from ${current.status} to ${input.status}`);
    }
    const timestamp = new Date();
    const resolvedAt =
      input.status === 'RESOLVED' ? timestamp : input.status === 'CLOSED' ? current.resolvedAt : null;
    const closedAt = input.status === 'CLOSED' ? timestamp : null;
    const updated = await prisma.$transaction(async (tx) => {
      await tx.hrRequest.update({
        where: { id: current.id },
        data: { status: input.status, resolvedAt, closedAt },
      });
      await tx.hrRequestEvent.create({
        data: {
          requestId: current.id,
          actorUserId: req.auth!.userId,
          action: 'STATUS_CHANGED',
          comment: input.comment ?? null,
        },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'request.status_changed',
          entityType: 'HrRequest',
          entityId: current.id,
          reason: input.comment ?? null,
          before: {
            status: current.status,
            resolvedAt: isoOrNull(current.resolvedAt),
            closedAt: isoOrNull(current.closedAt),
          },
          after: { status: input.status, resolvedAt: isoOrNull(resolvedAt), closedAt: isoOrNull(closedAt) },
        },
        tx,
      );
      return tx.hrRequest.findUniqueOrThrow({ where: { id: current.id }, include: requestInclude });
    });
    const recipients = await notificationRecipients(current.requesterEmployeeId, []);
    await notifyUsers(prisma, recipients, {
      eventType: 'request.status_changed',
      title: 'HR request status updated',
      safeSummary: `HR request ${current.reference} is now ${input.status}.`,
      relatedEntityType: 'HrRequest',
      relatedEntityId: current.id,
      priority: current.sensitivity === RESTRICTED_SENSITIVITY ? 'HIGH' : 'NORMAL',
    });
    res.json(await toDto(updated, prisma));
  }),
);

router.post(
  '/:id/feedback',
  requireAuth,
  requirePermission('request.feedback'),
  asyncRoute(async (req, res) => {
    const input = hrRequestFeedbackSchema.parse(req.body);
    const requesterEmployeeId = requireOwnEmployee(req);
    const current = await prisma.hrRequest.findUnique({ where: { id: req.params.id as string } });
    if (!current) throw notFound('HR request not found');
    if (current.requesterEmployeeId !== requesterEmployeeId) {
      throw forbidden('Only the requester can provide feedback');
    }
    if (current.status !== 'CLOSED') throw conflict('Feedback is only accepted for closed requests');
    const updated = await prisma.$transaction(async (tx) => {
      await tx.hrRequest.update({
        where: { id: current.id },
        data: { feedbackRating: input.rating, feedbackComment: input.comment ?? null },
      });
      await tx.hrRequestEvent.create({
        data: {
          requestId: current.id,
          actorUserId: req.auth!.userId,
          action: 'FEEDBACK',
          comment: input.comment ?? null,
        },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'request.feedback_submitted',
          entityType: 'HrRequest',
          entityId: current.id,
          after: { feedbackRating: input.rating },
        },
        tx,
      );
      return tx.hrRequest.findUniqueOrThrow({ where: { id: current.id }, include: requestInclude });
    });
    res.json(await toDto(updated, prisma));
  }),
);

export default router;
