import { randomBytes } from 'node:crypto';
import { Router, type Request } from 'express';
import type { Prisma } from '@prisma/client';
import {
  assignRoleSchema,
  createUserSchema,
  resetPasswordSchema,
  userQuerySchema,
  updateUserStatusSchema,
  type RoleAssignmentDto,
  type RoleDto,
  type UserDto,
} from '@umu-hr/shared';
import { prisma } from '../db.js';
import { toDateOnly } from '../dates.js';
import { asyncRoute, badRequest, conflict, forbidden, notFound } from '../errors.js';
import { sendPaginated } from '../http.js';
import { recordAudit } from '../audit/service.js';
import { notifyUsers } from '../notifications/service.js';
import { requireAuth, requirePermission } from '../access/middleware.js';
import { hasPermission } from '../access/policy.js';
import { hashPassword } from '../auth/password.js';

const router = Router();

type AssignmentRow = Prisma.RoleAssignmentGetPayload<{
  include: {
    role: { include: { permissions: true } };
    scopeUnit: { select: { name: true } };
    assignedBy: { select: { email: true } };
  };
}>;

function toAssignmentDto(row: AssignmentRow): RoleAssignmentDto {
  const now = new Date();
  return {
    id: row.id,
    roleId: row.roleId,
    roleKey: row.role.key,
    roleName: row.role.name,
    scopeType: row.scopeType,
    scopeUnitId: row.scopeUnitId,
    scopeUnitName: row.scopeUnit?.name ?? null,
    startDate: toDateOnly(row.startDate),
    endDate: row.endDate ? toDateOnly(row.endDate) : null,
    assignedByName: row.assignedBy?.email ?? null,
    reason: row.reason,
    effective:
      row.revokedAt === null && row.startDate <= now && (row.endDate === null || row.endDate >= now),
  };
}

const assignmentInclude = {
  role: { include: { permissions: true } },
  scopeUnit: { select: { name: true } },
  assignedBy: { select: { email: true } },
} satisfies Prisma.RoleAssignmentInclude;

function metadata(req: Request) {
  return {
    ipAddress: req.ip ?? null,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
  };
}

router.get(
  '/users',
  requireAuth,
  requirePermission('user.manage'),
  asyncRoute(async (req, res) => {
    const query = userQuerySchema.parse(req.query);
    const where: Prisma.UserWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q } },
              { employee: { staffNumber: { contains: query.q } } },
              { employee: { firstName: { contains: query.q } } },
              { employee: { lastName: { contains: query.q } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          employee: { select: { firstName: true, lastName: true } },
          roleAssignments: { where: { revokedAt: null }, include: assignmentInclude },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    const items: UserDto[] = rows.map((row) => ({
      id: row.id,
      email: row.email,
      status: row.status,
      mustChangePassword: row.mustChangePassword,
      employeeId: row.employeeId,
      employeeName: row.employee
        ? `${row.employee.firstName} ${row.employee.lastName}`.trim()
        : null,
      lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      roles: row.roleAssignments.map(toAssignmentDto),
    }));
    sendPaginated(res, items, total, query.page, query.pageSize);
  }),
);

router.post(
  '/users',
  requireAuth,
  requirePermission('user.manage'),
  asyncRoute(async (req, res) => {
    const input = createUserSchema.parse(req.body);
    const email = input.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw conflict('An account with this email already exists');

    if (input.employeeId) {
      const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
      if (!employee) throw notFound('Employee not found');
      const linked = await prisma.user.findUnique({ where: { employeeId: input.employeeId } });
      if (linked) throw conflict('This employee already has an account');
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(input.password),
        employeeId: input.employeeId ?? null,
        createdById: req.auth!.userId,
      },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });

    await recordAudit(
      {
        ...metadata(req),
        actorId: req.auth!.userId,
        action: 'user.created',
        entityType: 'User',
        entityId: user.id,
        reason: 'Account created',
        after: { email: user.email, employeeId: user.employeeId },
      },
      prisma,
    );
    await notifyUsers(prisma, [user.id], {
      eventType: 'account.created',
      title: 'Your account was created',
      safeSummary: 'An HR account has been created for you. Contact HR if you did not expect this.',
      relatedEntityType: 'User',
      relatedEntityId: user.id,
    });

    const dto: UserDto = {
      id: user.id,
      email: user.email,
      status: user.status,
      mustChangePassword: user.mustChangePassword,
      employeeId: user.employeeId,
      employeeName: user.employee
        ? `${user.employee.firstName} ${user.employee.lastName}`.trim()
        : null,
      lastLoginAt: null,
      createdAt: user.createdAt.toISOString(),
      roles: [],
    };
    res.status(201).json(dto);
  }),
);

