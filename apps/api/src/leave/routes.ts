import { randomUUID } from 'node:crypto';
import { Router, type Request } from 'express';
import type { Prisma } from '@prisma/client';
import {
  isLeaveTransitionAllowed,
  leaveBalanceAdjustSchema,
  leaveBalanceQuerySchema,
  leaveCancelSchema,
  leaveDecisionSchema,
  leavePolicyUpsertSchema,
  leaveRequestCreateSchema,
  leaveRequestQuerySchema,
  leaveTypeCreateSchema,
  leaveTypeUpdateSchema,
  type LeaveBalanceDto,
  type LeavePolicyDto,
  type LeaveRequestDto,
  type LeaveRequestStatus,
  type LeaveTypeDto,
  type ScopeType,
} from '@umu-hr/shared';
import { prisma } from '../db.js';
import { isCurrent, parseDate, toDateOnly, today } from '../dates.js';
import { asyncRoute, badRequest, conflict, forbidden, invalidTransition, notFound } from '../errors.js';
import { sendPaginated } from '../http.js';
import { requireAuth, requirePermission } from '../access/middleware.js';
import { hasPermission } from '../access/policy.js';
import { auditFields, recordAudit } from '../audit/service.js';
import { notifyPermissionHolders, notifyUsers } from '../notifications/service.js';
import { currentUnitIds } from '../employees/service.js';
import type { findEmployeeOrThrow } from '../employees/service.js';
import {
  accessibleEmployeeWhere,
  businessDaysBetween,
  employeeName,
  metadata,
  periodForDate,
  requireEmployeeInScope,
  requireOwnEmployee,
  userDisplayName,
} from '../phase2/service.js';

const router = Router();

const leaveTypeInclude = { policies: { orderBy: { period: 'asc' } } } satisfies Prisma.LeaveTypeInclude;
type LeaveTypeRow = Prisma.LeaveTypeGetPayload<{ include: typeof leaveTypeInclude }>;

const leaveBalanceInclude = { leaveType: { select: { name: true } } } satisfies Prisma.LeaveBalanceInclude;
type LeaveBalanceRow = Prisma.LeaveBalanceGetPayload<{ include: typeof leaveBalanceInclude }>;

const leaveRequestInclude = {
  employee: { select: { id: true, staffNumber: true, firstName: true, lastName: true } },
  leaveType: { select: { id: true, name: true, code: true, requiresHrReview: true } },
  requestedBy: { select: { id: true, email: true } },
  workflow: {
    include: {
      steps: {
        orderBy: { stepOrder: 'asc' },
        include: { actor: { select: { email: true } } },
      },
    },
  },
  documents: { select: { documentId: true } },
} satisfies Prisma.LeaveRequestInclude;
type LeaveRequestRow = Prisma.LeaveRequestGetPayload<{ include: typeof leaveRequestInclude }>;

interface Approver {
  approverUserId: string | null;
  approverRoleKey: string;
  scopeType: ScopeType;
  scopeUnitId: string | null;
}

interface PolicyRow {
  id: string;
  leaveTypeId: string;
  period: string;
  entitlementDays: number;
  carryoverCapDays: number;
  maxConsecutiveDays: number;
  minNoticeDays: number;
  allowNegativeBalance: boolean;
}

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toPolicyDto(row: PolicyRow): LeavePolicyDto {
  return {
    id: row.id,
    leaveTypeId: row.leaveTypeId,
    period: row.period,
    entitlementDays: row.entitlementDays,
    carryoverCapDays: row.carryoverCapDays,
    maxConsecutiveDays: row.maxConsecutiveDays,
    minNoticeDays: row.minNoticeDays,
    allowNegativeBalance: row.allowNegativeBalance,
  };
}

function toTypeDto(row: LeaveTypeRow): LeaveTypeDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    requiresReason: row.requiresReason,
    requiresEvidence: row.requiresEvidence,
    requiresHrReview: row.requiresHrReview,
    isActive: row.isActive,
    policies: row.policies.map(toPolicyDto),
  };
}

