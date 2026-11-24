import { z } from 'zod';
import {
  ASSIGNMENT_TYPES,
  CHANGE_REQUEST_FIELDS,
  CHANGE_REQUEST_STATUSES,
  CONTRACT_RENEWAL_STATUSES,
  CONTRACT_STATUSES,
  CONTRACT_TYPES,
  DOCUMENT_CATEGORIES,
  DOCUMENT_STATUSES,
  EMPLOYMENT_STATUSES,
  EMPLOYMENT_TYPES,
  GENDERS,
  HR_REQUEST_CATEGORIES,
  HR_REQUEST_STATUSES,
  LEAVE_REQUEST_STATUSES,
  NOTIFICATION_PRIORITIES,
  ONBOARDING_TASK_STATUSES,
  ORG_UNIT_TYPES,
  POSITION_STATUSES,
  PROBATION_OUTCOMES,
  REMINDER_TYPES,
  SCOPE_TYPES,
  SENSITIVITY_LEVELS,
  STAFF_NUMBER_HINT,
  STAFF_NUMBER_PATTERN,
  UNIT_SCOPES,
  UNIT_STATUSES,
  USER_STATUSES,
} from './enums.js';

const uuid = z.string().uuid();
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date in YYYY-MM-DD format');
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

export const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

export const newPasswordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a digit');

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: newPasswordSchema,
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const createUserSchema = z.object({
  email: z.string().trim().email().max(254),
  password: newPasswordSchema,
  employeeId: uuid.optional().nullable(),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(USER_STATUSES),
  reason: z.string().trim().min(3).max(500),
});

export const resetPasswordSchema = z.object({
  newPassword: newPasswordSchema.optional(),
});

export const assignRoleSchema = z
  .object({
    roleId: uuid,
    scopeType: z.enum(SCOPE_TYPES),
    scopeUnitId: uuid.optional().nullable(),
    startDate: dateOnly.optional(),
    endDate: dateOnly.optional().nullable(),
    reason: z.string().trim().min(3).max(500),
  })
  .superRefine((val, ctx) => {
    if (UNIT_SCOPES.includes(val.scopeType) && !val.scopeUnitId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scopeUnitId'],
        message: 'scopeUnitId is required for DEPARTMENT and FACULTY scopes',
      });
    }
    if (val.startDate && val.endDate && val.endDate < val.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'endDate must be on or after startDate',
      });
    }
  });

export const orgUnitCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9-]{2,12}$/, 'Code must be 2-12 uppercase letters, digits or hyphens'),
  name: z.string().trim().min(2).max(120),
  type: z.enum(ORG_UNIT_TYPES),
  parentId: uuid.optional().nullable(),
  headEmployeeId: uuid.optional().nullable(),
  effectiveFrom: dateOnly.optional(),
});

export const orgUnitUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  type: z.enum(ORG_UNIT_TYPES).optional(),
  parentId: uuid.optional().nullable(),
  headEmployeeId: uuid.optional().nullable(),
  effectiveFrom: dateOnly.optional(),
  effectiveTo: dateOnly.optional().nullable(),
  status: z.enum(UNIT_STATUSES).optional(),
});

export const deactivateSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const positionCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9-]{2,16}$/, 'Code must be 2-16 uppercase letters, digits or hyphens'),
  title: z.string().trim().min(2).max(120),
  description: optionalText(2000),
  grade: optionalText(20),
  unitId: uuid,
  approvedHeadcount: z.coerce.number().int().min(1).max(10000).default(1),
});

export const positionUpdateSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  description: optionalText(2000),
  grade: optionalText(20),
  unitId: uuid.optional(),
  approvedHeadcount: z.coerce.number().int().min(1).max(10000).optional(),
  status: z.enum(POSITION_STATUSES).optional(),
});

const assignmentInputSchema = z.object({
  unitId: uuid,
  positionId: uuid.optional().nullable(),
  supervisorEmployeeId: uuid.optional().nullable(),
  startDate: dateOnly,
  endDate: dateOnly.optional().nullable(),
  assignmentType: z.enum(ASSIGNMENT_TYPES).default('PRIMARY'),
  isActing: z.boolean().default(false),
  notes: optionalText(500),
});