router.patch(
  '/users/:id/status',
  requireAuth,
  requirePermission('user.manage'),
  asyncRoute(async (req, res) => {
    const input = updateUserStatusSchema.parse(req.body);
    if ((req.params.id as string) === req.auth!.userId) throw forbidden('You cannot change your own account status');

    const user = await prisma.user.findUnique({ where: { id: (req.params.id as string) } });
    if (!user) throw notFound('User not found');

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { status: input.status } });
      if (input.status !== 'ACTIVE') {
        await tx.session.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'user.status_changed',
          entityType: 'User',
          entityId: user.id,
          reason: input.reason,
          before: { status: user.status },
          after: { status: input.status },
        },
        tx,
      );
      await notifyUsers(tx, [user.id], {
        eventType: 'account.status_changed',
        title: `Account ${input.status.toLowerCase()}`,
        safeSummary: 'Your account status has changed. Contact security administration for details.',
        relatedEntityType: 'User',
        relatedEntityId: user.id,
        priority: 'HIGH',
      });
    });

    res.json({ ok: true });
  }),
);

router.post(
  '/users/:id/reset-password',
  requireAuth,
  requirePermission('user.manage'),
  asyncRoute(async (req, res) => {
    resetPasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: (req.params.id as string) } });
    if (!user) throw notFound('User not found');

    const temporaryPassword = `${randomBytes(9).toString('base64')}A1!`;
    const password = req.body.newPassword ?? temporaryPassword;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(password), mustChangePassword: true },
      });
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await recordAudit(
        {
          ...metadata(req),
          actorId: req.auth!.userId,
          action: 'user.password_reset',
          entityType: 'User',
          entityId: user.id,
          reason: 'Administrative password reset',
        },
        tx,
      );
      await notifyUsers(tx, [user.id], {
        eventType: 'account.password_reset',
        title: 'Password reset',
        safeSummary: 'Your password was reset by an administrator. Change it at next sign-in.',
        relatedEntityType: 'User',
        relatedEntityId: user.id,
        priority: 'HIGH',
      });
    });

    res.json({ ok: true, temporaryPassword: req.body.newPassword ? undefined : temporaryPassword });
  }),
);

router.get(
  '/users/:id/roles',
  requireAuth,
  requirePermission('user.manage', 'role.manage'),
  asyncRoute(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: (req.params.id as string) } });
    if (!user) throw notFound('User not found');
    const rows = await prisma.roleAssignment.findMany({
      where: { userId: user.id },
      include: assignmentInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json(rows.map(toAssignmentDto));
  }),
);

