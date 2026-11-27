import { z } from 'zod';
import {
  APPLICATION_STATUSES,
  APPRAISAL_CYCLE_STATUSES,
  APPRAISAL_STATUSES,
  APPRAISAL_TEMPLATE_TYPES,
  ASSIGNMENT_TYPES,
  CAREER_CASE_STATUSES,
  CAREER_CASE_TYPES,
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
  PANEL_ROLES,
  POSITION_STATUSES,
  PROBATION_OUTCOMES,
  REQUISITION_STATUSES,
  REMINDER_TYPES,
  SCOPE_TYPES,
  SCORECARD_RECOMMENDATIONS,
  SENSITIVITY_LEVELS,
  STAFF_NUMBER_HINT,
  STAFF_NUMBER_PATTERN,
  TRAINING_COURSE_CATEGORIES,
  TRAINING_REQUEST_STATUSES,
  UNIT_SCOPES,
  UNIT_STATUSES,
  USER_STATUSES,
} from './enums.js';

const uuid = z.string().uuid();
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date in YYYY-MM-DD format')
  .refine((value) => {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  }, 'Expected a valid calendar date in YYYY-MM-DD format');
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

const mfaCodeSchema = z.string().trim().regex(/^\d{6}$/, 'Expected a 6-digit authenticator code');
const mfaChallengeTokenSchema = z.string().min(1).max(512);

export const mfaVerifySchema = z.object({
  challengeToken: mfaChallengeTokenSchema,
  code: mfaCodeSchema,
});

export const mfaRecoverSchema = z.object({
  challengeToken: mfaChallengeTokenSchema,
  recoveryCode: z.string().trim().min(8).max(64),
});

export const mfaEnableSchema = z.object({ code: mfaCodeSchema });
export const mfaDisableSchema = z.object({ code: mfaCodeSchema });

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

const requisitionBaseSchema = z.object({
  code: z.string().trim().regex(/^[A-Z0-9-]{2,20}$/, 'Code must be 2-20 uppercase letters, digits or hyphens'),
  title: z.string().trim().min(2).max(120),
  description: optionalText(5000),
  requirements: optionalText(5000),
  unitId: uuid,
  positionId: uuid.optional().nullable(),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  openings: z.number().int().min(1).max(50).default(1),
  closingDate: dateOnly,
  salaryGrade: optionalText(20),
});

const notPastDate = (value: string | undefined, ctx: z.RefinementCtx, path: string) => {
  if (value && value < new Date().toISOString().slice(0, 10)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message: 'Closing date cannot be in the past' });
  }
};

export const requisitionCreateSchema = requisitionBaseSchema.superRefine((value, ctx) =>
  notPastDate(value.closingDate, ctx, 'closingDate'),
);

export const requisitionUpdateSchema = requisitionBaseSchema
  .partial()
  .omit({ code: true })
  .superRefine((value, ctx) => notPastDate(value.closingDate, ctx, 'closingDate'));

export const requisitionDecisionSchema = z
  .object({
    action: z.enum(['APPROVE', 'REJECT']),
    comment: z.string().trim().min(3).max(1000),
  });

export const vacancyPublishSchema = z.object({
  note: optionalText(500),
});

export const vacancyQuerySchema = paginationSchema.extend({
  status: z.enum(REQUISITION_STATUSES).optional(),
  unitId: uuid.optional(),
  q: z.string().trim().max(120).optional(),
});

export const applicationCreateSchema = z.object({
  vacancyId: uuid,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  phone: optionalText(30),
  coverNote: optionalText(5000),
  qualifications: optionalText(5000),
});

export const applicationTrackSchema = z.object({
  reference: z.string().trim().min(6).max(30),
  email: z.string().trim().email().max(254),
});

export const applicationStatusSchema = z
  .object({
    status: z.enum(APPLICATION_STATUSES),
    note: optionalText(1000),
  })
  .superRefine((val, ctx) => {
    if (
      ['ACCEPTED', 'DECLINED', 'REJECTED', 'WITHDRAWN'].includes(val.status) &&
      (!val.note || val.note.trim().length < 3)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'A note of at least 3 characters is required for this decision',
      });
    }
  });

export const offerCreateSchema = z.object({
  note: z.string().trim().min(3).max(1000),
  offerDetails: z.string().trim().min(3).max(2000),
});

export const offerResponseSchema = z.object({
  action: z.enum(['ACCEPT', 'DECLINE']),
  note: optionalText(1000),
});

export const panelAssignmentCreateSchema = z.object({
  vacancyId: uuid,
  userId: uuid,
  role: z.enum(PANEL_ROLES).default('MEMBER'),
});

