import type { RoleAssignmentDto, SessionUser } from '@umu-hr/shared';
import { toDateOnly } from './dates.js';
import type { AuthContext, EffectiveGrant } from './auth/context.js';

export function fullName(person: {
  firstName: string;
  lastName: string;
  preferredName?: string | null;
}): string {
  return `${person.preferredName?.trim() || person.firstName} ${person.lastName}`.trim();
}

export function toRoleAssignmentDto(grant: EffectiveGrant): RoleAssignmentDto {
  return {
    id: grant.assignmentId,
    roleId: grant.roleKey,
    roleKey: grant.roleKey,
    roleName: grant.roleName,
    scopeType: grant.scopeType,
    scopeUnitId: grant.scopeUnitId,
    scopeUnitName: grant.scopeUnitName,
    startDate: toDateOnly(grant.startDate),
    endDate: grant.endDate ? toDateOnly(grant.endDate) : null,
    assignedByName: grant.assignedByName,
    reason: grant.reason,
    effective: grant.effective,
  };
}

export function toSessionUser(ctx: AuthContext): SessionUser {
  return {
    id: ctx.user.id,
    email: ctx.user.email,
    status: ctx.user.status,
    mustChangePassword: ctx.user.mustChangePassword,
    mfaEnabled: ctx.user.mfaEnabled,
    employeeId: ctx.user.employeeId,
    employee: ctx.user.employee
      ? {
          id: ctx.user.employee.id,
          staffNumber: ctx.user.employee.staffNumber,
          firstName: ctx.user.employee.firstName,
          lastName: ctx.user.employee.lastName,
          preferredName: ctx.user.employee.preferredName,
        }
      : null,
    permissions: [...ctx.permissions].sort(),
    roleAssignments: ctx.grants.map(toRoleAssignmentDto),
    lastLoginAt: ctx.user.lastLoginAt ? ctx.user.lastLoginAt.toISOString() : null,
  };
}
