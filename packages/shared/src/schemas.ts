import { z } from 'zod';
import {
  ASSIGNMENT_TYPES,
  CHANGE_REQUEST_FIELDS,
  CHANGE_REQUEST_STATUSES,
  DOCUMENT_CATEGORIES,
  DOCUMENT_STATUSES,
  EMPLOYMENT_STATUSES,
  EMPLOYMENT_TYPES,
  GENDERS,
  NOTIFICATION_PRIORITIES,
  ORG_UNIT_TYPES,
  POSITION_STATUSES,
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