function toBalanceDto(row: LeaveBalanceRow): LeaveBalanceDto {
  return {
    id: row.id,
    employeeId: row.employeeId,
    leaveTypeId: row.leaveTypeId,
    leaveTypeName: row.leaveType.name,
    period: row.period,
    entitlementDays: row.entitlementDays,
    carryoverDays: row.carryoverDays,
    usedDays: row.usedDays,
    adjustmentDays: row.adjustmentDays,
    availableDays: row.entitlementDays + row.carryoverDays + row.adjustmentDays - row.usedDays,
  };
}

async function toLeaveRequestDto(row: LeaveRequestRow, includeReason: boolean): Promise<LeaveRequestDto> {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: employeeName(row.employee),
    staffNumber: row.employee.staffNumber,
    leaveTypeId: row.leaveTypeId,
    leaveTypeName: row.leaveType.name,
    startDate: toDateOnly(row.startDate),
    endDate: toDateOnly(row.endDate),
    daysRequested: row.daysRequested,
    reason: includeReason ? row.reason : null,
    isHalfDay: row.isHalfDay,
    status: row.status,
    submittedAt: isoOrNull(row.submittedAt),
    decidedAt: isoOrNull(row.decidedAt),
    decisionComment: includeReason ? row.decisionComment : null,
    createdAt: row.createdAt.toISOString(),
    steps: await Promise.all(
      (row.workflow?.steps ?? []).map(async (step) => ({
        id: step.id,
        stepOrder: step.stepOrder,
        name: step.name,
        approverRoleKey: step.approverRoleKey,
        approverName:
          (await userDisplayName(prisma, step.approverUserId)) ?? step.actor?.email ?? null,
        status: step.status,
        decision: step.decision,
        comment: step.comment,
        actedAt: isoOrNull(step.actedAt),
        dueAt: isoOrNull(step.dueAt),
      })),
    ),
    documentIds: row.documents.map((document) => document.documentId),
  };
}

async function approverForEmployee(
  employee: Awaited<ReturnType<typeof findEmployeeOrThrow>>,
  requesterUserId: string,
): Promise<Approver> {
  const assignments = employee.assignments.filter((assignment) => isCurrent(assignment));
  const assignment = assignments.find((item) => item.assignmentType === 'PRIMARY') ?? assignments[0];
  const unitId = assignment?.unitId ?? null;

  async function userForEmployee(employeeId: string | null): Promise<string | null> {
    if (!employeeId) return null;
    const user = await prisma.user.findFirst({
      where: { employeeId, status: 'ACTIVE' },
      select: { id: true },
    });
    return user && user.id !== requesterUserId ? user.id : null;
  }

  const supervisorUserId = await userForEmployee(assignment?.supervisorEmployeeId ?? null);
  if (supervisorUserId) {
    return {
      approverUserId: supervisorUserId,
      approverRoleKey: 'SUPERVISOR',
      scopeType: 'TEAM',
      scopeUnitId: unitId,
    };
  }

  const unit = unitId
    ? await prisma.orgUnit.findUnique({
        where: { id: unitId },
        select: { id: true, type: true, headEmployeeId: true },
      })
    : null;
  const headUserId = await userForEmployee(unit?.headEmployeeId ?? null);
  const scopeType: ScopeType = unit?.type === 'FACULTY' ? 'FACULTY' : 'DEPARTMENT';
  if (headUserId && unit) {
    return {
      approverUserId: headUserId,
      approverRoleKey: 'HOD',
      scopeType,
      scopeUnitId: unit.id,
    };
  }

  return {
    approverUserId: null,
    approverRoleKey: 'HR_OFFICER',
    scopeType: unit ? scopeType : 'INSTITUTION',
    scopeUnitId: unit?.id ?? null,
  };
}

async function employeeUserIds(employeeId: string, requestedById: string): Promise<string[]> {
  const user = await prisma.user.findFirst({ where: { employeeId }, select: { id: true } });
  return [...new Set([requestedById, ...(user ? [user.id] : [])])];
}

function canViewReason(req: Request, employeeId: string): boolean {
  return req.auth!.employeeId === employeeId || hasPermission(req.auth!, 'leave.manage');
}

router.get(
  '/types',
  requireAuth,
  requirePermission('leave.view'),
  asyncRoute(async (req, res) => {
    const types = await prisma.leaveType.findMany({
      where: hasPermission(req.auth!, 'leave.manage') ? {} : { isActive: true },
      include: leaveTypeInclude,
      orderBy: { code: 'asc' },
    });
    res.json(types.map(toTypeDto));
  }),
);