export const employeeCreateSchema = z.object({
  staffNumber: z.string().trim().regex(STAFF_NUMBER_PATTERN, STAFF_NUMBER_HINT),
  firstName: z.string().trim().min(1).max(80),
  middleName: optionalText(80),
  lastName: z.string().trim().min(1).max(80),
  preferredName: optionalText(80),
  contactEmail: z.string().trim().email().max(254).optional().nullable(),
  phone: optionalText(30),
  dateOfBirth: dateOnly.optional().nullable(),
  nationalId: optionalText(50),
  gender: z.enum(GENDERS).optional().nullable(),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  hireDate: dateOnly.optional().nullable(),
  endDate: dateOnly.optional().nullable(),
  assignment: assignmentInputSchema.optional(),
});

export const employeeUpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  middleName: optionalText(80),
  lastName: z.string().trim().min(1).max(80).optional(),
  preferredName: optionalText(80),
  contactEmail: z.string().trim().email().max(254).optional().nullable(),
  phone: optionalText(30),
  dateOfBirth: dateOnly.optional().nullable(),
  nationalId: optionalText(50),
  gender: z.enum(GENDERS).optional().nullable(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  hireDate: dateOnly.optional().nullable(),
  endDate: dateOnly.optional().nullable(),
});

export const statusChangeSchema = z.object({
  toStatus: z.enum(EMPLOYMENT_STATUSES),
  effectiveDate: dateOnly,
  reason: z.string().trim().min(3).max(500),
});

export const assignmentCreateSchema = assignmentInputSchema.superRefine((val, ctx) => {
  if (val.endDate && val.endDate < val.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endDate'],
      message: 'endDate must be on or after startDate',
    });
  }
});

export const verifyEmployeeSchema = z.object({
  note: optionalText(500),
});

export const emergencyContactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  relationship: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(3).max(30),
});

export const selfServiceSchema = z.object({
  phone: optionalText(30),
  preferredName: optionalText(80),
  emergencyContacts: z.array(emergencyContactSchema).max(5).optional(),
});

export const changeRequestCreateSchema = z.object({
  field: z.enum(CHANGE_REQUEST_FIELDS),
  requestedValue: z.string().trim().min(1).max(500),
  reason: optionalText(500),
});

export const changeRequestDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  comment: optionalText(500),
});

export const documentUploadMetaSchema = z.object({
  employeeId: uuid,
  category: z.enum(DOCUMENT_CATEGORIES),
  title: z.string().trim().min(2).max(150),
  sensitivity: z.enum(SENSITIVITY_LEVELS).default('CONFIDENTIAL'),
  expiryDate: dateOnly.optional(),
});

export const documentVerifySchema = z.object({
  note: optionalText(500),
});

export const documentRejectSchema = z.object({
  note: z.string().trim().min(3).max(500),
});

export const employeeQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  unitId: uuid.optional(),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  profileStatus: z.enum(['DRAFT', 'INCOMPLETE', 'SUBMITTED', 'VERIFIED']).optional(),
  sortBy: z.enum(['staffNumber', 'lastName', 'hireDate', 'createdAt']).default('staffNumber'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const documentQuerySchema = paginationSchema.extend({
  employeeId: uuid.optional(),
  category: z.enum(DOCUMENT_CATEGORIES).optional(),
  status: z.enum(DOCUMENT_STATUSES).optional(),
  q: z.string().trim().max(120).optional(),
});

export const auditQuerySchema = paginationSchema.extend({
  actorId: uuid.optional(),
  action: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(80).optional(),
  entityId: uuid.optional(),
  from: z.string().datetime({ offset: true }).or(dateOnly).optional(),
  to: z.string().datetime({ offset: true }).or(dateOnly).optional(),
});

export const notificationQuerySchema = paginationSchema.extend({
  unreadOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  priority: z.enum(NOTIFICATION_PRIORITIES).optional(),
});

export const userQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  status: z.enum(USER_STATUSES).optional(),
});

export const positionQuerySchema = paginationSchema.extend({
  unitId: uuid.optional(),
  status: z.enum(POSITION_STATUSES).optional(),
  q: z.string().trim().max(120).optional(),
});

