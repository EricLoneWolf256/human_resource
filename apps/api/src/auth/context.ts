import type { ScopeType } from '@umu-hr/shared';

export interface AuthUserSafe {
  id: string;
  email: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  mustChangePassword: boolean;
  mfaEnabled: boolean;
  employeeId: string | null;
  lastLoginAt: Date | null;
  employee: {
    id: string;
    staffNumber: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
  } | null;
}

export interface EffectiveGrant {
  assignmentId: string;
  roleKey: string;
  roleName: string;
  scopeType: ScopeType;
  scopeUnitId: string | null;
  scopeUnitName: string | null;
  startDate: Date;
  endDate: Date | null;
  assignedByName: string | null;
  reason: string | null;
  permissions: Set<string>;
  scopeUnitIds: string[];
  scopeEmployeeIds: string[];
  all: boolean;
  effective: boolean;
}

export interface AuthContext {
  userId: string;
  sessionId: string;
  user: AuthUserSafe;
  employeeId: string | null;
  permissions: Set<string>;
  grants: EffectiveGrant[];
  ipAddress: string | null;
  userAgent: string | null;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
