import { Router, type Request } from 'express';
import type { Prisma } from '@prisma/client';
import {
  assignmentCreateSchema,
  changeRequestCreateSchema,
  changeRequestDecisionSchema,
  changeRequestQuerySchema,
  employeeCreateSchema,
  employeeQuerySchema,
  employeeUpdateSchema,
  isTransitionAllowed,
  selfServiceSchema,
  statusChangeSchema,
  verifyEmployeeSchema,
  type ChangeRequestDto,
} from '@umu-hr/shared';
import { prisma } from '../db.js';
import { addDays, parseDate, toDateOnly, today } from '../dates.js';
import { asyncRoute, badRequest, conflict, forbidden, invalidTransition, notFound } from '../errors.js';
import { sendPaginated } from '../http.js';
import { requireAuth, requirePermission } from '../access/middleware.js';
import { canAccessEmployee, employeeWhere, hasPermission } from '../access/policy.js';
import { recordAudit, auditFields } from '../audit/service.js';
import { notifyPermissionHolders, notifyUsers } from '../notifications/service.js';
import {
  currentUnitIds,
  employeeInclude,
  findEmployeeOrThrow,
  profileCompleteness,
  suggestedProfileStatus,
  toEmployeeDetail,
  toEmployeeListItem,
} from './service.js';

const router = Router();
export const changeRequestRouter = Router();

function metadata(req: Request) {
  return {
    ipAddress: req.ip ?? null,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
  };
}

function requireOwnEmployee(req: Request): string {
  if (!req.auth?.employeeId) throw notFound('No employee profile is linked to this account');
  return req.auth.employeeId;
}

async function requireEmployeeInScope(req: Request, id: string, permission = 'employee.view') {
  const employee = await findEmployeeOrThrow(id);
  if (!canAccessEmployee(req.auth!, { id: employee.id, currentUnitIds: currentUnitIds(employee) }, permission)) {
    throw forbidden('This employee record is outside your access scope');
  }
  return employee;
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

router.get(
  '/me',
  requireAuth,
  asyncRoute(async (req, res) => {
    const employee = await findEmployeeOrThrow(requireOwnEmployee(req));
    res.json(toEmployeeDetail(employee, true));
  }),
);

router.patch(
  '/me/self-service',
  requireAuth,
  asyncRoute(async (req, res) => {
    const input = selfServiceSchema.parse(req.body);
    const employeeId = requireOwnEmployee(req);
    const before = await findEmployeeOrThrow(employeeId);
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.employee.update({
        where: { id: employeeId },
        data: {
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.preferredName !== undefined ? { preferredName: input.preferredName } : {}),
        },
      });
      if (input.emergencyContacts) {
        await tx.emergencyContact.deleteMany({ where: { employeeId } });
        if (input.emergencyContacts.length > 0) {
          await tx.emergencyContact.createMany({
            data: input.emergencyContacts.map((contact) => ({ employeeId, ...contact })),
          });
        }
      }
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'employee.self_service_updated',
          entityType: 'Employee',
          entityId: employeeId,
          after: auditFields(input, ['phone', 'preferredName']),
        },
        tx,
      );
      return result;
    });
    const completeness = profileCompleteness(before);
    await prisma.employee.update({
      where: { id: employeeId },
      data: { profileStatus: suggestedProfileStatus(updated.profileStatus, completeness.percent) },
    });
    res.json(toEmployeeDetail(await findEmployeeOrThrow(employeeId), true));
  }),
);