router.post(
  '/types',
  requireAuth,
  requirePermission('leave.manage'),
  asyncRoute(async (req, res) => {
    const input = leaveTypeCreateSchema.parse(req.body);
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.leaveType.create({ data: input });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'leave.type_created',
          entityType: 'LeaveType',
          entityId: row.id,
          after: auditFields(input, ['code', 'name', 'requiresReason', 'requiresEvidence', 'requiresHrReview']),
        },
        tx,
      );
      return row;
    });
    res.status(201).json(toTypeDto({ ...created, policies: [] }));
  }),
);

router.patch(
  '/types/:id',
  requireAuth,
  requirePermission('leave.manage'),
  asyncRoute(async (req, res) => {
    const id = req.params.id as string;
    const input = leaveTypeUpdateSchema.parse(req.body);
    const current = await prisma.leaveType.findUnique({ where: { id } });
    if (!current) throw notFound('Leave type not found');
    await prisma.$transaction(async (tx) => {
      const row = await tx.leaveType.update({ where: { id }, data: input });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'leave.type_updated',
          entityType: 'LeaveType',
          entityId: id,
          before: auditFields(current, ['name', 'isActive', 'requiresReason', 'requiresEvidence', 'requiresHrReview']),
          after: auditFields(row, ['name', 'isActive', 'requiresReason', 'requiresEvidence', 'requiresHrReview']),
        },
        tx,
      );
    });
    const updated = await prisma.leaveType.findUniqueOrThrow({
      where: { id },
      include: leaveTypeInclude,
    });
    res.json(toTypeDto(updated));
  }),
);

router.get(
  '/policies',
  requireAuth,
  requirePermission('leave.view'),
  asyncRoute(async (req, res) => {
    const policies = await prisma.leavePolicy.findMany({
      orderBy: { period: 'desc' },
    });
    res.json(policies.map((policy) => toPolicyDto(policy)));
  }),
);

router.post(
  '/policies',
  requireAuth,
  requirePermission('leave.manage'),
  asyncRoute(async (req, res) => {
    const input = leavePolicyUpsertSchema.parse(req.body);
    const leaveType = await prisma.leaveType.findUnique({ where: { id: input.leaveTypeId } });
    if (!leaveType) throw notFound('Leave type not found');
    const id = randomUUID();
    const policy = await prisma.$transaction(async (tx) => {
      const row = await tx.leavePolicy.upsert({
        where: { leaveTypeId_period: { leaveTypeId: input.leaveTypeId, period: input.period } },
        create: { id, ...input },
        update: {
          entitlementDays: input.entitlementDays,
          carryoverCapDays: input.carryoverCapDays,
          maxConsecutiveDays: input.maxConsecutiveDays,
          minNoticeDays: input.minNoticeDays,
          allowNegativeBalance: input.allowNegativeBalance,
        },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'leave.policy_saved',
          entityType: 'LeavePolicy',
          entityId: row.id,
          after: auditFields(input, [
            'leaveTypeId',
            'period',
            'entitlementDays',
            'carryoverCapDays',
            'maxConsecutiveDays',
            'minNoticeDays',
            'allowNegativeBalance',
          ]),
        },
        tx,
      );
      return row;
    });
    res.status(201).json(toPolicyDto(policy));
  }),
);

router.get(
  '/balances',
  requireAuth,
  requirePermission('leave.view'),
  asyncRoute(async (req, res) => {
    const query = leaveBalanceQuerySchema.parse(req.query);
    if (query.employeeId) {
      await requireEmployeeInScope(req, query.employeeId, 'leave.view');
    }
    const balances = await prisma.leaveBalance.findMany({
      where: {
        ...(query.employeeId
          ? { employeeId: query.employeeId }
          : { employee: accessibleEmployeeWhere(req, 'leave.view') }),
      },
      include: leaveBalanceInclude,
      orderBy: [{ period: 'desc' }, { leaveType: { name: 'asc' } }],
    });
    res.json(balances.map(toBalanceDto));
  }),
);

