import type { Prisma } from '@prisma/client';
import type { ScopeType } from '@umu-hr/shared';
import type { Db } from '../db.js';
import { today } from '../dates.js';
import type { AuthContext, AuthUserSafe, EffectiveGrant } from '../auth/context.js';

const currentAssignmentFilter = {
  startDate: { lte: today() },
  OR: [{ endDate: null }, { endDate: { gte: today() } }],
} satisfies Prisma.EmployeeAssignmentWhereInput;

export async function buildAccessContext(
  db: Db,
  user: AuthUserSafe,
  sessionId: string,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<AuthContext> {
  const [assignmentRows, allUnits] = await Promise.all([
    db.roleAssignment.findMany({
      where: { userId: user.id, revokedAt: null },
      include: {
        role: { include: { permissions: true } },
        scopeUnit: { select: { id: true, name: true } },
        assignedBy: { select: { email: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    db.orgUnit.findMany({ select: { id: true, parentId: true } }),
  ]);

  const childrenByParent = new Map<string, string[]>();
  for (const unit of allUnits) {
    if (!unit.parentId) continue;
    const children = childrenByParent.get(unit.parentId) ?? [];
    children.push(unit.id);
    childrenByParent.set(unit.parentId, children);
  }

  function withDescendants(rootId: string): string[] {
    const result = new Set<string>([rootId]);
    const queue = [rootId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      for (const child of childrenByParent.get(current) ?? []) {
        if (!result.has(child)) {
          result.add(child);
          queue.push(child);
        }
      }
    }
    return [...result];
  }

  const employeeId = user.employeeId;
  const [reportRows, headedUnits] = employeeId
    ? await Promise.all([
        db.employeeAssignment.findMany({
          where: { supervisorEmployeeId: employeeId, ...currentAssignmentFilter },
          select: { employeeId: true },
        }),
        db.orgUnit.findMany({
          where: { headEmployeeId: employeeId, status: 'ACTIVE' },
          select: { id: true },
        }),
      ])
    : [[], []];

  const directReports = [...new Set(reportRows.map((row) => row.employeeId))];
  const headedUnitIds = [...new Set(headedUnits.flatMap((unit) => withDescendants(unit.id)))];
  const headedEmployeeIds = headedUnitIds.length
    ? (
        await db.employeeAssignment.findMany({
          where: { unitId: { in: headedUnitIds }, ...currentAssignmentFilter },
          select: { employeeId: true },
        })
      ).map((row) => row.employeeId)
    : [];

  const now = today();
  const grants: EffectiveGrant[] = assignmentRows.map((row) => {
    const scopeType: ScopeType = row.scopeType;
    const scopeUnitIds =
      scopeType === 'DEPARTMENT' && row.scopeUnitId
        ? withDescendants(row.scopeUnitId)
        : scopeType === 'FACULTY' && row.scopeUnitId
          ? withDescendants(row.scopeUnitId)
          : [];
    const scopeEmployeeIds =
      scopeType === 'OWN' && employeeId
        ? [employeeId]
        : scopeType === 'TEAM'
          ? directReports
          : scopeType === 'ASSIGNED'
            ? [...new Set([...directReports, ...headedEmployeeIds])]
            : [];

    return {
      assignmentId: row.id,
      roleKey: row.role.key,
      roleName: row.role.name,
      scopeType,
      scopeUnitId: row.scopeUnitId,
      scopeUnitName: row.scopeUnit?.name ?? null,
      startDate: row.startDate,
      endDate: row.endDate,
      assignedByName: row.assignedBy?.email ?? null,
      reason: row.reason,
      permissions: new Set(row.role.permissions.map((permission) => permission.permissionKey)),
      scopeUnitIds,
      scopeEmployeeIds,
      all: scopeType === 'INSTITUTION',
      effective: row.startDate <= now && (row.endDate === null || row.endDate >= now),
    };
  });

  const permissions = new Set<string>();
  for (const grant of grants) {
    if (!grant.effective) continue;
    for (const permission of grant.permissions) permissions.add(permission);
  }

  return {
    userId: user.id,
    sessionId,
    user,
    employeeId,
    permissions,
    grants,
    ipAddress,
    userAgent,
  };
}

export function hasPermission(ctx: AuthContext, permission: string): boolean {
  return ctx.permissions.has(permission);
}

export function effectiveGrantsFor(ctx: AuthContext, permission: string): EffectiveGrant[] {
  return ctx.grants.filter((grant) => grant.effective && grant.permissions.has(permission));
}

export function canAccessEmployee(
  ctx: AuthContext,
  target: { id: string; currentUnitIds: string[] },
  permission = 'employee.view',
): boolean {
  if (target.id && target.id === ctx.employeeId) return true;
  if (!hasPermission(ctx, permission)) return false;

  return effectiveGrantsFor(ctx, permission).some(
    (grant) =>
      grant.all ||
      grant.scopeEmployeeIds.includes(target.id) ||
      target.currentUnitIds.some((unitId) => grant.scopeUnitIds.includes(unitId)),
  );
}

export function employeeWhere(ctx: AuthContext, permission = 'employee.view'): Prisma.EmployeeWhereInput {
  const grants = effectiveGrantsFor(ctx, permission);
  if (grants.some((grant) => grant.all)) return {};

  const unitIds = [...new Set(grants.flatMap((grant) => grant.scopeUnitIds))];
  const employeeIds = [...new Set(grants.flatMap((grant) => grant.scopeEmployeeIds))];

  const conditions: Prisma.EmployeeWhereInput[] = [];
  if (unitIds.length > 0) {
    conditions.push({
      assignments: { some: { unitId: { in: unitIds }, ...currentAssignmentFilter } },
    });
  }
  if (employeeIds.length > 0) conditions.push({ id: { in: employeeIds } });

  if (conditions.length === 0) return { id: '__no_scope__' };
  return { OR: conditions };
}

export function canManageOrganization(ctx: AuthContext): boolean {
  return hasPermission(ctx, 'org.manage') && effectiveGrantsFor(ctx, 'org.manage').some((g) => g.all);
}

export function scopeLabel(ctx: AuthContext): string {
  const active = ctx.grants.filter((grant) => grant.effective);
  if (active.some((grant) => grant.all)) return 'Institution';
  const unitGrant = active.find((grant) => grant.scopeUnitName);
  if (unitGrant?.scopeUnitName) return `${unitGrant.scopeType}: ${unitGrant.scopeUnitName}`;
  if (active.some((grant) => grant.scopeType === 'TEAM')) return 'Direct reports';
  if (active.some((grant) => grant.scopeType === 'OWN')) return 'Own records';
  return 'None';
}

export { currentAssignmentFilter };