router.post(
  '/me/change-requests',
  requireAuth,
  asyncRoute(async (req, res) => {
    const input = changeRequestCreateSchema.parse(req.body);
    const employeeId = requireOwnEmployee(req);
    const employee = await findEmployeeOrThrow(employeeId);
    const currentValue = (employee as unknown as Record<string, unknown>)[input.field];

    const request = await prisma.employeeChangeRequest.create({
      data: {
        employeeId,
        requestedById: req.auth!.userId,
        field: input.field,
        currentValue: currentValue instanceof Date ? toDateOnly(currentValue) : (currentValue as string | null),
        requestedValue: input.requestedValue,
        reason: input.reason ?? null,
      },
    });

    await recordAudit({
      ...metadata(req),
      actorId: req.auth!.userId,
      action: 'employee.change_request_submitted',
      entityType: 'EmployeeChangeRequest',
      entityId: request.id,
      after: { employeeId, field: input.field },
    });
    await notifyPermissionHolders(prisma, {
      permission: 'employee.update',
      employeeId,
      employeeUnitIds: currentUnitIds(employee),
      excludeUserId: req.auth!.userId,
      eventType: 'change_request.submitted',
      title: 'Employee data correction requested',
      safeSummary: `A correction request was submitted for ${employee.staffNumber}.`,
      relatedEntityType: 'EmployeeChangeRequest',
      relatedEntityId: request.id,
    });
    res.status(201).json({ id: request.id, status: request.status });
  }),
);

router.get(
  '/me/change-requests',
  requireAuth,
  asyncRoute(async (req, res) => {
    const employeeId = requireOwnEmployee(req);
    const rows = await prisma.employeeChangeRequest.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(rows.map((row) => ({ id: row.id, field: row.field, status: row.status, createdAt: row.createdAt.toISOString() })));
  }),
);

router.get(
  '/export',
  requireAuth,
  requirePermission('employee.export'),
  asyncRoute(async (req, res) => {
    const query = employeeQuerySchema.parse(req.query);
    const where: Prisma.EmployeeWhereInput = {
      AND: [
        employeeWhere(req.auth!),
        ...(query.q
          ? [
              {
                OR: [
                  { staffNumber: { contains: query.q } },
                  { firstName: { contains: query.q } },
                  { lastName: { contains: query.q } },
                ],
              },
            ]
          : []),
      ],
    };
    const rows = await prisma.employee.findMany({
      where,
      include: employeeInclude,
      orderBy: { [query.sortBy]: query.sortOrder },
    });
    const items = rows.map(toEmployeeListItem);
    const header = ['Staff number', 'Name', 'Employment type', 'Status', 'Profile status', 'Hire date', 'Unit'];
    const lines = [
      header.map(csvCell).join(','),
      ...items.map((item) =>
        [
          item.staffNumber,
          item.fullName,
          item.employmentType,
          item.employmentStatus,
          item.profileStatus,
          item.hireDate,
          item.primaryUnit?.name,
        ]
          .map(csvCell)
          .join(','),
      ),
    ];
    await recordAudit({
      ...metadata(req),
      actorId: req.auth!.userId,
      action: 'employee.export',
      entityType: 'Employee',
      reason: `Directory export (${items.length} rows)`,
      after: { rowCount: items.length, filters: { q: query.q ?? null } },
    });
    res
      .status(200)
      .type('text/csv')
      .attachment(`employees-${toDateOnly(new Date())}.csv`)
      .send(lines.join('\r\n'));
  }),
);

router.get(
  '/',
  requireAuth,
  requirePermission('employee.view'),
  asyncRoute(async (req, res) => {
    const query = employeeQuerySchema.parse(req.query);
    const filters: Prisma.EmployeeWhereInput[] = [employeeWhere(req.auth!)];
    if (query.q) {
      filters.push({
        OR: [
          { staffNumber: { contains: query.q } },
          { firstName: { contains: query.q } },
          { lastName: { contains: query.q } },
          { contactEmail: { contains: query.q } },
        ],
      });
    }
    if (query.unitId) {
      filters.push({
        assignments: {
          some: {
            unitId: query.unitId,
            startDate: { lte: today() },
            OR: [{ endDate: null }, { endDate: { gte: today() } }],
          },
        },
      });
    }
    if (query.employmentStatus) filters.push({ employmentStatus: query.employmentStatus });
    if (query.employmentType) filters.push({ employmentType: query.employmentType });
    if (query.profileStatus) filters.push({ profileStatus: query.profileStatus });

    const where = { AND: filters };
    const [rows, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        include: employeeInclude,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.employee.count({ where }),
    ]);
    sendPaginated(
      res,
      rows.map(toEmployeeListItem),
      total,
      query.page,
      query.pageSize,
    );
  }),
);

