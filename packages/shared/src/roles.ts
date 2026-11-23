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
    ],
  },
  {
    key: 'DEAN',
    name: 'Dean',
    description: 'Faculty workforce summaries and delegated approvals within faculty scope.',
    defaultScope: 'FACULTY',
    permissions: ['employee.view', 'org.view', 'document.view', 'report.view'],
  },
  {
    key: 'HOD',
    name: 'Department Head',
    description: 'Department staff view and approvals within department scope.',
    defaultScope: 'DEPARTMENT',
    permissions: ['employee.view', 'org.view', 'document.view', 'report.view'],
  },
  {
    key: 'SUPERVISOR',
    name: 'Supervisor / Line Manager',
    description: 'Direct-report records and approvals. No sensitive fields by default.',
    defaultScope: 'TEAM',
    permissions: ['employee.view', 'org.view'],
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
    permissions: [],
  },
];

export function findRoleDefinition(key: string): RoleDefinition | undefined {
  return ROLE_CATALOGUE.find((r) => r.key === key);
}