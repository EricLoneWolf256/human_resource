import type { PermissionKey } from './permissions.js';
import type { ScopeType } from './enums.js';

export interface RoleDefinition {
  key: string;
  name: string;
  description: string;
  defaultScope: ScopeType;
  permissions: readonly PermissionKey[];
}

const PHASE3_HR_OPERATIONS: readonly PermissionKey[] = [
  'recruitment.view', 'recruitment.create', 'recruitment.manage', 'recruitment.approve',
  'vacancy.publish', 'panel.manage', 'interview.manage', 'candidate.view', 'candidate.score', 'candidate.export',
  'appraisal.view', 'appraisal.create', 'appraisal.review', 'appraisal.finalize',
  'training.view', 'training.manage', 'training.approve',
  'career.view', 'career.submit', 'promotion.review', 'promotion.approve',
];

const PHASE3_HR_OFFICER: readonly PermissionKey[] = [
  'recruitment.view', 'recruitment.create', 'recruitment.manage',
  'vacancy.publish', 'panel.manage', 'interview.manage', 'candidate.view', 'candidate.export',
  'appraisal.view', 'appraisal.create', 'appraisal.review',
  'training.view', 'training.manage', 'career.view', 'promotion.review',
];

const PHASE3_HR_READ: readonly PermissionKey[] = [
  'recruitment.view', 'candidate.view', 'appraisal.view', 'training.view', 'career.view',
];

const PHASE3_MANAGER: readonly PermissionKey[] = [
  'appraisal.view', 'appraisal.review', 'training.view', 'career.view', 'promotion.review',
];

const PHASE3_SELF_SERVICE: readonly PermissionKey[] = [
  'appraisal.view', 'training.view', 'career.view', 'career.submit',
];

