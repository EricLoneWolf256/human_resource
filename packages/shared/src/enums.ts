export const SCOPE_TYPES = [
  'OWN',
  'ASSIGNED',
  'TEAM',
  'DEPARTMENT',
  'FACULTY',
  'INSTITUTION',
] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

export const UNIT_SCOPES: readonly ScopeType[] = ['DEPARTMENT', 'FACULTY'];

export const ORG_UNIT_TYPES = [
  'UNIVERSITY',
  'FACULTY',
  'SCHOOL',
  'DIRECTORATE',
  'DEPARTMENT',
  'OFFICE',
  'UNIT',
  'SECTION',
] as const;
export type OrgUnitType = (typeof ORG_UNIT_TYPES)[number];

export const UNIT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const POSITION_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type PositionStatus = (typeof POSITION_STATUSES)[number];

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const EMPLOYMENT_TYPES = [
  'PERMANENT',
  'FIXED_TERM',
  'PART_TIME',
  'VISITING',
  'ADJUNCT',
  'PROJECT',
  'TEMPORARY',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'ON_LEAVE',
  'SUSPENDED',
  'RESIGNED',
  'RETIRED',
  'TERMINATED',
  'ARCHIVED',
] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

export const EMPLOYMENT_STATUS_TRANSITIONS: Record<EmploymentStatus, readonly EmploymentStatus[]> = {
  DRAFT: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'RETIRED', 'TERMINATED', 'ARCHIVED'],
  ON_LEAVE: ['ACTIVE', 'SUSPENDED', 'RESIGNED', 'RETIRED', 'TERMINATED'],
  SUSPENDED: ['ACTIVE', 'RESIGNED', 'RETIRED', 'TERMINATED'],
  RESIGNED: ['ARCHIVED'],
  RETIRED: ['ARCHIVED'],
  TERMINATED: ['ARCHIVED'],
  ARCHIVED: [],
};

export const PROFILE_STATUSES = ['DRAFT', 'INCOMPLETE', 'SUBMITTED', 'VERIFIED'] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

export const ASSIGNMENT_TYPES = ['PRIMARY', 'ADDITIONAL', 'ACTING'] as const;
export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

export const DOCUMENT_CATEGORIES = [
  'CONTRACT',
  'IDENTIFICATION',
  'QUALIFICATION',
  'CV',
  'APPOINTMENT_LETTER',
  'OTHER',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const SENSITIVITY_LEVELS = ['INTERNAL', 'CONFIDENTIAL', 'HIGHLY_RESTRICTED'] as const;
export type SensitivityLevel = (typeof SENSITIVITY_LEVELS)[number];

export const RETENTION_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type RetentionStatus = (typeof RETENTION_STATUSES)[number];

export const CHANGE_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];

export const CHANGE_REQUEST_FIELDS = [
  'firstName',
  'middleName',
  'lastName',
  'contactEmail',
  'dateOfBirth',
  'nationalId',
  'gender',
] as const;
export type ChangeRequestField = (typeof CHANGE_REQUEST_FIELDS)[number];

export const NOTIFICATION_PRIORITIES = ['NORMAL', 'HIGH'] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'] as const;
export type Gender = (typeof GENDERS)[number];

export const STAFF_NUMBER_PATTERN = /^UMU-\d{4,6}$/;
export const STAFF_NUMBER_HINT = 'Format: UMU- followed by 4-6 digits (e.g. UMU-0001)';

export function isValidStaffNumber(value: string): boolean {
  return STAFF_NUMBER_PATTERN.test(value);
}

export function isTransitionAllowed(from: EmploymentStatus, to: EmploymentStatus): boolean {
  return EMPLOYMENT_STATUS_TRANSITIONS[from].includes(to);
}

export const LEAVE_REQUEST_STATUSES = [
  'DRAFT', 'SUBMITTED', 'PENDING_HR', 'APPROVED', 'REJECTED', 'CANCELLED',
] as const;
export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number];

export const LEAVE_REQUEST_TRANSITIONS: Record<LeaveRequestStatus, readonly LeaveRequestStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['PENDING_HR', 'APPROVED', 'REJECTED', 'CANCELLED'],
  PENDING_HR: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['CANCELLED'],
  REJECTED: [],
  CANCELLED: [],
};