router.post(
  '/',
  requireAuth,
  requirePermission('employee.create'),
  asyncRoute(async (req, res) => {
    const input = employeeCreateSchema.parse(req.body);
    const existing = await prisma.employee.findUnique({ where: { staffNumber: input.staffNumber } });
    if (existing) throw conflict('Staff number already exists');

    if (input.assignment) {
      const { unitId, positionId, supervisorEmployeeId } = input.assignment;
      if (!(await prisma.orgUnit.findUnique({ where: { id: unitId } }))) throw notFound('Unit not found');
      if (positionId && !(await prisma.position.findUnique({ where: { id: positionId } }))) {
        throw notFound('Position not found');
      }
      if (supervisorEmployeeId && !(await prisma.employee.findUnique({ where: { id: supervisorEmployeeId } }))) {
        throw notFound('Supervisor not found');
      }
    }

    const employee = await prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: {
          staffNumber: input.staffNumber,
          firstName: input.firstName,
          middleName: input.middleName ?? null,
          lastName: input.lastName,
          preferredName: input.preferredName ?? null,
          contactEmail: input.contactEmail ?? null,
          phone: input.phone ?? null,
          dateOfBirth: input.dateOfBirth ? parseDate(input.dateOfBirth) : null,
          nationalId: input.nationalId ?? null,
          gender: input.gender ?? null,
          employmentType: input.employmentType,
          hireDate: input.hireDate ? parseDate(input.hireDate) : null,
          endDate: input.endDate ? parseDate(input.endDate) : null,
          createdById: req.auth!.userId,
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: 'DRAFT',
              effectiveDate: today(),
              reason: 'Initial employee record created',
              changedById: req.auth!.userId,
            },
          },
        },
      });
      if (input.assignment) {
        await tx.employeeAssignment.create({
          data: {
            employeeId: created.id,
            unitId: input.assignment.unitId,
            positionId: input.assignment.positionId ?? null,
            supervisorEmployeeId: input.assignment.supervisorEmployeeId ?? null,
            startDate: parseDate(input.assignment.startDate),
            endDate: input.assignment.endDate ? parseDate(input.assignment.endDate) : null,
            assignmentType: input.assignment.assignmentType,
            isActing: input.assignment.isActing,
            notes: input.assignment.notes ?? null,
            createdById: req.auth!.userId,
          },
        });
      }
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'employee.created',
          entityType: 'Employee',
          entityId: created.id,
          after: auditFields(created, ['staffNumber', 'firstName', 'lastName', 'employmentType', 'hireDate']),
        },
        tx,
      );
      return created;
    });

    res.status(201).json(toEmployeeListItem(await findEmployeeOrThrow(employee.id)));
  }),
);

router.get(
  '/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const employee = await requireEmployeeInScope(req, (req.params.id as string));
    const own = employee.id === req.auth!.employeeId;
    const sensitiveVisible = own || hasPermission(req.auth!, 'employee.view_sensitive');
    if (sensitiveVisible && !own) {
      await recordAudit({
        ...metadata(req),
        actorId: req.auth!.userId,
        action: 'employee.sensitive_viewed',
        entityType: 'Employee',
        entityId: employee.id,
        reason: 'Sensitive employee fields viewed',
      });
    }
    res.json(toEmployeeDetail(employee, sensitiveVisible));
  }),
);