export const interviewCreateSchema = z.object({
  applicationId: uuid,
  panelAssignmentId: uuid.optional().nullable(),
  scheduledAt: z.string().datetime({ offset: true }),
  location: optionalText(120),
  note: optionalText(1000),
});

export const scorecardCreateSchema = z.object({
  applicationId: uuid,
  criteria: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(80),
        score: z.number().int().min(1).max(5),
        comment: optionalText(500),
      }),
    )
    .min(1)
    .max(10),
  recommendation: z.enum(SCORECARD_RECOMMENDATIONS),
  strengths: optionalText(2000),
  concerns: optionalText(2000),
});

export const candidateQuerySchema = paginationSchema.extend({
  vacancyId: uuid.optional(),
  status: z.enum(APPLICATION_STATUSES).optional(),
  q: z.string().trim().max(120).optional(),
});

export const appraisalCycleCreateSchema = z
  .object({
    code: z.string().trim().regex(/^[A-Z0-9-]{2,20}$/, 'Code must be 2-20 uppercase letters, digits or hyphens'),
    name: z.string().trim().min(2).max(120),
    description: optionalText(1000),
    templateType: z.enum(APPRAISAL_TEMPLATE_TYPES),
    startDate: dateOnly,
    endDate: dateOnly,
  })
  .superRefine(ensureDateRange);

export const appraisalCycleUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: optionalText(1000),
  templateType: z.enum(APPRAISAL_TEMPLATE_TYPES).optional(),
  startDate: dateOnly.optional(),
  endDate: dateOnly.optional(),
  status: z.enum(APPRAISAL_CYCLE_STATUSES).optional(),
});

export const appraisalObjectiveCreateSchema = z.object({
  title: z.string().trim().min(2).max(150),
  target: z.string().trim().min(2).max(500),
  weight: z.number().int().min(1).max(100),
});

export const appraisalCreateSchema = z.object({
  cycleId: uuid,
  employeeId: uuid,
  objectives: z.array(appraisalObjectiveCreateSchema).min(1).max(20),
});

export const objectiveRatingSchema = z.object({
  id: uuid,
  rating: z.number().int().min(1).max(5),
});

export const appraisalSelfReviewSchema = z.object({
  selfRating: z.number().int().min(1).max(5),
  selfComment: z.string().trim().min(3).max(5000),
  developmentPlan: optionalText(5000),
  objectiveRatings: z.array(objectiveRatingSchema).max(20).default([]),
});

export const appraisalReviewSchema = z
  .object({
    stage: z.enum(['SUPERVISOR', 'HOD', 'HR']),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().min(3).max(5000),
    developmentPlan: optionalText(5000),
  });

export const appraisalFinalizeSchema = z.object({
  finalRating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(3).max(2000),
});

export const appraisalQuerySchema = paginationSchema.extend({
  cycleId: uuid.optional(),
  employeeId: uuid.optional(),
  status: z.enum(APPRAISAL_STATUSES).optional(),
});

export const trainingCourseCreateSchema = z.object({
  code: z.string().trim().regex(/^[A-Z0-9-]{2,20}$/, 'Code must be 2-20 uppercase letters, digits or hyphens'),
  title: z.string().trim().min(2).max(150),
  description: optionalText(5000),
  category: z.enum(TRAINING_COURSE_CATEGORIES),
  provider: optionalText(150),
  durationHours: z.number().int().min(1).max(1000).default(1),
  isActive: z.boolean().default(true),
});

export const trainingCourseUpdateSchema = trainingCourseCreateSchema.partial().omit({ code: true });

export const trainingRequestCreateSchema = z.object({
  employeeId: uuid.optional(),
  courseId: uuid,
  reason: z.string().trim().min(3).max(2000),
  neededBy: dateOnly.optional(),
});

export const trainingDecisionSchema = z
  .object({
    action: z.enum(['RECOMMEND', 'APPROVE', 'REJECT']),
    comment: z.string().trim().min(3).max(1000),
  });

export const trainingStatusSchema = z
  .object({
    status: z.enum(TRAINING_REQUEST_STATUSES),
    comment: optionalText(1000),
  })
  .superRefine((val, ctx) => {
    if (val.status === 'REJECTED' && (!val.comment || val.comment.trim().length < 3)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['comment'],
        message: 'A comment of at least 3 characters is required to reject training',
      });
    }
  });

