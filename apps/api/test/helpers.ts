import './setup.js';
import { PERMISSIONS, ROLE_CATALOGUE } from '@umu-hr/shared';
import type { Express } from 'express';
import request from 'supertest';
import { hashPassword } from '../src/auth/password.js';
import { prisma } from '../src/db.js';

export const DEMO_PASSWORD = 'Demo#Pass123';
const FOUNDATION = new Date('2020-01-01T00:00:00.000Z');

const TABLES = [
  'AuditEvent', 'Notification', 'Document', 'EmployeeChangeRequest', 'EmployeeStatusHistory',
  'EmployeeAssignment', 'EmergencyContact', 'Qualification', 'Position', 'OrgUnit',
  'RoleAssignment', 'RolePermission', 'Permission', 'Role', 'Session', 'LoginAttempt', 'Employee', 'User',
];

export async function cleanDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of TABLES) {
    await prisma.$executeRawUnsafe(`DELETE FROM \`${table}\``);
  }
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
}

export interface Baseline {
  adminUserId: string;
  hodUserId: string;
  employeeUserId: string;
  staffAId: string;
  staffBId: string;
  hodEmployeeId: string;
  deptAId: string;
  deptBId: string;
  roleIds: Record<string, string>;
}

export async function seedBaseline(): Promise<Baseline> {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: {},
      create: { key: permission.key, description: permission.description, module: permission.module },
    });
  }

  const roleIds: Record<string, string> = {};
  for (const role of ROLE_CATALOGUE) {
    const stored = await prisma.role.upsert({
      where: { key: role.key },
      update: {},
      create: { key: role.key, name: role.name, description: role.description },
    });
    roleIds[role.key] = stored.id;
    await prisma.rolePermission.deleteMany({ where: { roleId: stored.id } });
    await prisma.rolePermission.createMany({
      data: role.permissions.map((permissionKey) => ({ roleId: stored.id, permissionKey })),
    });
  }

  const university = await prisma.orgUnit.create({
    data: { code: 'UNIV', name: 'University', type: 'UNIVERSITY', effectiveFrom: FOUNDATION },
  });
  const faculty = await prisma.orgUnit.create({
    data: { code: 'FAC', name: 'Faculty', type: 'FACULTY', parentId: university.id, effectiveFrom: FOUNDATION },
  });
  const deptA = await prisma.orgUnit.create({
    data: { code: 'DEPT-A', name: 'Department A', type: 'DEPARTMENT', parentId: faculty.id, effectiveFrom: FOUNDATION },
  });
  const deptB = await prisma.orgUnit.create({
    data: { code: 'DEPT-B', name: 'Department B', type: 'DEPARTMENT', parentId: faculty.id, effectiveFrom: FOUNDATION },
  });
  const position = await prisma.position.create({
    data: { code: 'LECT', title: 'Lecturer', unitId: deptA.id, approvedHeadcount: 5 },
  });

  async function employee(staffNumber: string, firstName: string, lastName: string, unitId: string) {
    return prisma.employee.create({
      data: {
        staffNumber,
        firstName,
        lastName,
        contactEmail: `${staffNumber.toLowerCase()}@umu.ac.mw`,
        employmentType: 'PERMANENT',
        employmentStatus: 'ACTIVE',
        profileStatus: 'VERIFIED',
        hireDate: FOUNDATION,
        phone: '+265 999 000 000',
        gender: 'UNDISCLOSED',
        statusHistory: {
          create: { fromStatus: null, toStatus: 'ACTIVE', effectiveDate: FOUNDATION, reason: 'Test baseline' },
        },
        assignments: {
          create: {
            unitId,
            positionId: position.id,
            startDate: FOUNDATION,
            assignmentType: 'PRIMARY',
          },
        },
      },
    });
  }

  const adminEmployee = await employee('UMU-0001', 'Admin', 'User', university.id);
  const hodEmployee = await employee('UMU-0002', 'Head', 'Department', deptA.id);
  const staffA = await employee('UMU-0003', 'Alpha', 'Staff', deptA.id);
  const staffB = await employee('UMU-0004', 'Beta', 'Staff', deptB.id);
  const plainEmployee = await employee('UMU-0005', 'Plain', 'Employee', deptB.id);

  await prisma.orgUnit.update({ where: { id: deptA.id }, data: { headEmployeeId: hodEmployee.id } });

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const adminUser = await prisma.user.create({
    data: { email: 'admin@umu.ac.mw', passwordHash, employeeId: adminEmployee.id },
  });
  const hodUser = await prisma.user.create({
    data: { email: 'hod@umu.ac.mw', passwordHash, employeeId: hodEmployee.id },
  });
  const employeeUser = await prisma.user.create({
    data: { email: 'employee@umu.ac.mw', passwordHash, employeeId: plainEmployee.id },
  });

  await prisma.roleAssignment.create({
    data: {
      userId: adminUser.id,
      roleId: roleIds.SUPER_ADMIN!,
      scopeType: 'INSTITUTION',
      startDate: FOUNDATION,
      reason: 'Test baseline',
    },
  });
  await prisma.roleAssignment.create({
    data: {
      userId: hodUser.id,
      roleId: roleIds.HOD!,
      scopeType: 'DEPARTMENT',
      scopeUnitId: deptA.id,
      startDate: FOUNDATION,
      reason: 'Test baseline',
    },
  });
  await prisma.roleAssignment.create({
    data: {
      userId: employeeUser.id,
      roleId: roleIds.EMPLOYEE!,
      scopeType: 'OWN',
      startDate: FOUNDATION,
      reason: 'Test baseline',
    },
  });

  return {
    adminUserId: adminUser.id,
    hodUserId: hodUser.id,
    employeeUserId: employeeUser.id,
    staffAId: staffA.id,
    staffBId: staffB.id,
    hodEmployeeId: hodEmployee.id,
    deptAId: deptA.id,
    deptBId: deptB.id,
    roleIds,
  };
}

export async function login(app: Express, email: string, password = DEMO_PASSWORD): Promise<string> {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  if (response.status !== 200) {
    throw new Error(`Login failed for ${email}: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.accessToken as string;
}

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
