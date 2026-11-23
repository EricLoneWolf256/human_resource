import type {
  AssignmentType,
  ChangeRequestStatus,
  DocumentCategory,
  DocumentStatus,
  EmploymentStatus,
  EmploymentType,
  NotificationPriority,
  OrgUnitType,
  PositionStatus,
  ProfileStatus,
  RetentionStatus,
  ScopeType,
  SensitivityLevel,
  UnitStatus,
  UserStatus,
} from './enums.js';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface RoleAssignmentDto {
  id: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  scopeType: ScopeType;
  scopeUnitId: string | null;
  scopeUnitName: string | null;
  startDate: string;
  endDate: string | null;
  assignedByName: string | null;
  reason: string | null;
  effective: boolean;
}

export interface SessionUser {
  id: string;
  email: string;
  status: UserStatus;
  mustChangePassword: boolean;
  employeeId: string | null;
  employee: {
    id: string;
    staffNumber: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
  } | null;
  permissions: string[];
  roleAssignments: RoleAssignmentDto[];
  lastLoginAt: string | null;
}

export interface EmployeeListItem {
  id: string;
  staffNumber: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  fullName: string;
  employmentType: EmploymentType;
  employmentStatus: EmploymentStatus;
  profileStatus: ProfileStatus;
  contactEmail: string | null;
  hireDate: string | null;
  primaryUnit: { id: string; name: string } | null;
  positionTitle: string | null;
}

export interface AssignmentDto {
  id: string;
  employeeId: string;
  unitId: string;
  unitName: string;
  positionId: string | null;
  positionTitle: string | null;
  supervisorEmployeeId: string | null;
  supervisorName: string | null;
  startDate: string;
  endDate: string | null;
  assignmentType: AssignmentType;
  isActing: boolean;
  notes: string | null;
  current: boolean;
}

export interface StatusHistoryDto {
  id: string;
  fromStatus: EmploymentStatus | null;
  toStatus: EmploymentStatus;
  effectiveDate: string;
  reason: string | null;
  changedByName: string | null;
  createdAt: string;
}

export interface EmergencyContactDto {
  id: string;
  name: string;
  relationship: string;
  phone: string;
}

export interface QualificationDto {
  id: string;
  institution: string;
  award: string;
  fieldOfStudy: string | null;
  yearCompleted: number | null;
  verified: boolean;
}

export interface EmployeeDetail extends EmployeeListItem {
  middleName: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  nationalId: string | null;
  phone: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  emergencyContacts: EmergencyContactDto[];
  qualifications: QualificationDto[];
  assignments: AssignmentDto[];
  statusHistory: StatusHistoryDto[];
  completeness: { percent: number; missingFields: string[] };
  sensitiveVisible: boolean;
}

export interface OrgUnitDto {
  id: string;
  code: string;
  name: string;
  type: OrgUnitType;
  parentId: string | null;
  parentName: string | null;
  headEmployeeId: string | null;
  headName: string | null;
  status: UnitStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  employeeCount: number;
}

export interface OrgTreeNode extends OrgUnitDto {
  children: OrgTreeNode[];
}

export interface PositionDto {
  id: string;
  code: string;
  title: string;
  description: string | null;
  grade: string | null;
  unitId: string;
  unitName: string;
  approvedHeadcount: number;
  filledCount: number;
  status: PositionStatus;
}

export interface DocumentDto {
  id: string;
  employeeId: string;
  employeeName: string | null;
  category: DocumentCategory;
  title: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  sensitivity: SensitivityLevel;
  version: number;
  expiryDate: string | null;
  retentionStatus: RetentionStatus;
  uploadedByName: string | null;
  uploadedAt: string;
  verifiedByName: string | null;
  verifiedAt: string | null;
  verificationNote: string | null;
}

export interface NotificationDto {
  id: string;
  eventType: string;
  title: string;
  safeSummary: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  priority: NotificationPriority;
  createdAt: string;
  readAt: string | null;
}

export interface AuditEventDto {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface UserDto {
  id: string;
  email: string;
  status: UserStatus;
  mustChangePassword: boolean;
  employeeId: string | null;
  employeeName: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  roles: RoleAssignmentDto[];
}

export interface RoleDto {
  id: string;
  key: string;
  name: string;
  description: string;
  permissions: string[];
}

export interface ChangeRequestDto {
  id: string;
  employeeId: string;
  employeeName: string | null;
  field: string;
  currentValue: string | null;
  requestedValue: string;
  reason: string | null;
  status: ChangeRequestStatus;
  requestedByName: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  createdAt: string;
}

export interface DashboardPayload {
  scopeLabel: string;
  unreadNotifications: number;
  headcount: {
    total: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
  } | null;
  pendingChangeRequests: number | null;
  pendingDocuments: number | null;
  expiringContracts: {
    documentId: string;
    title: string;
    employeeName: string;
    expiryDate: string;
  }[];
  recentHires: {
    id: string;
    fullName: string;
    staffNumber: string;
    hireDate: string;
    unitName: string | null;
  }[];
  profile: {
    staffNumber: string;
    profileStatus: ProfileStatus;
    completenessPercent: number;
    pendingChangeRequests: number;
    documentCount: number;
  } | null;
  admin: {
    usersByStatus: Record<string, number>;
    activeRoleAssignments: number;
    expiringAssignments7d: number;
    recentAudit: AuditEventDto[];
  } | null;
}

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  ACCOUNT_DEACTIVATED: 'ACCOUNT_DEACTIVATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  INTERNAL: 'INTERNAL',
} as const;