export const orgUnitQuerySchema = paginationSchema.extend({
  type: z.enum(ORG_UNIT_TYPES).optional(),
  status: z.enum(UNIT_STATUSES).optional(),
  q: z.string().trim().max(120).optional(),
});

export const changeRequestQuerySchema = paginationSchema.extend({
  status: z.enum(CHANGE_REQUEST_STATUSES).optional(),
  employeeId: uuid.optional(),
});

function ensureDateRange(val: { startDate: string; endDate: string }, ctx: z.RefinementCtx): void {
  if (val.endDate < val.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endDate'],
      message: 'endDate must be on or after startDate',
    });
  }
}

export const leaveTypeCreateSchema = z.object({
  code: z.string().trim().regex(/^[A-Z0-9-]{2,16}$/, 'Code must be 2-16 uppercase letters, digits or hyphens'),
  name: z.string().trim().min(2).max(120),
  description: optionalText(500),
  requiresReason: z.boolean().default(false),
  requiresEvidence: z.boolean().default(false),
  requiresHrReview: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const leaveTypeUpdateSchema = leaveTypeCreateSchema.partial().omit({ code: true });

export const leavePolicyUpsertSchema = z.object({
  leaveTypeId: uuid,
  period: z.string().trim().regex(/^\d{4}(-\d{2})?$/, 'Use YYYY or YYYY-MM'),
  entitlementDays: z.number().min(0).max(365),
  carryoverCapDays: z.number().min(0).max(365).default(0),
  maxConsecutiveDays: z.number().int().min(1).max(365).default(365),
  minNoticeDays: z.number().int().min(0).max(365).default(0),
  allowNegativeBalance: z.boolean().default(false),
});

export const leaveBalanceAdjustSchema = z.object({
  delta: z.number().min(-365).max(365).refine((value) => value !== 0, 'delta cannot be zero'),
  reason: z.string().trim().min(3).max(500),
});

export const leaveRequestCreateSchema = z
  .object({
    employeeId: uuid.optional(),
    leaveTypeId: uuid,
    startDate: dateOnly,
    endDate: dateOnly,
    reason: z.string().trim().max(1000).optional().nullable(),
    isHalfDay: z.boolean().default(false),
    documentIds: z.array(uuid).max(5).optional(),
  })
  .superRefine((val, ctx) => {
    ensureDateRange(val, ctx);
    if (val.isHalfDay && val.startDate !== val.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['isHalfDay'],
        message: 'Half-day leave must be a single day',
      });
    }
  });

export const leaveDecisionSchema = z
  .object({
    action: z.enum(['APPROVE', 'REJECT', 'SEND_HR']),
    comment: optionalText(500),
  })
  .superRefine((val, ctx) => {
    if (val.action === 'REJECT' && (!val.comment || val.comment.trim().length < 3)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['comment'],
        message: 'A comment of at least 3 characters is required to reject leave',
      });
    }
  });

export const leaveCancelSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const leaveRequestQuerySchema = paginationSchema.extend({
  status: z.enum(LEAVE_REQUEST_STATUSES).optional(),
  employeeId: uuid.optional(),
  leaveTypeId: uuid.optional(),
  fromDate: dateOnly.optional(),
  toDate: dateOnly.optional(),
});

export const leaveBalanceQuerySchema = z.object({
  employeeId: uuid.optional(),
});

export const hrRequestCreateSchema = z.object({
  category: z.enum(HR_REQUEST_CATEGORIES),
  subject: z.string().trim().min(3).max(150),
  description: z.string().trim().min(10).max(5000),
  sensitivity: z.enum(SENSITIVITY_LEVELS).default('INTERNAL'),
  requestedForEmployeeId: uuid.optional(),
  relatedLeaveRequestId: uuid.optional(),
});

export const hrRequestAssignSchema = z.object({
  assignedToUserId: uuid,
  note: optionalText(500),
});

export const hrRequestStatusSchema = z
  .object({
    status: z.enum(HR_REQUEST_STATUSES),
    comment: optionalText(1000),
  })
  .superRefine((val, ctx) => {
    if (val.status === 'CLOSED' && (!val.comment || val.comment.trim().length < 3)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['comment'],
        message: 'A closing comment of at least 3 characters is required',
      });
    }
  });

