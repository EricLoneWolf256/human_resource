import { PERMISSIONS, ROLE_CATALOGUE } from '@umu-hr/shared';
import { config } from '../src/config.js';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';

const FOUNDATION = new Date('2020-01-01T00:00:00.000Z');

interface EmployeeSeed {
  staffNumber: string;
  firstName: string;
  lastName: string;
  contactEmail: string;
  employmentType: 'PERMANENT' | 'FIXED_TERM';
  unitCode: string;
  positionCode: string;
  supervisorStaffNumber?: string;
}

async function ensureUnit(code: string, name: string, type: 'UNIVERSITY' | 'FACULTY' | 'DEPARTMENT', parentId: string | null) {
  return prisma.orgUnit.upsert({
    where: { code },
    update: { name, type, parentId, status: 'ACTIVE' },
    create: { code, name, type, parentId, effectiveFrom: FOUNDATION },
  });
}

async function ensureEmployee(input: EmployeeSeed) {
  const unit = await prisma.orgUnit.findUniqueOrThrow({ where: { code: input.unitCode } });
  const position = await prisma.position.findUniqueOrThrow({ where: { code: input.positionCode } });
  const supervisor = input.supervisorStaffNumber
    ? await prisma.employee.findUnique({ where: { staffNumber: input.supervisorStaffNumber } })
    : null;

  const employee = await prisma.employee.upsert({
    where: { staffNumber: input.staffNumber },
    update: {
      firstName: input.firstName,
      lastName: input.lastName,
      contactEmail: input.contactEmail,
      employmentType: input.employmentType,
      employmentStatus: 'ACTIVE',
      profileStatus: 'VERIFIED',
      hireDate: FOUNDATION,
    },
    create: {
      staffNumber: input.staffNumber,
      firstName: input.firstName,
      lastName: input.lastName,
      contactEmail: input.contactEmail,
      employmentType: input.employmentType,
      employmentStatus: 'ACTIVE',
      profileStatus: 'VERIFIED',
      hireDate: FOUNDATION,
      phone: '+265 999 000 100',
      gender: 'UNDISCLOSED',
      statusHistory: {
        create: {
          fromStatus: null,
          toStatus: 'ACTIVE',
          effectiveDate: FOUNDATION,
          reason: 'Demo seed data',
        },
      },
    },
  });

  const count = await prisma.employeeAssignment.count({ where: { employeeId: employee.id } });
  if (count === 0) {
    await prisma.employeeAssignment.create({
      data: {
        employeeId: employee.id,
        unitId: unit.id,
        positionId: position.id,
        supervisorEmployeeId: supervisor?.id ?? null,
        startDate: FOUNDATION,
        assignmentType: 'PRIMARY',
      },
    });
  }
  return employee;
}

async function ensureUser(
  email: string,
  employeeId: string | null,
  grants: { roleKey: string; scopeType: 'OWN' | 'DEPARTMENT' | 'FACULTY' | 'INSTITUTION'; scopeUnitId?: string | null }[],
  password: string,
) {
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      status: 'ACTIVE',
      employeeId,
      mustChangePassword: false,
      passwordHash: await hashPassword(password),
    },
    create: { email, employeeId, passwordHash: await hashPassword(password), status: 'ACTIVE' },
  });

  for (const grant of grants) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: grant.roleKey } });
    const existing = await prisma.roleAssignment.findFirst({
      where: {
        userId: user.id,
        roleId: role.id,
        scopeType: grant.scopeType,
        scopeUnitId: grant.scopeUnitId ?? null,
        revokedAt: null,
      },
    });
    if (!existing) {
      await prisma.roleAssignment.create({
        data: {
          userId: user.id,
          roleId: role.id,
          scopeType: grant.scopeType,
          scopeUnitId: grant.scopeUnitId ?? null,
          startDate: FOUNDATION,
          reason: 'Demo seed data',
        },
      });
    }
  }
  return user;
}