router.post(
  '/balances/:id/adjust',
  requireAuth,
  requirePermission('leave.adjust_balance'),
  asyncRoute(async (req, res) => {
    const id = req.params.id as string;
    const input = leaveBalanceAdjustSchema.parse(req.body);
    const balance = await prisma.leaveBalance.findUnique({
      where: { id },
      include: leaveBalanceInclude,
    });
    if (!balance) throw notFound('Leave balance not found');
    await requireEmployeeInScope(req, balance.employeeId, 'leave.adjust_balance');
    const recipients = await employeeUserIds(balance.employeeId, '');
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.leaveBalance.update({
        where: { id },
        data: { adjustmentDays: { increment: input.delta } },
        include: leaveBalanceInclude,
      });
      await tx.leaveBalanceAdjustment.create({
        data: {
          balanceId: id,
          delta: input.delta,
          reason: input.reason,
          createdById: req.auth!.userId,
        },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'leave.balance_adjusted',
          entityType: 'LeaveBalance',
          entityId: id,
          reason: input.reason,
          before: auditFields(balance, ['adjustmentDays']),
          after: auditFields(row, ['adjustmentDays']),
        },
        tx,
      );
      await notifyUsers(tx, recipients, {
        eventType: 'leave.balance_adjusted',
        title: 'Leave balance adjusted',
        safeSummary: 'Your leave balance was adjusted by HR.',
        relatedEntityType: 'LeaveBalance',
        relatedEntityId: id,
      });
      return row;
    });
    res.json(toBalanceDto(updated));
  }),
);

router.get(
  '/requests',
  requireAuth,
  requirePermission('leave.view'),
  asyncRoute(async (req, res) => {
    const query = leaveRequestQuerySchema.parse(req.query);
    const filters: Prisma.LeaveRequestWhereInput[] = [
      { employee: accessibleEmployeeWhere(req, 'leave.view') },
    ];
    if (query.status) filters.push({ status: query.status });
    if (query.employeeId) filters.push({ employeeId: query.employeeId });
    if (query.leaveTypeId) filters.push({ leaveTypeId: query.leaveTypeId });
    if (query.fromDate) filters.push({ startDate: { gte: parseDate(query.fromDate) } });
    if (query.toDate) filters.push({ endDate: { lte: parseDate(query.toDate) } });

    const where: Prisma.LeaveRequestWhereInput = { AND: filters };
    const [rows, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        include: leaveRequestInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.leaveRequest.count({ where }),
    ]);
    const items = await Promise.all(
      rows.map((row) => toLeaveRequestDto(row, canViewReason(req, row.employeeId))),
    );
    sendPaginated(res, items, total, query.page, query.pageSize);
  }),
);

router.get(
  '/requests/:id',
  requireAuth,
  requirePermission('leave.view'),
  asyncRoute(async (req, res) => {
    const row = await prisma.leaveRequest.findUnique({
      where: { id: req.params.id as string },
      include: leaveRequestInclude,
    });
    if (!row) throw notFound('Leave request not found');
    await requireEmployeeInScope(req, row.employeeId, 'leave.view');
    res.json(await toLeaveRequestDto(row, canViewReason(req, row.employeeId)));
  }),
);