export const hrRequestFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: optionalText(1000),
});

export const hrRequestQuerySchema = paginationSchema.extend({
  status: z.enum(HR_REQUEST_STATUSES).optional(),
  category: z.enum(HR_REQUEST_CATEGORIES).optional(),
  assignedToUserId: uuid.optional(),
  mine: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(120).optional(),
});

export const contractCreateSchema = z
  .object({
    employeeId: uuid,
    type: z.enum(CONTRACT_TYPES),
    startDate: dateOnly,
    endDate: dateOnly.optional().nullable(),
    status: z.enum(CONTRACT_STATUSES).default('DRAFT'),
    renewalStatus: z.enum(CONTRACT_RENEWAL_STATUSES).default('NONE'),
    documentId: uuid.optional().nullable(),
    notes: optionalText(1000),
  })
  .superRefine((val, ctx) => {
    if (val.endDate && val.endDate < val.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'endDate must be on or after startDate',
      });
    }
    if (val.type === 'FIXED_TERM' && !val.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'endDate is required for fixed-term contracts',
      });
    }
  });

export const contractUpdateSchema = z.object({
  type: z.enum(CONTRACT_TYPES).optional(),
  startDate: dateOnly.optional(),
  endDate: dateOnly.optional().nullable(),
  status: z.enum(CONTRACT_STATUSES).optional(),
  renewalStatus: z.enum(CONTRACT_RENEWAL_STATUSES).optional(),
  documentId: uuid.optional().nullable(),
  notes: optionalText(1000),
});

export const probationCreateSchema = z
  .object({
    employeeId: uuid,
    startDate: dateOnly,
    endDate: dateOnly,
    reviewDate: dateOnly,
    notes: optionalText(1000),
  })
  .superRefine((val, ctx) => {
    ensureDateRange({ startDate: val.startDate, endDate: val.endDate }, ctx);
    if (val.reviewDate < val.startDate || val.reviewDate > val.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reviewDate'],
        message: 'reviewDate must fall within the probation period',
      });
    }
  });

export const probationReviewSchema = z
  .object({
    outcome: z.enum(PROBATION_OUTCOMES),
    notes: optionalText(1000),
    effectiveDate: dateOnly.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.outcome !== 'PENDING' && (!val.notes || val.notes.trim().length < 3)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['notes'],
        message: 'Notes of at least 3 characters are required for this outcome',
      });
    }
  });

export const onboardingTaskTemplateSchema = z.object({
  title: z.string().trim().min(2).max(150),
  description: optionalText(500),
  ownerRoleKey: z.string().trim().min(2).max(60),
  dueOffsetDays: z.number().int().min(0).max(365).default(0),
  isRequired: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export const onboardingTemplateCreateSchema = z.object({
  code: z.string().trim().regex(/^[A-Z0-9-]{2,16}$/, 'Code must be 2-16 uppercase letters, digits or hyphens'),
  name: z.string().trim().min(2).max(120),
  description: optionalText(500),
  tasks: z.array(onboardingTaskTemplateSchema).max(50).default([]),
});

export const onboardingTaskCreateSchema = z.object({
  checklistId: uuid,
  title: z.string().trim().min(2).max(150),
  description: optionalText(500),
  ownerUserId: uuid.optional().nullable(),
  dueDate: dateOnly.optional().nullable(),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export const onboardingChecklistCreateSchema = z.object({
  employeeId: uuid,
  templateId: uuid,
  dueDate: dateOnly.optional().nullable(),
});

export const onboardingTaskUpdateSchema = z.object({
  status: z.enum(ONBOARDING_TASK_STATUSES),
  comment: optionalText(1000),
  ownerUserId: uuid.optional().nullable(),
  dueDate: dateOnly.optional().nullable(),
});

export const reminderScanSchema = z.object({
  type: z.enum(REMINDER_TYPES).optional(),
  daysAhead: z.coerce.number().int().min(1).max(365).default(30),
});

export const delegationCreateSchema = z
  .object({
    delegateUserId: uuid,
    permissionKey: z.string().trim().min(3).max(80),
    scopeType: z.enum(SCOPE_TYPES),
    scopeUnitId: uuid.optional().nullable(),
    startDate: dateOnly.optional(),
    endDate: dateOnly.optional().nullable(),
    reason: z.string().trim().min(3).max(500),
  })
  .superRefine((val, ctx) => {
    if (UNIT_SCOPES.includes(val.scopeType) && !val.scopeUnitId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scopeUnitId'],
        message: 'scopeUnitId is required for DEPARTMENT and FACULTY scopes',
      });
    }
    if (val.startDate && val.endDate && val.endDate < val.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'endDate must be on or after startDate',
      });
    }
  });