async function main() {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { description: permission.description, module: permission.module },
      create: { key: permission.key, description: permission.description, module: permission.module },
    });
  }

  for (const role of ROLE_CATALOGUE) {
    const stored = await prisma.role.upsert({
      where: { key: role.key },
      update: { name: role.name, description: role.description, isSystem: true },
      create: { key: role.key, name: role.name, description: role.description, isSystem: true },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: stored.id } });
    await prisma.rolePermission.createMany({
      data: role.permissions.map((permissionKey) => ({ roleId: stored.id, permissionKey })),
    });
  }

  const university = await ensureUnit('UMU', 'University of Malawi', 'UNIVERSITY', null);
  const science = await ensureUnit('SCI', 'Faculty of Science', 'FACULTY', university.id);
  const computerScience = await ensureUnit('CS', 'Department of Computer Science', 'DEPARTMENT', science.id);
  await ensureUnit('MATH', 'Department of Mathematics', 'DEPARTMENT', science.id);
  const arts = await ensureUnit('ARTS', 'Faculty of Arts', 'FACULTY', university.id);
  const history = await ensureUnit('HIST', 'Department of History', 'DEPARTMENT', arts.id);

  for (const position of [
    { code: 'LECTURER', title: 'Lecturer', unitId: computerScience.id },
    { code: 'HOD-CS', title: 'Head of Department', unitId: computerScience.id },
    { code: 'HR-OFFICER', title: 'HR Officer', unitId: university.id },
    { code: ' HIST-LECT', title: 'Lecturer', unitId: history.id },
  ]) {
    await prisma.position.upsert({
      where: { code: position.code.trim() },
      update: { title: position.title, unitId: position.unitId, status: 'ACTIVE' },
      create: { code: position.code.trim(), title: position.title, unitId: position.unitId, approvedHeadcount: 2 },
    });
  }

  const admin = await ensureEmployee({
    staffNumber: 'UMU-0001', firstName: 'Chikondi', lastName: 'Banda',
    contactEmail: 'admin@umu.ac.mw', employmentType: 'PERMANENT', unitCode: 'UMU', positionCode: 'HR-OFFICER',
  });
  const hr = await ensureEmployee({
    staffNumber: 'UMU-0002', firstName: 'Zikomo', lastName: 'Phiri',
    contactEmail: 'hr@umu.ac.mw', employmentType: 'PERMANENT', unitCode: 'UMU', positionCode: 'HR-OFFICER',
  });
  const hod = await ensureEmployee({
    staffNumber: 'UMU-0003', firstName: 'Mwiza', lastName: 'Sambo',
    contactEmail: 'hod@umu.ac.mw', employmentType: 'PERMANENT', unitCode: 'CS', positionCode: 'HOD-CS',
  });
  await ensureEmployee({
    staffNumber: 'UMU-0004', firstName: 'Tendai', lastName: 'Mwale',
    contactEmail: 'lecturer@umu.ac.mw', employmentType: 'PERMANENT', unitCode: 'CS', positionCode: 'LECTURER',
    supervisorStaffNumber: 'UMU-0003',
  });
  await ensureEmployee({
    staffNumber: 'UMU-0005', firstName: 'Lusungu', lastName: 'Kamwendo',
    contactEmail: 'history@umu.ac.mw', employmentType: 'FIXED_TERM', unitCode: 'HIST', positionCode: 'HIST-LECT',
  });
  await ensureEmployee({
    staffNumber: 'UMU-0006', firstName: 'Sekani', lastName: 'Nkhoma',
    contactEmail: 'employee@umu.ac.mw', employmentType: 'PERMANENT', unitCode: 'MATH', positionCode: 'LECTURER',
  });

  await prisma.orgUnit.update({ where: { id: computerScience.id }, data: { headEmployeeId: hod.id } });
  await prisma.orgUnit.update({ where: { id: science.id }, data: { headEmployeeId: hod.id } });

  const password = config.DEMO_SEED_PASSWORD;
  await ensureUser('admin@umu.ac.mw', admin.id, [{ roleKey: 'SUPER_ADMIN', scopeType: 'INSTITUTION' }], password);
  await ensureUser('hr@umu.ac.mw', hr.id, [{ roleKey: 'HR_MANAGER', scopeType: 'INSTITUTION' }], password);
  await ensureUser('hod@umu.ac.mw', hod.id, [
    { roleKey: 'HOD', scopeType: 'DEPARTMENT', scopeUnitId: computerScience.id },
  ], password);
  await ensureUser('employee@umu.ac.mw', (await prisma.employee.findUniqueOrThrow({ where: { staffNumber: 'UMU-0006' } })).id, [
    { roleKey: 'EMPLOYEE', scopeType: 'OWN' },
  ], password);

  console.log('Demo seed complete.');
  console.log(`Accounts: admin@umu.ac.mw, hr@umu.ac.mw, hod@umu.ac.mw, employee@umu.ac.mw`);
  console.log(`Password: ${password}`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
