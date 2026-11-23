import { Router } from 'express';
import type { DashboardPayload } from '@umu-hr/shared';
import { prisma } from '../db.js';
import { addDays, today } from '../dates.js';
import { asyncRoute } from '../errors.js';
import { requireAuth } from '../access/middleware.js';
import { employeeWhere, hasPermission, scopeLabel } from '../access/policy.js';
import { employeeInclude, profileCompleteness } from '../employees/service.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncRoute(async (req, res) => {
    const ctx = req.auth!;
    const [unreadNotifications, employeeScope] = await Promise.all([
      prisma.notification.count({ where: { recipientUserId: ctx.userId, readAt: null } }),
      Promise.resolve(employeeWhere(ctx)),
    ]);

    let headcount: DashboardPayload['headcount'] = null;
    let pendingChangeRequests: number | null = null;
    let pendingDocuments: number | null = null;
    let recentHires: DashboardPayload['recentHires'] = [];
    let expiringContracts: DashboardPayload['expiringContracts'] = [];

    if (hasPermission(ctx, 'employee.view') || hasPermission(ctx, 'report.view')) {
      const [byStatusRows, byTypeRows, hires] = await Promise.all([
        prisma.employee.groupBy({
          by: ['employmentStatus'],
          where: employeeScope,
          _count: { _all: true },
        }),
        prisma.employee.groupBy({
          by: ['employmentType'],
          where: employeeScope,
          _count: { _all: true },
        }),
        prisma.employee.findMany({
          where: {
            AND: [employeeScope, { hireDate: { gte: addDays(today(), -30), lte: today() } }],
          },
          include: {
            assignments: {
              where: {
                startDate: { lte: today() },
                OR: [{ endDate: null }, { endDate: { gte: today() } }],
              },
              take: 1,
              include: { unit: { select: { name: true } } },
            },
          },
          orderBy: { hireDate: 'desc' },
          take: 5,
        }),
      ]);
      const total = await prisma.employee.count({ where: employeeScope });
      headcount = {
        total,
        byStatus: Object.fromEntries(byStatusRows.map((row) => [row.employmentStatus, row._count._all])),
        byType: Object.fromEntries(byTypeRows.map((row) => [row.employmentType, row._count._all])),
      };
      recentHires = hires.map((employee) => ({
        id: employee.id,
        fullName: `${employee.firstName} ${employee.lastName}`.trim(),
        staffNumber: employee.staffNumber,
        hireDate: employee.hireDate!.toISOString().slice(0, 10),
        unitName: employee.assignments[0]?.unit.name ?? null,
      }));
    }

    if (hasPermission(ctx, 'employee.update')) {
      pendingChangeRequests = await prisma.employeeChangeRequest.count({
        where: { status: 'PENDING', employee: employeeWhere(ctx, 'employee.update') },
      });
    }

    if (hasPermission(ctx, 'document.verify')) {
      pendingDocuments = await prisma.document.count({
        where: { status: 'PENDING', employee: employeeWhere(ctx, 'document.verify') },
      });
    }

    if (hasPermission(ctx, 'document.view')) {
      const contracts = await prisma.document.findMany({
        where: {
          category: 'CONTRACT',
          retentionStatus: 'ACTIVE',
          expiryDate: { gte: today(), lte: addDays(today(), 90) },
          employee: employeeWhere(ctx, 'document.view'),
        },
        include: { employee: { select: { firstName: true, lastName: true } } },
        orderBy: { expiryDate: 'asc' },
        take: 5,
      });
      expiringContracts = contracts.map((document) => ({
        documentId: document.id,
        title: document.title,
        employeeName: `${document.employee.firstName} ${document.employee.lastName}`.trim(),
        expiryDate: document.expiryDate!.toISOString().slice(0, 10),
      }));
    }

    let profile: DashboardPayload['profile'] = null;
    if (ctx.employeeId) {
      const [employee, pendingRequests, documentCount] = await Promise.all([
        prisma.employee.findUniqueOrThrow({
          where: { id: ctx.employeeId },
          include: employeeInclude,
        }),
        prisma.employeeChangeRequest.count({ where: { employeeId: ctx.employeeId, status: 'PENDING' } }),
        prisma.document.count({ where: { employeeId: ctx.employeeId, retentionStatus: 'ACTIVE' } }),
      ]);
      profile = {
        staffNumber: employee.staffNumber,
        profileStatus: employee.profileStatus,
        completenessPercent: profileCompleteness(employee).percent,
        pendingChangeRequests: pendingRequests,
        documentCount,
      };
    }

    let admin: DashboardPayload['admin'] = null;
    if (hasPermission(ctx, 'user.manage') || hasPermission(ctx, 'audit.view')) {
      const sevenDays = addDays(today(), 7);
      const [usersByStatus, activeRoleAssignments, expiringAssignments, recentAudit] = await Promise.all([
        prisma.user.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.roleAssignment.count({ where: { revokedAt: null } }),
        prisma.roleAssignment.count({
          where: { revokedAt: null, endDate: { not: null, lte: sevenDays } },
        }),
        hasPermission(ctx, 'audit.view')
          ? prisma.auditEvent.findMany({
              include: { actor: { select: { email: true } } },
              orderBy: { createdAt: 'desc' },
              take: 5,
            })
          : Promise.resolve([]),
      ]);
      admin = {
        usersByStatus: Object.fromEntries(usersByStatus.map((row) => [row.status, row._count._all])),
        activeRoleAssignments,
        expiringAssignments7d: expiringAssignments,
        recentAudit: recentAudit.map((row) => ({
          id: row.id,
          actorUserId: row.actorUserId,
          actorEmail: row.actor?.email ?? row.actorLabel ?? null,
          action: row.action,
          entityType: row.entityType,
          entityId: row.entityId,
          reason: row.reason,
          before: (row.before as Record<string, unknown> | null) ?? null,
          after: (row.after as Record<string, unknown> | null) ?? null,
          ipAddress: row.ipAddress,
          createdAt: row.createdAt.toISOString(),
        })),
      };
    }

    const payload: DashboardPayload = {
      scopeLabel: scopeLabel(ctx),
      unreadNotifications,
      headcount,
      pendingChangeRequests,
      pendingDocuments,
      expiringContracts,
      recentHires,
      profile,
      admin,
    };
    res.json(payload);
  }),
);

export default router;