export function isLeaveTransitionAllowed(from: LeaveRequestStatus, to: LeaveRequestStatus): boolean {
  return LEAVE_REQUEST_TRANSITIONS[from].includes(to);
}

export const HR_REQUEST_STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type HrRequestStatus = (typeof HR_REQUEST_STATUSES)[number];

export const HR_REQUEST_CATEGORIES = [
  'GENERAL', 'IT', 'FACILITIES', 'PAYROLL', 'LEAVE_SUPPORT', 'COMPLAINT', 'OTHER',
] as const;
export type HrRequestCategory = (typeof HR_REQUEST_CATEGORIES)[number];

export const HR_REQUEST_TRANSITIONS: Record<HrRequestStatus, readonly HrRequestStatus[]> = {
  OPEN: ['ASSIGNED', 'CLOSED'],
  ASSIGNED: ['IN_PROGRESS', 'RESOLVED', 'OPEN'],
  IN_PROGRESS: ['RESOLVED', 'ASSIGNED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
};

export function isHrRequestTransitionAllowed(from: HrRequestStatus, to: HrRequestStatus): boolean {
  return HR_REQUEST_TRANSITIONS[from].includes(to);
}

export const CONTRACT_TYPES = [
  'PERMANENT', 'FIXED_TERM', 'PROBATION', 'VISITING', 'ADJUNCT', 'PROJECT',
] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const CONTRACT_STATUSES = ['DRAFT', 'ACTIVE', 'EXPIRED', 'RENEWED', 'TERMINATED'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_RENEWAL_STATUSES = ['NONE', 'DUE', 'RENEWED', 'EXPIRED'] as const;
export type ContractRenewalStatus = (typeof CONTRACT_RENEWAL_STATUSES)[number];

export const PROBATION_OUTCOMES = ['PENDING', 'CONFIRMED', 'EXTENDED', 'TERMINATED'] as const;
export type ProbationOutcome = (typeof PROBATION_OUTCOMES)[number];

export const ONBOARDING_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED'] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export const ONBOARDING_TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'] as const;
export type OnboardingTaskStatus = (typeof ONBOARDING_TASK_STATUSES)[number];

export const WORKFLOW_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED'] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const WORKFLOW_STEP_STATUSES = ['PENDING', 'ACTIVE', 'APPROVED', 'REJECTED', 'SKIPPED'] as const;
export type WorkflowStepStatus = (typeof WORKFLOW_STEP_STATUSES)[number];

export const REMINDER_TYPES = ['CONTRACT_EXPIRY', 'PROBATION_REVIEW'] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

export const DELEGATION_STATUSES = ['ACTIVE', 'EXPIRED', 'REVOKED'] as const;
export type DelegationStatus = (typeof DELEGATION_STATUSES)[number];

export const REQUISITION_STATUSES = [
  'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'CLOSED', 'CANCELLED', 'FILLED',
] as const;
export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number];