router.post(
  '/requests',
  requireAuth,
  requirePermission('leave.submit'),
  asyncRoute(async (req, res) => {
    const input = leaveRequestCreateSchema.parse(req.body);
    const employeeId = input.employeeId ?? requireOwnEmployee(req);
    const employee = await requireEmployeeInScope(req, employeeId, 'leave.submit');
    const startDate = parseDate(input.startDate);
    const endDate = parseDate(input.endDate);
    const monthlyPeriod = periodForDate(startDate);

    const leaveType = await prisma.leaveType.findUnique({
      where: { id: input.leaveTypeId },
      include: leaveTypeInclude,
    });
    if (!leaveType || !leaveType.isActive) throw notFound('Active leave type not found');
    const policy =
      leaveType.policies.find((item) => item.period === monthlyPeriod) ??
      leaveType.policies.find((item) => item.period === monthlyPeriod.slice(0, 4));
    if (!policy) throw badRequest(`No leave policy is configured for ${monthlyPeriod}`);
    const period = policy.period;

    if (leaveType.requiresReason && (!input.reason || input.reason.trim().length < 3)) {
      throw badRequest('A reason of at least 3 characters is required for this leave type');
    }
    if (leaveType.requiresEvidence && (!input.documentIds || input.documentIds.length === 0)) {
      throw badRequest('Supporting documents are required for this leave type');
    }
    if (input.documentIds && input.documentIds.length > 0) {
      const documents = await prisma.document.findMany({
        where: {
          id: { in: input.documentIds },
          employeeId,
          retentionStatus: 'ACTIVE',
        },
        select: { id: true },
      });
      if (documents.length !== input.documentIds.length) {
        throw badRequest('All supporting documents must belong to the employee and be active');
      }
    }

    const daysRequested = input.isHalfDay ? 0.5 : businessDaysBetween(startDate, endDate);
    if (daysRequested <= 0) throw badRequest('Leave must cover at least one working day');
    if (daysRequested > policy.maxConsecutiveDays) {
      throw badRequest(`Leave cannot exceed ${policy.maxConsecutiveDays} consecutive days`);
    }
    const noticeDays = Math.floor((startDate.getTime() - today().getTime()) / 86_400_000);
    if (noticeDays < 0) throw badRequest('Leave cannot start in the past');
    if (noticeDays < policy.minNoticeDays) {
      throw badRequest(`This leave type requires ${policy.minNoticeDays} days notice`);
    }

    const overlap = await prisma.leaveRequest.findFirst({
      where: {
        employeeId,
        status: { in: ['SUBMITTED', 'PENDING_HR', 'APPROVED'] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { id: true },
    });
    if (overlap) throw conflict('Leave overlaps an existing pending or approved request');

    const balance = await prisma.leaveBalance.findUnique({
      where: { employeeId_leaveTypeId_period: { employeeId, leaveTypeId: input.leaveTypeId, period } },
    });
    const availableDays = balance
      ? balance.entitlementDays + balance.carryoverDays + balance.adjustmentDays - balance.usedDays
      : policy.entitlementDays;
    if (daysRequested > availableDays && !policy.allowNegativeBalance) {
      throw badRequest('Insufficient leave balance for this request');
    }

    const approver = await approverForEmployee(employee, req.auth!.userId);
    const requestId = randomUUID();
    const workflowId = randomUUID();
    const timestamp = new Date();
    const status = 'SUBMITTED' as const;

    const created = await prisma.$transaction(async (tx) => {
      if (!balance) {
        await tx.leaveBalance.create({
          data: {
            employeeId,
            leaveTypeId: input.leaveTypeId,
            period,
            entitlementDays: policy.entitlementDays,
          },
        });
      }
      await tx.workflowInstance.create({
        data: {
          id: workflowId,
          entityType: 'LeaveRequest',
          entityId: requestId,
          status: 'PENDING',
          currentStep: 1,
          startedAt: timestamp,
          steps: {
            create: [
              {
                stepOrder: 1,
                name: 'Line manager approval',
                approverRoleKey: approver.approverRoleKey,
                approverUserId: approver.approverUserId,
                scopeType: approver.scopeType,
                scopeUnitId: approver.scopeUnitId,
                status: 'ACTIVE',
              },
              ...(leaveType.requiresHrReview
                ? [
                    {
                      stepOrder: 2,
                      name: 'HR review',
                      approverRoleKey: 'HR_OFFICER',
                      scopeType: 'INSTITUTION' as ScopeType,
                      status: 'PENDING' as const,
                    },
                  ]
                : []),
            ],
          },
        },
      });
      const row = await tx.leaveRequest.create({
        data: {
          id: requestId,
          employeeId,
          leaveTypeId: input.leaveTypeId,
          period,
          requestedById: req.auth!.userId,
          startDate,
          endDate,
          daysRequested,
          reason: input.reason ?? null,
          isHalfDay: input.isHalfDay,
          status,
          submittedAt: timestamp,
          workflowInstanceId: workflowId,
          documents: {
            create: (input.documentIds ?? []).map((documentId) => ({ documentId })),
          },
        },
        include: leaveRequestInclude,
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'leave.submitted',
          entityType: 'LeaveRequest',
          entityId: row.id,
          after: {
            employeeId,
            leaveTypeId: input.leaveTypeId,
            startDate: input.startDate,
            endDate: input.endDate,
            daysRequested,
            status,
          },
        },
        tx,
      );
      await notifyUsers(tx, await employeeUserIds(employeeId, req.auth!.userId), {
        eventType: 'leave.submitted',
        title: 'Leave request submitted',
        safeSummary: `A leave request for ${toDateOnly(startDate)} to ${toDateOnly(endDate)} was submitted.`,
        relatedEntityType: 'LeaveRequest',
        relatedEntityId: row.id,
      });
      await notifyPermissionHolders(tx, {
        permission: 'leave.approve',
        employeeId,
        employeeUnitIds: currentUnitIds(employee),
        excludeUserId: req.auth!.userId,
        eventType: 'leave.approval_required',
        title: 'Leave approval required',
        safeSummary: 'A leave request is waiting for approval.',
        relatedEntityType: 'LeaveRequest',
        relatedEntityId: row.id,
      });
      return row;
    });

    res.status(201).json(await toLeaveRequestDto(created, canViewReason(req, employeeId)));
  }),
);

router.post(
  '/requests/:id/decision',
  requireAuth,
  requirePermission('leave.approve', 'leave.reject'),
  asyncRoute(async (req, res) => {
    const input = leaveDecisionSchema.parse(req.body);
    const id = req.params.id as string;
    const current = await prisma.leaveRequest.findUnique({
      where: { id },
      include: leaveRequestInclude,
    });
    if (!current) throw notFound('Leave request not found');
    const permission = input.action === 'REJECT' ? 'leave.reject' : 'leave.approve';
    if (!hasPermission(req.auth!, permission)) {
      throw forbidden(`Missing required permission: ${permission}`);
    }
    await requireEmployeeInScope(req, current.employeeId, permission);
    const requesterIds = await employeeUserIds(current.employeeId, current.requestedById);
    if (requesterIds.includes(req.auth!.userId)) {
      throw forbidden('You cannot decide your own leave request');
    }

    const workflow = current.workflow;
    if (!workflow) throw conflict('Leave request has no approval workflow');
    const activeStep = workflow.steps.find((step) => step.status === 'ACTIVE');
    if (!activeStep) throw conflict('Leave request has no active approval step');
    if (
      activeStep.approverUserId &&
      activeStep.approverUserId !== req.auth!.userId &&
      !hasPermission(req.auth!, 'leave.manage')
    ) {
      throw forbidden('This leave request is assigned to another approver');
    }

    let targetStatus: LeaveRequestStatus;
    if (input.action === 'REJECT') targetStatus = 'REJECTED';
    else if (input.action === 'SEND_HR') targetStatus = 'PENDING_HR';
    else if (current.status === 'SUBMITTED' && current.leaveType.requiresHrReview) {
      targetStatus = 'PENDING_HR';
    } else {
      targetStatus = 'APPROVED';
    }
    if (!isLeaveTransitionAllowed(current.status, targetStatus)) {
      throw invalidTransition(`Cannot change leave request status from ${current.status} to ${targetStatus}`);
    }

    const timestamp = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      await tx.workflowStep.update({
        where: { id: activeStep.id },
        data: {
          status: input.action === 'REJECT' ? 'REJECTED' : input.action === 'SEND_HR' ? 'SKIPPED' : 'APPROVED',
          decision: input.action,
          comment: input.comment ?? null,
          actorUserId: req.auth!.userId,
          actedAt: timestamp,
        },
      });

      if (targetStatus === 'PENDING_HR') {
        await tx.workflowInstance.update({
          where: { id: workflow.id },
          data: { status: 'IN_PROGRESS', currentStep: 2 },
        });
        await tx.workflowStep.upsert({
          where: { instanceId_stepOrder: { instanceId: workflow.id, stepOrder: 2 } },
          create: {
            instanceId: workflow.id,
            stepOrder: 2,
            name: 'HR review',
            approverRoleKey: 'HR_OFFICER',
            scopeType: 'INSTITUTION',
            status: 'ACTIVE',
          },
          update: { status: 'ACTIVE' },
        });
      } else {
        await tx.workflowInstance.update({
          where: { id: workflow.id },
          data: {
            status: targetStatus === 'APPROVED' ? 'COMPLETED' : 'REJECTED',
            currentStep: activeStep.stepOrder,
            completedAt: timestamp,
          },
        });
      }

      if (targetStatus === 'APPROVED') {
        const balance = await tx.leaveBalance.findUnique({
          where: {
            employeeId_leaveTypeId_period: {
              employeeId: current.employeeId,
              leaveTypeId: current.leaveTypeId,
              period: current.period,
            },
          },
        });
        if (!balance) throw conflict('Leave balance record is missing');
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { usedDays: { increment: current.daysRequested } },
        });
      }

      const row = await tx.leaveRequest.update({
        where: { id },
        data: {
          status: targetStatus,
          decidedAt: targetStatus === 'APPROVED' || targetStatus === 'REJECTED' ? timestamp : null,
          decidedById: targetStatus === 'APPROVED' || targetStatus === 'REJECTED' ? req.auth!.userId : null,
          decisionComment: input.comment ?? null,
        },
        include: leaveRequestInclude,
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: `leave.${input.action.toLowerCase()}`,
          entityType: 'LeaveRequest',
          entityId: id,
          reason: input.comment ?? null,
          before: auditFields(current, ['status', 'decidedAt', 'decisionComment']),
          after: auditFields(row, ['status', 'decidedAt', 'decisionComment']),
        },
        tx,
      );
      await notifyUsers(tx, requesterIds, {
        eventType: 'leave.decision',
        title: 'Leave request update',
        safeSummary: `Your leave request is now ${targetStatus.replace('_', ' ').toLowerCase()}.`,
        relatedEntityType: 'LeaveRequest',
        relatedEntityId: id,
      });
      return row;
    });

    res.json(await toLeaveRequestDto(updated, canViewReason(req, current.employeeId)));
  }),
);