export const ROLE_CATALOGUE: readonly RoleDefinition[] = [
  {
    key: 'SUPER_ADMIN',
    name: 'Super Administrator',
    description: 'Controlled emergency/administrative authority. All actions are audited.',
    defaultScope: 'INSTITUTION',
    permissions: [
      'employee.view', 'employee.create', 'employee.update', 'employee.archive', 'employee.verify',
      'employee.assign_unit', 'employee.assign_supervisor', 'employee.view_sensitive', 'employee.export',
      'document.view', 'document.upload', 'document.verify', 'document.download', 'document.delete',
      'org.view', 'org.manage', 'user.manage', 'role.manage', 'permission.manage', 'access.delegate',
      'report.view', 'report.export', 'audit.view',
      'leave.submit', 'leave.view', 'leave.approve', 'leave.reject', 'leave.adjust_balance', 'leave.manage',
      'request.submit', 'request.view', 'request.assign', 'request.manage', 'request.close', 'request.feedback',
      'complaint.view_assigned', 'complaint.assign', 'complaint.investigate', 'complaint.close',
      'contract.view', 'contract.manage', 'probation.view', 'probation.manage',
      'onboarding.view', 'onboarding.manage', 'reminder.view',
      ...PHASE3_HR_OPERATIONS,
    ],
  },
  {
    key: 'SYSTEM_ADMIN',
    name: 'System Administrator',
    description: 'Technical configuration and account operations. No HR-content access by default.',
    defaultScope: 'INSTITUTION',
    permissions: ['user.manage'],
  },
  {
    key: 'SECURITY_ADMIN',
    name: 'Security & Access Administrator',
    description: 'Manages roles, scopes, access reviews and security audit.',
    defaultScope: 'INSTITUTION',
    permissions: ['user.manage', 'role.manage', 'permission.manage', 'access.delegate', 'audit.view'],
  },
  {
    key: 'HR_DIRECTOR',
    name: 'HR Director',
    description: 'Institution-wide HR oversight and authorized operations.',
    defaultScope: 'INSTITUTION',
    permissions: [
      'employee.view', 'employee.create', 'employee.update', 'employee.archive', 'employee.verify',
      'employee.assign_unit', 'employee.assign_supervisor', 'employee.view_sensitive', 'employee.export',
      'document.view', 'document.upload', 'document.verify', 'document.download', 'document.delete',
      'org.view', 'org.manage', 'report.view', 'report.export', 'audit.view',
      'leave.view', 'leave.approve', 'leave.reject', 'leave.adjust_balance', 'leave.manage',
      'request.view', 'request.assign', 'request.manage', 'request.close',
      'complaint.view_assigned', 'complaint.assign', 'complaint.investigate', 'complaint.close',
      'contract.view', 'contract.manage', 'probation.view', 'probation.manage',
      'onboarding.view', 'onboarding.manage', 'reminder.view',
      ...PHASE3_HR_OPERATIONS,
    ],
  },
  {
    key: 'HR_MANAGER',
    name: 'HR Manager',
    description: 'HR operations management across the institution.',
    defaultScope: 'INSTITUTION',
    permissions: [
      'employee.view', 'employee.create', 'employee.update', 'employee.verify',
      'employee.assign_unit', 'employee.assign_supervisor', 'employee.view_sensitive', 'employee.export',
      'document.view', 'document.upload', 'document.verify', 'document.download',
      'org.view', 'report.view', 'report.export',
      'leave.view', 'leave.approve', 'leave.reject', 'leave.adjust_balance', 'leave.manage',
      'request.view', 'request.assign', 'request.manage', 'request.close',
      'complaint.view_assigned', 'complaint.assign', 'complaint.investigate', 'complaint.close',
      'contract.view', 'contract.manage', 'probation.view', 'probation.manage',
      'onboarding.view', 'onboarding.manage', 'reminder.view',
      ...PHASE3_HR_OPERATIONS,
    ],
  },
  {
    key: 'HR_OFFICER',
    name: 'HR Officer',
    description: 'HR transactions, records and document processing within assigned scope.',
    defaultScope: 'INSTITUTION',
    permissions: [
      'employee.view', 'employee.create', 'employee.update',
      'employee.assign_unit', 'employee.assign_supervisor',
      'document.view', 'document.upload', 'document.download',
      'org.view', 'report.view',
      'leave.view', 'leave.approve', 'leave.reject', 'leave.adjust_balance', 'leave.manage',
      'request.view', 'request.assign', 'request.manage', 'request.close',
      'complaint.view_assigned', 'complaint.assign', 'complaint.investigate', 'complaint.close',
      'contract.view', 'contract.manage', 'probation.view', 'probation.manage',
      'onboarding.view', 'onboarding.manage', 'reminder.view',
      ...PHASE3_HR_OFFICER,
    ],
  },
  {
    key: 'FACULTY_HR_ADMIN',
    name: 'Faculty HR Administrator',
    description: 'HR administration within an assigned faculty.',
    defaultScope: 'FACULTY',
    permissions: [
      'employee.view', 'employee.create', 'employee.update',
      'employee.assign_unit', 'employee.assign_supervisor',
      'document.view', 'document.upload', 'document.download',
      'org.view', 'report.view',
      'leave.view', 'leave.approve', 'leave.reject', 'leave.adjust_balance', 'leave.manage',
      'request.view', 'request.assign', 'request.manage', 'request.close',
      'complaint.view_assigned', 'complaint.assign', 'complaint.investigate', 'complaint.close',
      'contract.view', 'contract.manage', 'probation.view', 'probation.manage',
      'onboarding.view', 'onboarding.manage', 'reminder.view',
      ...PHASE3_HR_OFFICER,
    ],
  },
  {
    key: 'HR_RECORDS_OFFICER',
    name: 'HR Records Officer',
    description: 'Records maintenance, verification and document control.',
    defaultScope: 'INSTITUTION',
    permissions: [
      'employee.view', 'employee.update', 'employee.verify',
      'document.view', 'document.upload', 'document.verify', 'document.download', 'document.delete',
      'org.view', 'report.view',
      'leave.view', 'leave.adjust_balance', 'leave.manage',
      'request.view', 'request.manage',
      'contract.view', 'contract.manage', 'probation.view', 'probation.manage',
      'onboarding.view', 'onboarding.manage', 'reminder.view',
      ...PHASE3_HR_READ,
    ],
  },
  {
    key: 'DEAN',
    name: 'Dean',
    description: 'Faculty workforce summaries and delegated approvals within faculty scope.',
    defaultScope: 'FACULTY',
    permissions: [
      'employee.view', 'org.view', 'document.view', 'report.view',
      'leave.view', 'leave.approve', 'leave.reject',
      'request.view', 'contract.view', 'probation.view', 'onboarding.view', 'reminder.view',
      ...PHASE3_MANAGER,
    ],
  },
  {
    key: 'HOD',
    name: 'Department Head',
    description: 'Department staff view and approvals within department scope.',
    defaultScope: 'DEPARTMENT',
    permissions: [
      'employee.view', 'org.view', 'document.view', 'report.view',
      'leave.view', 'leave.approve', 'leave.reject',
      'request.view', 'contract.view', 'probation.view', 'onboarding.view', 'reminder.view',
      ...PHASE3_MANAGER,
    ],
  },
  {
    key: 'SUPERVISOR',
    name: 'Supervisor / Line Manager',
    description: 'Direct-report records and approvals. No sensitive fields by default.',
    defaultScope: 'TEAM',
    permissions: [
      'employee.view', 'org.view', 'leave.view', 'leave.approve', 'leave.reject', 'request.view', 'onboarding.view',
      ...PHASE3_MANAGER,
    ],
  },
  {
    key: 'INTERNAL_AUDITOR',
    name: 'Internal Auditor',
    description: 'Read-only audit and report review within approved scope.',
    defaultScope: 'INSTITUTION',
    permissions: ['audit.view', 'report.view'],
  },
  {
    key: 'EMPLOYEE',
    name: 'Employee',
    description: 'Own-record self-service. No access to other employees private data.',
    defaultScope: 'OWN',
    permissions: [
      'document.view', 'document.upload', 'document.download',
      'leave.submit', 'leave.view', 'request.submit', 'request.view', 'request.feedback',
      'contract.view', 'probation.view', 'onboarding.view',
      ...PHASE3_SELF_SERVICE,
    ],
  },
  {
    key: 'RECRUITMENT_OFFICER',
    name: 'Recruitment Officer',
    description: 'Runs requisitions, publication, screening and offers within assigned scope.',
    defaultScope: 'INSTITUTION',
    permissions: [
      ...PHASE3_HR_OFFICER, 'recruitment.approve', 'appraisal.view', 'training.view', 'career.view',
    ],
  },
  {
    key: 'RECRUITMENT_PANEL_MEMBER',
    name: 'Recruitment Panel Member',
    description: 'Scores only candidates on vacancies to which the member is explicitly assigned.',
    defaultScope: 'ASSIGNED',
    permissions: ['candidate.view', 'candidate.score'],
  },
  {
    key: 'TRAINING_OFFICER',
    name: 'Training & Development Officer',
    description: 'Maintains the training catalogue, requests, records and skills register.',
    defaultScope: 'INSTITUTION',
    permissions: ['employee.view', ...PHASE3_HR_OFFICER, 'training.approve'],
  },
  {
    key: 'PERFORMANCE_OFFICER',
    name: 'Performance Management Officer',
    description: 'Coordinates appraisal cycles and validates completed appraisals.',
    defaultScope: 'INSTITUTION',
    permissions: ['employee.view', 'appraisal.view', 'appraisal.create', 'appraisal.review', 'appraisal.finalize'],
  },
  {
    key: 'CAREER_OFFICER',
    name: 'Career & Promotion Officer',
    description: 'Reviews promotion, transfer and acting appointment cases.',
    defaultScope: 'INSTITUTION',
    permissions: ['employee.view', 'career.view', 'promotion.review', 'promotion.approve'],
  },
];

export function findRoleDefinition(key: string): RoleDefinition | undefined {
  return ROLE_CATALOGUE.find((r) => r.key === key);
}