router.patch(
  '/:id',
  requireAuth,
  requirePermission('employee.update'),
  asyncRoute(async (req, res) => {
    const input = employeeUpdateSchema.parse(req.body);
    const employee = await requireEmployeeInScope(req, (req.params.id as string), 'employee.update');
    const sensitiveRequested = input.dateOfBirth !== undefined || input.nationalId !== undefined;
    if (sensitiveRequested && !hasPermission(req.auth!, 'employee.view_sensitive')) {
      throw forbidden('Sensitive fields require employee.view_sensitive permission');
    }

    const data: Prisma.EmployeeUpdateInput = {
      ...(input.firstName ? { firstName: input.firstName } : {}),
      ...(input.lastName ? { lastName: input.lastName } : {}),
      ...(input.middleName !== undefined ? { middleName: input.middleName } : {}),
      ...(input.preferredName !== undefined ? { preferredName: input.preferredName } : {}),
      ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.dateOfBirth !== undefined
        ? { dateOfBirth: input.dateOfBirth ? parseDate(input.dateOfBirth) : null }
        : {}),
      ...(input.nationalId !== undefined ? { nationalId: input.nationalId } : {}),
      ...(input.gender !== undefined ? { gender: input.gender } : {}),
      ...(input.employmentType ? { employmentType: input.employmentType } : {}),
      ...(input.hireDate !== undefined ? { hireDate: input.hireDate ? parseDate(input.hireDate) : null } : {}),
      ...(input.endDate !== undefined ? { endDate: input.endDate ? parseDate(input.endDate) : null } : {}),
    };

    await prisma.$transaction(async (tx) => {
      await tx.employee.update({ where: { id: employee.id }, data });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'employee.updated',
          entityType: 'Employee',
          entityId: employee.id,
          before: auditFields(employee, Object.keys(data)),
          after: {
            ...auditFields(data, Object.keys(data)),
            ...(sensitiveRequested ? { note: 'Sensitive field values redacted from audit' } : {}),
          },
        },
        tx,
      );
    });

    const refreshed = await findEmployeeOrThrow(employee.id);
    const completeness = profileCompleteness(refreshed);
    await prisma.employee.update({
      where: { id: employee.id },
      data: { profileStatus: suggestedProfileStatus(refreshed.profileStatus, completeness.percent) },
    });
    res.json(toEmployeeDetail(await findEmployeeOrThrow(employee.id), true));
  }),
);

router.post(
  '/:id/status',
  requireAuth,
  requirePermission('employee.update'),
  asyncRoute(async (req, res) => {
    const input = statusChangeSchema.parse(req.body);
    const employee = await requireEmployeeInScope(req, (req.params.id as string), 'employee.update');
    if (!isTransitionAllowed(employee.employmentStatus, input.toStatus)) {
      throw invalidTransition(`Transition from ${employee.employmentStatus} to ${input.toStatus} is not allowed`);
    }

    const deactivateAccount = ['RESIGNED', 'RETIRED', 'TERMINATED', 'ARCHIVED'].includes(input.toStatus);
    await prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: employee.id },
        data: { employmentStatus: input.toStatus, ...(deactivateAccount ? { endDate: parseDate(input.effectiveDate) } : {}) },
      });
      await tx.employeeStatusHistory.create({
        data: {
          employeeId: employee.id,
          fromStatus: employee.employmentStatus,
          toStatus: input.toStatus,
          effectiveDate: parseDate(input.effectiveDate),
          reason: input.reason,
          changedById: req.auth!.userId,
        },
      });
      if (deactivateAccount) {
        await tx.user.updateMany({
          where: { employeeId: employee.id },
          data: { status: 'DEACTIVATED' },
        });
        await tx.session.updateMany({
          where: { userId: { in: (await tx.user.findMany({ where: { employeeId: employee.id }, select: { id: true } })).map((u) => u.id) } },
          data: { revokedAt: new Date() },
        });
      }
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'employee.status_changed',
          entityType: 'Employee',
          entityId: employee.id,
          reason: input.reason,
          before: { status: employee.employmentStatus },
          after: { status: input.toStatus, effectiveDate: input.effectiveDate },
        },
        tx,
      );
    });

    const user = await prisma.user.findFirst({ where: { employeeId: employee.id }, select: { id: true } });
    if (user) {
      await notifyUsers(prisma, [user.id], {
        eventType: 'employment.status_changed',
        title: 'Employment status updated',
        safeSummary: 'Your employment record status has been updated. Contact HR for details.',
        relatedEntityType: 'Employee',
        relatedEntityId: employee.id,
        priority: 'HIGH',
      });
    }
    res.json({ ok: true });
  }),
);

