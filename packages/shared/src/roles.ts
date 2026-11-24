import type { PermissionKey } from './permissions.js';
import type { ScopeType } from './enums.js';

export interface RoleDefinition {
  key: string;
  name: string;
  description: string;
  defaultScope: ScopeType;
  permissions: readonly PermissionKey[];
}

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
    ],
  },
  {
    key: 'SUPERVISOR',
    name: 'Supervisor / Line Manager',
    description: 'Direct-report records and approvals. No sensitive fields by default.',
    defaultScope: 'TEAM',
    permissions: ['employee.view', 'org.view', 'leave.view', 'leave.approve', 'leave.reject', 'request.view', 'onboarding.view'],
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
    ],
  },
];

export function findRoleDefinition(key: string): RoleDefinition | undefined {
  return ROLE_CATALOGUE.find((r) => r.key === key);
}