router.post(
  '/users/:id/roles',
  requireAuth,
  requirePermission('role.manage'),
  asyncRoute(async (req, res) => {
    const input = assignRoleSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: (req.params.id as string) } });
    if (!user) throw notFound('User not found');

    const role = await prisma.role.findUnique({
      where: { id: input.roleId },
      include: { permissions: true },
    });
    if (!role) throw notFound('Role not found');

    if (input.scopeUnitId) {
      const unit = await prisma.orgUnit.findUnique({ where: { id: input.scopeUnitId } });
      if (!unit) throw notFound('Scope unit not found');
    }

    const rolePermissions = new Set(role.permissions.map((permission) => permission.permissionKey));
    const isSuperAdmin = req.auth!.grants.some(
      (grant) => grant.effective && grant.roleKey === 'SUPER_ADMIN',
    );
    if (!isSuperAdmin) {
      const missing = [...rolePermissions].filter((permission) => !hasPermission(req.auth!, permission));
      if (missing.length > 0) throw forbidden('You cannot grant permissions you do not hold');
      if (input.scopeType === 'INSTITUTION') {
        const canGrantInstitution = req.auth!.grants.some(
          (grant) =>
            grant.effective &&
            grant.all &&
            [...rolePermissions].every((permission) => grant.permissions.has(permission)),
        );
        if (!canGrantInstitution) throw forbidden('Institution-wide scope exceeds your own authority');
      }
      if (input.scopeUnitId) {
        const canGrantUnit = req.auth!.grants.some(
          (grant) =>
            grant.effective &&
            (grant.all || grant.scopeUnitIds.includes(input.scopeUnitId!)) &&
            [...rolePermissions].every((permission) => grant.permissions.has(permission)),
        );
        if (!canGrantUnit) throw forbidden('You cannot grant access outside your scope');
      }
    }

    const startDate = input.startDate ? new Date(`${input.startDate}T00:00:00Z`) : new Date();
    const endDate = input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : null;
    const assignment = await prisma.roleAssignment.create({
      data: {
        userId: user.id,
        roleId: role.id,
        scopeType: input.scopeType,
        scopeUnitId: input.scopeUnitId ?? null,
        startDate,
        endDate,
        assignedById: req.auth!.userId,
        reason: input.reason,
      },
      include: assignmentInclude,
    });

    await recordAudit({
      ...metadata(req),
      actorId: req.auth!.userId,
      action: 'role.assigned',
      entityType: 'User',
      entityId: user.id,
      reason: input.reason,
      after: {
        assignmentId: assignment.id,
        roleKey: role.key,
        scopeType: input.scopeType,
        scopeUnitId: input.scopeUnitId,
        startDate: toDateOnly(startDate),
        endDate: endDate ? toDateOnly(endDate) : null,
      },
    });
    await notifyUsers(prisma, [user.id], {
      eventType: 'access.granted',
      title: 'Access role assigned',
      safeSummary: `Role ${role.name} was assigned. Check your access summary for details.`,
      relatedEntityType: 'RoleAssignment',
      relatedEntityId: assignment.id,
      priority: 'HIGH',
    });

    res.status(201).json(toAssignmentDto(assignment));
  }),
);

router.post(
  '/roles/:assignmentId/revoke',
  requireAuth,
  requirePermission('role.manage'),
  asyncRoute(async (req, res) => {
    const input = req.body as { reason?: string };
    if (!input.reason || input.reason.trim().length < 3) {
      throw badRequest('A reason of at least 3 characters is required');
    }
    const assignment = await prisma.roleAssignment.findUnique({
      where: { id: req.params.assignmentId as string },
      include: { role: true },
    });
    if (!assignment) throw notFound('Role assignment not found');
    if (assignment.revokedAt) throw conflict('Role assignment is already revoked');

    await prisma.roleAssignment.update({
      where: { id: assignment.id },
      data: { revokedAt: new Date(), revokedById: req.auth!.userId },
    });
    await recordAudit({
      ...metadata(req),
      actorId: req.auth!.userId,
      action: 'role.revoked',
      entityType: 'User',
      entityId: assignment.userId,
      reason: input.reason,
      before: { assignmentId: assignment.id, roleKey: assignment.role.key },
    });
    await notifyUsers(prisma, [assignment.userId], {
      eventType: 'access.revoked',
      title: 'Access role revoked',
      safeSummary: `Role ${assignment.role.name} was revoked. Contact security administration if this is unexpected.`,
      relatedEntityType: 'RoleAssignment',
      relatedEntityId: assignment.id,
      priority: 'HIGH',
    });

    res.json({ ok: true });
  }),
);

router.get(
  '/roles',
  requireAuth,
  requirePermission('role.manage', 'user.manage'),
  asyncRoute(async (_req, res) => {
    const roles = await prisma.role.findMany({
      include: { permissions: { select: { permissionKey: true } } },
      orderBy: { name: 'asc' },
    });
    const items: RoleDto[] = roles.map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      permissions: role.permissions.map((permission) => permission.permissionKey).sort(),
    }));
    res.json(items);
  }),
);

router.get(
  '/permissions',
  requireAuth,
  requirePermission('role.manage', 'permission.manage'),
  asyncRoute(async (_req, res) => {
    const permissions = await prisma.permission.findMany({ orderBy: { key: 'asc' } });
    res.json(permissions);
  }),
);

export default router;