router.post(
  '/:id/verify',
  requireAuth,
  requirePermission('employee.verify'),
  asyncRoute(async (req, res) => {
    const input = verifyEmployeeSchema.parse(req.body);
    const employee = await requireEmployeeInScope(req, (req.params.id as string), 'employee.verify');
    const completeness = profileCompleteness(employee);
    if (completeness.percent < 80) {
      throw badRequest(`Profile is only ${completeness.percent}% complete; at least 80% is required for verification`);
    }
    await prisma.$transaction(async (tx) => {
      await tx.employee.update({ where: { id: employee.id }, data: { profileStatus: 'VERIFIED' } });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'employee.verified',
          entityType: 'Employee',
          entityId: employee.id,
          reason: input.note ?? 'Record verified',
          before: { profileStatus: employee.profileStatus },
          after: { profileStatus: 'VERIFIED' },
        },
        tx,
      );
    });
    const user = await prisma.user.findFirst({ where: { employeeId: employee.id }, select: { id: true } });
    if (user) {
      await notifyUsers(prisma, [user.id], {
        eventType: 'employee.verified',
        title: 'Profile verified',
        safeSummary: 'Your employee profile has been verified by HR.',
        relatedEntityType: 'Employee',
        relatedEntityId: employee.id,
      });
    }
    res.json({ ok: true });
  }),
);

router.post(
  '/:id/archive',
  requireAuth,
  requirePermission('employee.archive'),
  asyncRoute(async (req, res) => {
    const input = verifyEmployeeSchema.parse(req.body);
    const employee = await requireEmployeeInScope(req, (req.params.id as string), 'employee.archive');
    if (!isTransitionAllowed(employee.employmentStatus, 'ARCHIVED')) {
      throw invalidTransition(`Cannot archive an employee with status ${employee.employmentStatus}`);
    }
    await prisma.$transaction(async (tx) => {
      await tx.employee.update({ where: { id: employee.id }, data: { employmentStatus: 'ARCHIVED' } });
      await tx.employeeStatusHistory.create({
        data: {
          employeeId: employee.id,
          fromStatus: employee.employmentStatus,
          toStatus: 'ARCHIVED',
          effectiveDate: today(),
          reason: input.note ?? 'Record archived',
          changedById: req.auth!.userId,
        },
      });
      await tx.user.updateMany({ where: { employeeId: employee.id }, data: { status: 'DEACTIVATED' } });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'employee.archived',
          entityType: 'Employee',
          entityId: employee.id,
          reason: input.note ?? 'Record archived',
        },
        tx,
      );
    });
    res.json({ ok: true });
  }),
);

router.get(
  '/:id/assignments',
  requireAuth,
  asyncRoute(async (req, res) => {
    const employee = await requireEmployeeInScope(req, (req.params.id as string));
    res.json(toEmployeeDetail(employee, false).assignments);
  }),
);

