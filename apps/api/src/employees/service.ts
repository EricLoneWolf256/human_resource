import type { Prisma } from '@prisma/client';
import type {
  EmployeeDetail,
  EmployeeListItem,
  EmploymentStatus,
  ProfileStatus,
} from '@umu-hr/shared';
import { prisma } from '../db.js';
import { isCurrent } from '../dates.js';
import { fullName } from '../mappers.js';
import { notFound } from '../errors.js';

const employeeInclude = {
  assignments: {
    include: {
      unit: { select: { id: true, name: true } },
      position: { select: { id: true, title: true } },
      supervisor: { select: { firstName: true, lastName: true } },
    },
    orderBy: { startDate: 'desc' },
  },
  statusHistory: {
    include: { changedBy: { select: { email: true } } },
    orderBy: { effectiveDate: 'desc' },
  },
  emergencyContacts: true,
  qualifications: true,
} satisfies Prisma.EmployeeInclude;

export type EmployeeWithRelations = Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>;

const REQUIRED_PROFILE_FIELDS = [
  'firstName',
  'lastName',
  'contactEmail',
  'phone',
  'dateOfBirth',
  'nationalId',
  'gender',
  'hireDate',
  'primaryAssignment',
] as const;

export function currentUnitIds(employee: {
  assignments: { startDate: Date; endDate: Date | null; unitId: string }[];
}): string[] {
  return [...new Set(employee.assignments.filter((a) => isCurrent(a)).map((a) => a.unitId))];
}

export function profileCompleteness(employee: EmployeeWithRelations): {
  percent: number;
  missingFields: string[];
} {
  const missingFields: string[] = [];
  for (const field of REQUIRED_PROFILE_FIELDS) {
    if (field === 'primaryAssignment') {
      if (!employee.assignments.some((a) => a.assignmentType === 'PRIMARY' && isCurrent(a))) {
        missingFields.push(field);
      }
      continue;
    }
    const value = employee[field];
    if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
      missingFields.push(field);
    }
  }
  const percent = Math.round(
    ((REQUIRED_PROFILE_FIELDS.length - missingFields.length) / REQUIRED_PROFILE_FIELDS.length) * 100,
  );
  return { percent, missingFields };
}

export function toEmployeeListItem(employee: EmployeeWithRelations): EmployeeListItem {
  const current = employee.assignments.filter((a) => isCurrent(a));
  const primary = current.find((a) => a.assignmentType === 'PRIMARY') ?? current[0];
  return {
    id: employee.id,
    staffNumber: employee.staffNumber,
    firstName: employee.firstName,
    lastName: employee.lastName,
    preferredName: employee.preferredName,
    fullName: fullName(employee),
    employmentType: employee.employmentType,
    employmentStatus: employee.employmentStatus,
    profileStatus: employee.profileStatus,
    contactEmail: employee.contactEmail,
    hireDate: employee.hireDate?.toISOString().slice(0, 10) ?? null,
    primaryUnit: primary ? { id: primary.unit.id, name: primary.unit.name } : null,
    positionTitle: primary?.position?.title ?? null,
  };
}

export function toEmployeeDetail(employee: EmployeeWithRelations, sensitiveVisible: boolean): EmployeeDetail {
  const completeness = profileCompleteness(employee);
  return {
    ...toEmployeeListItem(employee),
    middleName: employee.middleName,
    gender: employee.gender,
    dateOfBirth: sensitiveVisible ? (employee.dateOfBirth?.toISOString().slice(0, 10) ?? null) : null,
    nationalId: sensitiveVisible ? employee.nationalId : null,
    phone: employee.phone,
    endDate: employee.endDate?.toISOString().slice(0, 10) ?? null,
    createdAt: employee.createdAt.toISOString(),
    updatedAt: employee.updatedAt.toISOString(),
    emergencyContacts: sensitiveVisible
      ? employee.emergencyContacts.map((contact) => ({
          id: contact.id,
          name: contact.name,
          relationship: contact.relationship,
          phone: contact.phone,
        }))
      : [],
    qualifications: employee.qualifications.map((qualification) => ({
      id: qualification.id,
      institution: qualification.institution,
      award: qualification.award,
      fieldOfStudy: qualification.fieldOfStudy,
      yearCompleted: qualification.yearCompleted,
      verified: qualification.verified,
    })),
    assignments: employee.assignments.map((assignment) => ({
      id: assignment.id,
      employeeId: assignment.employeeId,
      unitId: assignment.unitId,
      unitName: assignment.unit.name,
      positionId: assignment.positionId,
      positionTitle: assignment.position?.title ?? null,
      supervisorEmployeeId: assignment.supervisorEmployeeId,
      supervisorName: assignment.supervisor
        ? `${assignment.supervisor.firstName} ${assignment.supervisor.lastName}`.trim()
        : null,
      startDate: assignment.startDate.toISOString().slice(0, 10),
      endDate: assignment.endDate?.toISOString().slice(0, 10) ?? null,
      assignmentType: assignment.assignmentType,
      isActing: assignment.isActing,
      notes: assignment.notes,
      current: isCurrent(assignment),
    })),
    statusHistory: employee.statusHistory.map((entry) => ({
      id: entry.id,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      effectiveDate: entry.effectiveDate.toISOString().slice(0, 10),
      reason: entry.reason,
      changedByName: entry.changedBy?.email ?? null,
      createdAt: entry.createdAt.toISOString(),
    })),
    completeness,
    sensitiveVisible,
  };
}

export async function findEmployeeOrThrow(id: string): Promise<EmployeeWithRelations> {
  const employee = await prisma.employee.findUnique({ where: { id }, include: employeeInclude });
  if (!employee) throw notFound('Employee not found');
  return employee;
}

export function suggestedProfileStatus(current: ProfileStatus, percent: number): ProfileStatus {
  if (current === 'VERIFIED' && percent < 100) return 'INCOMPLETE';
  return percent === 100 ? 'SUBMITTED' : 'INCOMPLETE';
}

export function employmentStatusFromString(value: string): EmploymentStatus {
  return value as EmploymentStatus;
}

export { employeeInclude };