export const trainingCompletionSchema = z.object({
  completedAt: dateOnly,
  score: z.number().int().min(0).max(100).optional(),
  certificateNumber: z.string().trim().min(3).max(80).optional(),
  expiryDate: dateOnly.optional(),
  skillName: z.string().trim().min(2).max(120).optional(),
});

export const trainingQuerySchema = paginationSchema.extend({
  status: z.enum(TRAINING_REQUEST_STATUSES).optional(),
  employeeId: uuid.optional(),
  courseId: uuid.optional(),
});

export const employeeSkillCreateSchema = z.object({
  employeeId: uuid,
  name: z.string().trim().min(2).max(120),
  certificateNumber: optionalText(80),
  issuedAt: dateOnly,
  expiryDate: dateOnly.optional(),
});

export const careerCaseCreateSchema = z.object({
  employeeId: uuid,
  type: z.enum(CAREER_CASE_TYPES),
  proposedUnitId: uuid.optional().nullable(),
  proposedPositionId: uuid.optional().nullable(),
  effectiveDate: dateOnly,
  reason: z.string().trim().min(10).max(2000),
});

export const careerProgressSchema = z
  .object({
    status: z.enum(CAREER_CASE_STATUSES),
    note: optionalText(1000),
    documentsVerified: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.status === 'REJECTED' && (!val.note || val.note.trim().length < 3)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'A note of at least 3 characters is required to reject a career case',
      });
    }
  });

export const careerDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  effectiveDate: dateOnly.optional(),
  note: z.string().trim().min(3).max(2000),
});

export const careerCaseQuerySchema = paginationSchema.extend({
  status: z.enum(CAREER_CASE_STATUSES).optional(),
  type: z.enum(CAREER_CASE_TYPES).optional(),
  employeeId: uuid.optional(),
});

export const reportQuerySchema = z
  .object({
    from: dateOnly.optional(),
    to: dateOnly.optional(),
    unitId: uuid.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.from && value.to && value.to < value.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'to must be on or after from',
      });
    }
  });

export const reportPresetCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  query: reportQuerySchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;
export type MfaRecoverInput = z.infer<typeof mfaRecoverSchema>;
export type MfaEnableInput = z.infer<typeof mfaEnableSchema>;
export type MfaDisableInput = z.infer<typeof mfaDisableSchema>;
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
export type RequisitionCreateInput = z.infer<typeof requisitionCreateSchema>;
export type RequisitionUpdateInput = z.infer<typeof requisitionUpdateSchema>;
export type RequisitionDecisionInput = z.infer<typeof requisitionDecisionSchema>;
export type ApplicationCreateInput = z.infer<typeof applicationCreateSchema>;
export type ApplicationTrackInput = z.infer<typeof applicationTrackSchema>;
export type ApplicationStatusInput = z.infer<typeof applicationStatusSchema>;
export type OfferCreateInput = z.infer<typeof offerCreateSchema>;
export type PanelAssignmentCreateInput = z.infer<typeof panelAssignmentCreateSchema>;
export type InterviewCreateInput = z.infer<typeof interviewCreateSchema>;
export type ScorecardCreateInput = z.infer<typeof scorecardCreateSchema>;
export type CandidateQuery = z.infer<typeof candidateQuerySchema>;
export type AppraisalCycleCreateInput = z.infer<typeof appraisalCycleCreateSchema>;
export type AppraisalCycleUpdateInput = z.infer<typeof appraisalCycleUpdateSchema>;
export type AppraisalCreateInput = z.infer<typeof appraisalCreateSchema>;
export type AppraisalSelfReviewInput = z.infer<typeof appraisalSelfReviewSchema>;
export type AppraisalReviewInput = z.infer<typeof appraisalReviewSchema>;
export type AppraisalFinalizeInput = z.infer<typeof appraisalFinalizeSchema>;
export type TrainingCourseCreateInput = z.infer<typeof trainingCourseCreateSchema>;
export type TrainingRequestCreateInput = z.infer<typeof trainingRequestCreateSchema>;
export type TrainingDecisionInput = z.infer<typeof trainingDecisionSchema>;
export type TrainingStatusInput = z.infer<typeof trainingStatusSchema>;
export type TrainingCompletionInput = z.infer<typeof trainingCompletionSchema>;
export type EmployeeSkillCreateInput = z.infer<typeof employeeSkillCreateSchema>;
export type CareerCaseCreateInput = z.infer<typeof careerCaseCreateSchema>;
export type CareerProgressInput = z.infer<typeof careerProgressSchema>;
export type CareerDecisionInput = z.infer<typeof careerDecisionSchema>;
export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type ReportPresetCreateInput = z.infer<typeof reportPresetCreateSchema>;