router.post(
  '/:id/assignments',
  requireAuth,
  requirePermission('employee.assign_unit', 'employee.assign_supervisor'),
  asyncRoute(async (req, res) => {
    const input = assignmentCreateSchema.parse(req.body);
    const employee = await requireEmployeeInScope(req, (req.params.id as string), 'employee.update');
    const needsUnit = input.unitId !== employee.assignments.find((a) => a.assignmentType === 'PRIMARY')?.unitId;
    if (needsUnit && !hasPermission(req.auth!, 'employee.assign_unit')) {
      throw forbidden('Assigning a unit requires employee.assign_unit');
    }
    if (input.supervisorEmployeeId && !hasPermission(req.auth!, 'employee.assign_supervisor')) {
      throw forbidden('Assigning a supervisor requires employee.assign_supervisor');
    }
    if (input.supervisorEmployeeId === employee.id) throw badRequest('An employee cannot supervise themselves');

    const unit = await prisma.orgUnit.findUnique({ where: { id: input.unitId } });
    if (!unit) throw notFound('Unit not found');
    if (input.positionId) {
      const position = await prisma.position.findUnique({ where: { id: input.positionId } });
      if (!position) throw notFound('Position not found');
    }
    if (input.supervisorEmployeeId) {
      const supervisor = await prisma.employee.findUnique({ where: { id: input.supervisorEmployeeId } });
      if (!supervisor) throw notFound('Supervisor not found');

      const allAssignments = await prisma.employeeAssignment.findMany({
        where: {
          OR: [{ endDate: null }, { endDate: { gte: today() } }],
          startDate: { lte: today() },
        },
        select: { employeeId: true, supervisorEmployeeId: true },
      });
      const supervisorByEmployee = new Map(
        allAssignments.map((assignment) => [assignment.employeeId, assignment.supervisorEmployeeId]),
      );
      let cursor: string | null = input.supervisorEmployeeId;
      const seen = new Set<string>();
      while (cursor) {
        if (cursor === employee.id || seen.has(cursor)) throw badRequest('Reporting loop is not allowed');
        seen.add(cursor);
        cursor = supervisorByEmployee.get(cursor) ?? null;
      }
    }

    const startDate = parseDate(input.startDate);
    if (input.assignmentType === 'PRIMARY') {
      const currentPrimary = employee.assignments.find((a) => a.assignmentType === 'PRIMARY' && !a.endDate);
      if (currentPrimary && currentPrimary.startDate >= startDate) {
        throw conflict('New primary assignment must start after the current primary assignment');
      }
    }

    const assignment = await prisma.$transaction(async (tx) => {
      if (input.assignmentType === 'PRIMARY') {
        await tx.employeeAssignment.updateMany({
          where: {
            employeeId: employee.id,
            assignmentType: 'PRIMARY',
            endDate: null,
            startDate: { lt: startDate },
          },
          data: { endDate: addDays(startDate, -1) },
        });
      }
      const created = await tx.employeeAssignment.create({
        data: {
          employeeId: employee.id,
          unitId: input.unitId,
          positionId: input.positionId ?? null,
          supervisorEmployeeId: input.supervisorEmployeeId ?? null,
          startDate,
          endDate: input.endDate ? parseDate(input.endDate) : null,
          assignmentType: input.assignmentType,
          isActing: input.isActing,
          notes: input.notes ?? null,
          createdById: req.auth!.userId,
        },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'employee.assignment_created',
          entityType: 'EmployeeAssignment',
          entityId: created.id,
          reason: input.notes ?? 'New effective-dated assignment',
          after: auditFields(created, [
            'employeeId',
            'unitId',
            'positionId',
            'supervisorEmployeeId',
            'startDate',
            'endDate',
            'assignmentType',
          ]),
        },
        tx,
      );
      return created;
    });

    const user = await prisma.user.findFirst({ where: { employeeId: employee.id }, select: { id: true } });
    if (user) {
      await notifyUsers(prisma, [user.id], {
        eventType: 'employee.assignment_changed',
        title: 'Assignment updated',
        safeSummary: `Your assignment in ${unit.name} has been recorded.`,
        relatedEntityType: 'EmployeeAssignment',
        relatedEntityId: assignment.id,
      });
    }
    res.status(201).json(toEmployeeDetail(await findEmployeeOrThrow(employee.id), false).assignments[0]);
  }),
);