export const delegationRevokeSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;
export type EmployeeQuery = z.infer<typeof employeeQuerySchema>;
export type OrgUnitCreateInput = z.infer<typeof orgUnitCreateSchema>;
export type OrgUnitUpdateInput = z.infer<typeof orgUnitUpdateSchema>;
export type PositionCreateInput = z.infer<typeof positionCreateSchema>;
export type PositionUpdateInput = z.infer<typeof positionUpdateSchema>;
export type StatusChangeInput = z.infer<typeof statusChangeSchema>;
export type AssignmentCreateInput = z.infer<typeof assignmentCreateSchema>;
export type SelfServiceInput = z.infer<typeof selfServiceSchema>;
export type ChangeRequestCreateInput = z.infer<typeof changeRequestCreateSchema>;
export type DocumentUploadMeta = z.infer<typeof documentUploadMetaSchema>;
export type AuditQuery = z.infer<typeof auditQuerySchema>;
export type DocumentQuery = z.infer<typeof documentQuerySchema>;
export type NotificationQuery = z.infer<typeof notificationQuerySchema>;
export type UserQuery = z.infer<typeof userQuerySchema>;
export type PositionQuery = z.infer<typeof positionQuerySchema>;
export type OrgUnitQuery = z.infer<typeof orgUnitQuerySchema>;
export type ChangeRequestQuery = z.infer<typeof changeRequestQuerySchema>;
export type LeaveTypeCreateInput = z.infer<typeof leaveTypeCreateSchema>;
export type LeaveTypeUpdateInput = z.infer<typeof leaveTypeUpdateSchema>;
export type LeavePolicyUpsertInput = z.infer<typeof leavePolicyUpsertSchema>;
export type LeaveBalanceAdjustInput = z.infer<typeof leaveBalanceAdjustSchema>;
export type LeaveRequestCreateInput = z.infer<typeof leaveRequestCreateSchema>;
export type LeaveDecisionInput = z.infer<typeof leaveDecisionSchema>;
export type LeaveCancelInput = z.infer<typeof leaveCancelSchema>;
export type LeaveRequestQuery = z.infer<typeof leaveRequestQuerySchema>;
export type LeaveBalanceQuery = z.infer<typeof leaveBalanceQuerySchema>;
export type HrRequestCreateInput = z.infer<typeof hrRequestCreateSchema>;
export type HrRequestAssignInput = z.infer<typeof hrRequestAssignSchema>;
export type HrRequestStatusInput = z.infer<typeof hrRequestStatusSchema>;
export type HrRequestFeedbackInput = z.infer<typeof hrRequestFeedbackSchema>;
export type HrRequestQuery = z.infer<typeof hrRequestQuerySchema>;
export type ContractCreateInput = z.infer<typeof contractCreateSchema>;
export type ContractUpdateInput = z.infer<typeof contractUpdateSchema>;
export type ProbationCreateInput = z.infer<typeof probationCreateSchema>;
export type ProbationReviewInput = z.infer<typeof probationReviewSchema>;
export type OnboardingTemplateCreateInput = z.infer<typeof onboardingTemplateCreateSchema>;
export type OnboardingTaskCreateInput = z.infer<typeof onboardingTaskCreateSchema>;
export type OnboardingChecklistCreateInput = z.infer<typeof onboardingChecklistCreateSchema>;
export type OnboardingTaskUpdateInput = z.infer<typeof onboardingTaskUpdateSchema>;
export type ReminderScanInput = z.infer<typeof reminderScanSchema>;
export type DelegationCreateInput = z.infer<typeof delegationCreateSchema>;
export type DelegationRevokeInput = z.infer<typeof delegationRevokeSchema>;