export const APPLICATION_STATUSES = [
  'SUBMITTED', 'SCREENING', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'ACCEPTED',
  'DECLINED', 'REJECTED', 'WITHDRAWN', 'ARCHIVED',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  SUBMITTED: ['SCREENING', 'SHORTLISTED', 'REJECTED', 'WITHDRAWN'],
  SCREENING: ['SHORTLISTED', 'REJECTED', 'WITHDRAWN'],
  SHORTLISTED: ['INTERVIEW', 'OFFERED', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW: ['OFFERED', 'REJECTED', 'WITHDRAWN'],
  OFFERED: ['ACCEPTED', 'DECLINED', 'REJECTED', 'WITHDRAWN'],
  ACCEPTED: ['ARCHIVED'],
  DECLINED: ['ARCHIVED'],
  REJECTED: ['ARCHIVED'],
  WITHDRAWN: ['ARCHIVED'],
  ARCHIVED: [],
};

export function isApplicationTransitionAllowed(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return APPLICATION_TRANSITIONS[from].includes(to);
}

export const PANEL_ROLES = ['CHAIR', 'MEMBER'] as const;
export type PanelRole = (typeof PANEL_ROLES)[number];

export const SCORECARD_RECOMMENDATIONS = ['STRONG_YES', 'YES', 'NEUTRAL', 'NO', 'STRONG_NO'] as const;
export type ScorecardRecommendation = (typeof SCORECARD_RECOMMENDATIONS)[number];

export const APPRAISAL_CYCLE_STATUSES = ['DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED'] as const;
export type AppraisalCycleStatus = (typeof APPRAISAL_CYCLE_STATUSES)[number];

export const APPRAISAL_TEMPLATE_TYPES = ['ACADEMIC', 'NON_ACADEMIC'] as const;
export type AppraisalTemplateType = (typeof APPRAISAL_TEMPLATE_TYPES)[number];

export const APPRAISAL_STATUSES = [
  'DRAFT', 'SELF_REVIEW', 'SUPERVISOR_REVIEW', 'HOD_REVIEW', 'HR_VALIDATION', 'FINALIZED', 'ARCHIVED',
] as const;
export type AppraisalStatus = (typeof APPRAISAL_STATUSES)[number];

export const APPRAISAL_TRANSITIONS: Record<AppraisalStatus, readonly AppraisalStatus[]> = {
  DRAFT: ['SELF_REVIEW'],
  SELF_REVIEW: ['SUPERVISOR_REVIEW'],
  SUPERVISOR_REVIEW: ['HOD_REVIEW'],
  HOD_REVIEW: ['HR_VALIDATION'],
  HR_VALIDATION: ['FINALIZED'],
  FINALIZED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function isAppraisalTransitionAllowed(from: AppraisalStatus, to: AppraisalStatus): boolean {
  return APPRAISAL_TRANSITIONS[from].includes(to);
}

export const TRAINING_COURSE_CATEGORIES = [
  'TECHNICAL', 'PEDAGOGICAL', 'MANAGEMENT', 'COMPLIANCE', 'LANGUAGE', 'OTHER',
] as const;
export type TrainingCourseCategory = (typeof TRAINING_COURSE_CATEGORIES)[number];

export const TRAINING_REQUEST_STATUSES = [
  'REQUESTED', 'RECOMMENDED', 'APPROVED', 'REJECTED', 'REGISTERED', 'COMPLETED', 'CANCELLED',
] as const;
export type TrainingRequestStatus = (typeof TRAINING_REQUEST_STATUSES)[number];

export const TRAINING_REQUEST_TRANSITIONS: Record<TrainingRequestStatus, readonly TrainingRequestStatus[]> = {
  REQUESTED: ['RECOMMENDED', 'APPROVED', 'REJECTED', 'CANCELLED'],
  RECOMMENDED: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['REGISTERED', 'CANCELLED'],
  REJECTED: [],
  REGISTERED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function isTrainingTransitionAllowed(from: TrainingRequestStatus, to: TrainingRequestStatus): boolean {
  return TRAINING_REQUEST_TRANSITIONS[from].includes(to);
}

export const CAREER_CASE_TYPES = ['PROMOTION', 'TRANSFER', 'ACTING_APPOINTMENT'] as const;
export type CareerCaseType = (typeof CAREER_CASE_TYPES)[number];

export const CAREER_CASE_STATUSES = [
  'NOMINATED', 'ELIGIBILITY_CHECK', 'DOCUMENT_VERIFICATION', 'COMMITTEE_REVIEW',
  'RECOMMENDED', 'APPROVED', 'REJECTED', 'EFFECTIVE', 'CANCELLED',
] as const;
export type CareerCaseStatus = (typeof CAREER_CASE_STATUSES)[number];

export const CAREER_CASE_TRANSITIONS: Record<CareerCaseStatus, readonly CareerCaseStatus[]> = {
  NOMINATED: ['ELIGIBILITY_CHECK', 'CANCELLED'],
  ELIGIBILITY_CHECK: ['DOCUMENT_VERIFICATION', 'REJECTED', 'CANCELLED'],
  DOCUMENT_VERIFICATION: ['COMMITTEE_REVIEW', 'REJECTED', 'CANCELLED'],
  COMMITTEE_REVIEW: ['RECOMMENDED', 'REJECTED'],
  RECOMMENDED: ['APPROVED', 'REJECTED'],
  APPROVED: ['EFFECTIVE', 'CANCELLED'],
  REJECTED: [],
  EFFECTIVE: [],
  CANCELLED: [],
};

export function isCareerTransitionAllowed(from: CareerCaseStatus, to: CareerCaseStatus): boolean {
  return CAREER_CASE_TRANSITIONS[from].includes(to);
}