router.get(
  '/:id/history',
  requireAuth,
  asyncRoute(async (req, res) => {
    const employee = await requireEmployeeInScope(req, (req.params.id as string));
    res.json(toEmployeeDetail(employee, false).statusHistory);
  }),
);

changeRequestRouter.get(
  '/',
  requireAuth,
  requirePermission('employee.update'),
  asyncRoute(async (req, res) => {
    const query = changeRequestQuerySchema.parse(req.query);
    const where: Prisma.EmployeeChangeRequestWhereInput = {
      AND: [
        { employee: employeeWhere(req.auth!, 'employee.update') },
        ...(query.status ? [{ status: query.status }] : []),
        ...(query.employeeId ? [{ employeeId: query.employeeId }] : []),
      ],
    };
    const [rows, total] = await Promise.all([
      prisma.employeeChangeRequest.findMany({
        where,
        include: {
          employee: { select: { firstName: true, lastName: true } },
          requestedBy: { select: { email: true } },
          reviewedBy: { select: { email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.employeeChangeRequest.count({ where }),
    ]);
    const items: ChangeRequestDto[] = rows.map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      employeeName: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
      field: row.field,
      currentValue: row.currentValue,
      requestedValue: row.requestedValue,
      reason: row.reason,
      status: row.status,
      requestedByName: row.requestedBy.email,
      reviewedByName: row.reviewedBy?.email ?? null,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      reviewComment: row.reviewComment,
      createdAt: row.createdAt.toISOString(),
    }));
    sendPaginated(res, items, total, query.page, query.pageSize);
  }),
);

changeRequestRouter.post(
  '/:id/decision',
  requireAuth,
  requirePermission('employee.update'),
  asyncRoute(async (req, res) => {
    const input = changeRequestDecisionSchema.parse(req.body);
    const changeRequest = await prisma.employeeChangeRequest.findUnique({
      where: { id: (req.params.id as string) },
      include: { employee: true },
    });
    if (!changeRequest) throw notFound('Change request not found');
    await requireEmployeeInScope(req, changeRequest.employeeId, 'employee.update');
    if (changeRequest.requestedById === req.auth!.userId) {
      throw forbidden('You cannot review your own change request');
    }
    if (changeRequest.status !== 'PENDING') throw conflict('Change request was already reviewed');

    await prisma.$transaction(async (tx) => {
      await tx.employeeChangeRequest.update({
        where: { id: changeRequest.id },
        data: {
          status: input.decision,
          reviewedById: req.auth!.userId,
          reviewedAt: new Date(),
          reviewComment: input.comment ?? null,
        },
      });
      if (input.decision === 'APPROVED') {
        const field = changeRequest.field as keyof Prisma.EmployeeUpdateInput;
        const value: unknown =
          field === 'dateOfBirth' ? parseDate(changeRequest.requestedValue) : changeRequest.requestedValue;
        await tx.employee.update({
          where: { id: changeRequest.employeeId },
          data: { [field]: value } as Prisma.EmployeeUpdateInput,
        });
      }
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: `employee.change_request.${input.decision.toLowerCase()}`,
          entityType: 'EmployeeChangeRequest',
          entityId: changeRequest.id,
          reason: input.comment ?? undefined,
          after: { decision: input.decision, field: changeRequest.field },
        },
        tx,
      );
    });

    const requester = await prisma.user.findUnique({
      where: { id: changeRequest.requestedById },
      select: { id: true },
    });
    if (requester) {
      await notifyUsers(prisma, [requester.id], {
        eventType: 'change_request.decided',
        title: `Correction request ${input.decision.toLowerCase()}`,
        safeSummary: 'Your employee data correction request has been reviewed.',
        relatedEntityType: 'EmployeeChangeRequest',
        relatedEntityId: changeRequest.id,
      });
    }
    res.json({ ok: true });
  }),
);

export default router;