router.post(
  '/requests/:id/cancel',
  requireAuth,
  asyncRoute(async (req, res) => {
    const input = leaveCancelSchema.parse(req.body);
    const id = req.params.id as string;
    const current = await prisma.leaveRequest.findUnique({
      where: { id },
      include: leaveRequestInclude,
    });
    if (!current) throw notFound('Leave request not found');
    const isRequester = req.auth!.employeeId === current.employeeId;
    if (!isRequester && !hasPermission(req.auth!, 'leave.manage')) {
      throw forbidden('Only the requester or an HR manager can cancel this leave request');
    }
    await requireEmployeeInScope(req, current.employeeId, 'leave.view');
    if (!isLeaveTransitionAllowed(current.status, 'CANCELLED')) {
      throw invalidTransition(`Cannot cancel a leave request in status ${current.status}`);
    }
    const recipients = await employeeUserIds(current.employeeId, current.requestedById);

    const updated = await prisma.$transaction(async (tx) => {
      if (current.status === 'APPROVED') {
        const balance = await tx.leaveBalance.findUnique({
          where: {
            employeeId_leaveTypeId_period: {
              employeeId: current.employeeId,
              leaveTypeId: current.leaveTypeId,
              period: current.period,
            },
          },
        });
        if (!balance) throw conflict('Leave balance record is missing');
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { usedDays: Math.max(0, balance.usedDays - current.daysRequested) },
        });
      }
      if (current.workflow) {
        await tx.workflowInstance.update({
          where: { id: current.workflow.id },
          data: { status: 'CANCELLED', canceledAt: new Date() },
        });
        await tx.workflowStep.updateMany({
          where: { instanceId: current.workflow.id, status: 'ACTIVE' },
          data: { status: 'SKIPPED', decision: 'CANCELLED', comment: input.reason },
        });
      }
      const row = await tx.leaveRequest.update({
        where: { id },
        data: { status: 'CANCELLED', decisionComment: input.reason },
        include: leaveRequestInclude,
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'leave.cancelled',
          entityType: 'LeaveRequest',
          entityId: id,
          reason: input.reason,
          before: auditFields(current, ['status']),
          after: auditFields(row, ['status']),
        },
        tx,
      );
      await notifyUsers(tx, recipients, {
        eventType: 'leave.cancelled',
        title: 'Leave request cancelled',
        safeSummary: 'A leave request was cancelled.',
        relatedEntityType: 'LeaveRequest',
        relatedEntityId: id,
      });
      return row;
    });

    res.json(await toLeaveRequestDto(updated, canViewReason(req, current.employeeId)));
  }),
);

export default router;
