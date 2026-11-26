import { PERMISSIONS, ROLE_CATALOGUE, type ScopeType } from '@umu-hr/shared';
import { config } from '../src/config.js';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';

const FOUNDATION = new Date('2020-01-01T00:00:00.000Z');

function addUtcDays(base: Date, days: number): Date {
  const date = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

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
  grants: { roleKey: string; scopeType: ScopeType; scopeUnitId?: string | null }[],
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

interface ReminderSeed {
  type: 'CONTRACT_EXPIRY' | 'PROBATION_REVIEW';
  entityType: string;
  entityId: string;
  recipientUserId: string;
  dueDate: Date;
  message: string;
}

async function ensureHrRequestEvent(requestId: string, actorUserId: string, action: string, comment: string) {
  const existing = await prisma.hrRequestEvent.findFirst({ where: { requestId, action, comment } });
  if (!existing) {
    await prisma.hrRequestEvent.create({
      data: { requestId, actorUserId, action, comment },
    });
  }
}

async function ensureReminder(input: ReminderSeed) {
  const existing = await prisma.reminder.findFirst({
    where: {
      type: input.type,
      entityType: input.entityType,
      entityId: input.entityId,
      recipientUserId: input.recipientUserId,
    },
  });
  if (existing) {
    await prisma.reminder.update({
      where: { id: existing.id },
      data: { dueDate: input.dueDate, message: input.message, status: 'PENDING' },
    });
    return;
  }
  await prisma.reminder.create({ data: input });
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
      data: [...new Set(role.permissions)].map((permissionKey) => ({ roleId: stored.id, permissionKey })),
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
  const lecturer = await ensureEmployee({
    staffNumber: 'UMU-0004', firstName: 'Tendai', lastName: 'Mwale',
    contactEmail: 'lecturer@umu.ac.mw', employmentType: 'PERMANENT', unitCode: 'CS', positionCode: 'LECTURER',
    supervisorStaffNumber: 'UMU-0003',
  });
  const fixedTermEmployee = await ensureEmployee({
    staffNumber: 'UMU-0005', firstName: 'Lusungu', lastName: 'Kamwendo',
    contactEmail: 'history@umu.ac.mw', employmentType: 'FIXED_TERM', unitCode: 'HIST', positionCode: 'HIST-LECT',
  });
  const probationEmployee = await ensureEmployee({
    staffNumber: 'UMU-0006', firstName: 'Sekani', lastName: 'Nkhoma',
    contactEmail: 'employee@umu.ac.mw', employmentType: 'PERMANENT', unitCode: 'MATH', positionCode: 'LECTURER',
  });

  await prisma.orgUnit.update({ where: { id: computerScience.id }, data: { headEmployeeId: hod.id } });
  await prisma.orgUnit.update({ where: { id: science.id }, data: { headEmployeeId: hod.id } });

  const password = config.DEMO_SEED_PASSWORD;
  const adminUser = await ensureUser('admin@umu.ac.mw', admin.id, [{ roleKey: 'SUPER_ADMIN', scopeType: 'INSTITUTION' }], password);
  const hrUser = await ensureUser('hr@umu.ac.mw', hr.id, [{ roleKey: 'HR_MANAGER', scopeType: 'INSTITUTION' }], password);
  const hodUser = await ensureUser('hod@umu.ac.mw', hod.id, [
    { roleKey: 'HOD', scopeType: 'DEPARTMENT', scopeUnitId: computerScience.id },
  ], password);
  const employeeUser = await ensureUser('employee@umu.ac.mw', probationEmployee.id, [
    { roleKey: 'EMPLOYEE', scopeType: 'OWN' },
  ], password);

  const now = new Date();
  const plusDays = (days: number): Date => addUtcDays(now, days);
  const period = String(now.getUTCFullYear());

  const annualLeaveType = await prisma.leaveType.upsert({
    where: { code: 'ANNUAL' },
    update: {
      name: 'Annual Leave',
      description: 'Annual leave entitlement for the current year',
      requiresReason: true,
      requiresEvidence: false,
      requiresHrReview: false,
      isActive: true,
    },
    create: {
      code: 'ANNUAL',
      name: 'Annual Leave',
      description: 'Annual leave entitlement for the current year',
      requiresReason: true,
      requiresEvidence: false,
      requiresHrReview: false,
      isActive: true,
    },
  });

  await prisma.leavePolicy.upsert({
    where: { leaveTypeId_period: { leaveTypeId: annualLeaveType.id, period } },
    update: {
      entitlementDays: 21,
      carryoverCapDays: 5,
      maxConsecutiveDays: 21,
      minNoticeDays: 7,
      allowNegativeBalance: false,
    },
    create: {
      leaveTypeId: annualLeaveType.id,
      period,
      entitlementDays: 21,
      carryoverCapDays: 5,
      maxConsecutiveDays: 21,
      minNoticeDays: 7,
      allowNegativeBalance: false,
    },
  });

  const seededEmployees = [admin, hr, hod, lecturer, fixedTermEmployee, probationEmployee];
  for (const employee of seededEmployees) {
    const isLeaveRequester = employee.staffNumber === 'UMU-0006';
    await prisma.leaveBalance.upsert({
      where: { employeeId_leaveTypeId_period: { employeeId: employee.id, leaveTypeId: annualLeaveType.id, period } },
      update: {
        entitlementDays: 21,
        carryoverDays: 0,
        usedDays: isLeaveRequester ? 3 : 0,
        adjustmentDays: isLeaveRequester ? -3 : 0,
      },
      create: {
        employeeId: employee.id,
        leaveTypeId: annualLeaveType.id,
        period,
        entitlementDays: 21,
        carryoverDays: 0,
        usedDays: isLeaveRequester ? 3 : 0,
        adjustmentDays: isLeaveRequester ? -3 : 0,
      },
    });
  }

  const annualBalance = await prisma.leaveBalance.findUniqueOrThrow({
    where: { employeeId_leaveTypeId_period: { employeeId: probationEmployee.id, leaveTypeId: annualLeaveType.id, period } },
  });

  const leaveReason = 'Demo annual leave request with supervisor workflow';
  const leaveRequestData = {
    period,
    requestedById: employeeUser.id,
    startDate: plusDays(14),
    endDate: plusDays(16),
    daysRequested: 3,
    reason: leaveReason,
    isHalfDay: false,
    status: 'SUBMITTED' as const,
    submittedAt: now,
  };
  let leaveRequest = await prisma.leaveRequest.findFirst({
    where: { employeeId: probationEmployee.id, leaveTypeId: annualLeaveType.id, period, reason: leaveReason },
  });
  if (leaveRequest) {
    leaveRequest = await prisma.leaveRequest.update({ where: { id: leaveRequest.id }, data: leaveRequestData });
  } else {
    leaveRequest = await prisma.leaveRequest.create({
      data: {
        ...leaveRequestData,
        employeeId: probationEmployee.id,
        leaveTypeId: annualLeaveType.id,
      },
    });
  }

  const workflowInstance = await prisma.workflowInstance.upsert({
    where: { entityType_entityId: { entityType: 'LEAVE_REQUEST', entityId: leaveRequest.id } },
    update: {
      status: 'IN_PROGRESS',
      currentStep: 1,
      startedAt: now,
      completedAt: null,
      canceledAt: null,
    },
    create: {
      entityType: 'LEAVE_REQUEST',
      entityId: leaveRequest.id,
      status: 'IN_PROGRESS',
      currentStep: 1,
      startedAt: now,
    },
  });
  await prisma.leaveRequest.update({
    where: { id: leaveRequest.id },
    data: { workflowInstanceId: workflowInstance.id },
  });

  const workflowSteps = [
    {
      stepOrder: 1,
      name: 'SUPERVISOR',
      approverRoleKey: 'HOD',
      approverUserId: hodUser.id,
      scopeType: 'DEPARTMENT' as const,
      scopeUnitId: computerScience.id,
      status: 'ACTIVE' as const,
      dueAt: plusDays(17),
    },
    {
      stepOrder: 2,
      name: 'HR_OFFICER',
      approverRoleKey: 'HR_MANAGER',
      approverUserId: hrUser.id,
      scopeType: 'INSTITUTION' as const,
      scopeUnitId: null,
      status: 'PENDING' as const,
      dueAt: plusDays(21),
    },
  ];
  for (const step of workflowSteps) {
    const stepData = {
      name: step.name,
      approverRoleKey: step.approverRoleKey,
      approverUserId: step.approverUserId,
      scopeType: step.scopeType,
      scopeUnitId: step.scopeUnitId,
      status: step.status,
      decision: null,
      comment: null,
      actorUserId: null,
      actedAt: null,
      dueAt: step.dueAt,
    };
    await prisma.workflowStep.upsert({
      where: { instanceId_stepOrder: { instanceId: workflowInstance.id, stepOrder: step.stepOrder } },
      update: stepData,
      create: {
        ...stepData,
        instanceId: workflowInstance.id,
        stepOrder: step.stepOrder,
      },
    });
  }

  const adjustmentReason = 'Demo deduction for submitted annual leave';
  const existingAdjustment = await prisma.leaveBalanceAdjustment.findFirst({
    where: { balanceId: annualBalance.id, reason: adjustmentReason, createdById: adminUser.id },
  });
  if (!existingAdjustment) {
    await prisma.leaveBalanceAdjustment.create({
      data: {
        balanceId: annualBalance.id,
        delta: -3,
        reason: adjustmentReason,
        createdById: adminUser.id,
      },
    });
  }

  const generalRequest = await prisma.hrRequest.upsert({
    where: { reference: 'HR-REQ-DEMO-001' },
    update: {
      requesterEmployeeId: probationEmployee.id,
      requestedForEmployeeId: null,
      category: 'GENERAL',
      subject: 'Demo HR general enquiry',
      description: 'Demo general HR enquiry used to show request assignment and event history.',
      sensitivity: 'INTERNAL',
      status: 'ASSIGNED',
      assignedToUserId: hrUser.id,
      dueAt: plusDays(7),
    },
    create: {
      reference: 'HR-REQ-DEMO-001',
      requesterEmployeeId: probationEmployee.id,
      requestedForEmployeeId: null,
      category: 'GENERAL',
      subject: 'Demo HR general enquiry',
      description: 'Demo general HR enquiry used to show request assignment and event history.',
      sensitivity: 'INTERNAL',
      status: 'ASSIGNED',
      assignedToUserId: hrUser.id,
      dueAt: plusDays(7),
    },
  });
  await ensureHrRequestEvent(generalRequest.id, employeeUser.id, 'CREATED', 'Submitted via demo seed');
  await ensureHrRequestEvent(generalRequest.id, hrUser.id, 'ASSIGNED', 'Assigned to HR via demo seed');

  const complaintRequest = await prisma.hrRequest.upsert({
    where: { reference: 'HR-REQ-DEMO-002' },
    update: {
      requesterEmployeeId: probationEmployee.id,
      requestedForEmployeeId: probationEmployee.id,
      category: 'COMPLAINT',
      subject: 'Demo restricted workplace complaint',
      description: 'Demo highly restricted complaint used to show confidential HR handling.',
      sensitivity: 'HIGHLY_RESTRICTED',
      status: 'IN_PROGRESS',
      assignedToUserId: hrUser.id,
      dueAt: plusDays(3),
    },
    create: {
      reference: 'HR-REQ-DEMO-002',
      requesterEmployeeId: probationEmployee.id,
      requestedForEmployeeId: probationEmployee.id,
      category: 'COMPLAINT',
      subject: 'Demo restricted workplace complaint',
      description: 'Demo highly restricted complaint used to show confidential HR handling.',
      sensitivity: 'HIGHLY_RESTRICTED',
      status: 'IN_PROGRESS',
      assignedToUserId: hrUser.id,
      dueAt: plusDays(3),
    },
  });
  await ensureHrRequestEvent(complaintRequest.id, employeeUser.id, 'CREATED', 'Submitted via demo seed');
  await ensureHrRequestEvent(complaintRequest.id, hrUser.id, 'ASSIGNED', 'Assigned to HR via demo seed');
  await ensureHrRequestEvent(complaintRequest.id, hrUser.id, 'REVIEW_STARTED', 'Restricted complaint under HR review');

  const contractEndDate = plusDays(45);
  const contractData = {
    employeeId: fixedTermEmployee.id,
    type: 'FIXED_TERM' as const,
    status: 'ACTIVE' as const,
    renewalStatus: 'DUE' as const,
    startDate: FOUNDATION,
    endDate: contractEndDate,
    notes: 'Demo fixed-term contract nearing renewal',
    createdById: adminUser.id,
  };
  const existingContract = await prisma.contract.findFirst({
    where: { employeeId: fixedTermEmployee.id, type: 'FIXED_TERM', status: 'ACTIVE' },
  });
  const fixedTermContract = existingContract
    ? await prisma.contract.update({ where: { id: existingContract.id }, data: contractData })
    : await prisma.contract.create({ data: contractData });

  const probationReviewDate = plusDays(14);
  const probationData = {
    employeeId: probationEmployee.id,
    startDate: plusDays(-76),
    endDate: plusDays(90),
    reviewDate: probationReviewDate,
    outcome: 'PENDING' as const,
    notes: 'Demo probation record with upcoming review',
    reviewedById: null,
    reviewedAt: null,
  };
  const existingProbation = await prisma.probationRecord.findFirst({
    where: { employeeId: probationEmployee.id, outcome: 'PENDING' },
  });
  const probationRecord = existingProbation
    ? await prisma.probationRecord.update({ where: { id: existingProbation.id }, data: probationData })
    : await prisma.probationRecord.create({ data: probationData });

  const onboardingTemplate = await prisma.onboardingTemplate.upsert({
    where: { code: 'STAFF-ONBOARD' },
    update: {
      name: 'Staff Onboarding',
      description: 'Demo onboarding template for newly engaged staff',
      isActive: true,
    },
    create: {
      code: 'STAFF-ONBOARD',
      name: 'Staff Onboarding',
      description: 'Demo onboarding template for newly engaged staff',
      isActive: true,
    },
  });

  const templateTaskSeeds = [
    {
      title: 'Complete university orientation',
      description: 'Attend the university orientation programme.',
      ownerRoleKey: 'EMPLOYEE',
      dueOffsetDays: 0,
      isRequired: true,
      sortOrder: 0,
    },
    {
      title: 'Submit required documentation',
      description: 'Submit identification and qualification documents to HR.',
      ownerRoleKey: 'HR_MANAGER',
      dueOffsetDays: 7,
      isRequired: true,
      sortOrder: 1,
    },
  ];
  const templateTaskRecords: {
    id: string;
    title: string;
    description: string;
    ownerRoleKey: string;
    dueOffsetDays: number;
    sortOrder: number;
  }[] = [];
  for (const task of templateTaskSeeds) {
    const existingTemplateTask = await prisma.onboardingTemplateTask.findFirst({
      where: { templateId: onboardingTemplate.id, title: task.title },
    });
    const templateTask = existingTemplateTask
      ? await prisma.onboardingTemplateTask.update({
          where: { id: existingTemplateTask.id },
          data: {
            description: task.description,
            ownerRoleKey: task.ownerRoleKey,
            dueOffsetDays: task.dueOffsetDays,
            isRequired: task.isRequired,
            sortOrder: task.sortOrder,
          },
        })
      : await prisma.onboardingTemplateTask.create({
          data: { ...task, templateId: onboardingTemplate.id },
        });
    templateTaskRecords.push({
      id: templateTask.id,
      title: templateTask.title,
      description: templateTask.description ?? task.description,
      ownerRoleKey: templateTask.ownerRoleKey,
      dueOffsetDays: templateTask.dueOffsetDays,
      sortOrder: templateTask.sortOrder,
    });
  }

  const checklistData = {
    employeeId: probationEmployee.id,
    templateId: onboardingTemplate.id,
    status: 'IN_PROGRESS' as const,
    dueDate: plusDays(30),
    startedAt: now,
    completedAt: null,
  };
  const existingChecklist = await prisma.onboardingChecklist.findFirst({
    where: { employeeId: probationEmployee.id, templateId: onboardingTemplate.id },
  });
  const onboardingChecklist = existingChecklist
    ? await prisma.onboardingChecklist.update({ where: { id: existingChecklist.id }, data: checklistData })
    : await prisma.onboardingChecklist.create({ data: checklistData });

  for (const [index, task] of templateTaskRecords.entries()) {
    const isCompleted = index === 0;
    const taskData = {
      checklistId: onboardingChecklist.id,
      templateTaskId: task.id,
      title: task.title,
      description: task.description,
      ownerUserId: task.ownerRoleKey === 'EMPLOYEE' ? employeeUser.id : hrUser.id,
      dueDate: plusDays(task.dueOffsetDays),
      status: isCompleted ? ('COMPLETED' as const) : ('PENDING' as const),
      comment: isCompleted ? 'Completed via demo seed' : null,
      completedAt: isCompleted ? now : null,
      completedById: isCompleted ? employeeUser.id : null,
      sortOrder: task.sortOrder,
    };
    const existingTask = await prisma.onboardingTask.findFirst({
      where: { checklistId: onboardingChecklist.id, templateTaskId: task.id },
    });
    if (existingTask) {
      await prisma.onboardingTask.update({ where: { id: existingTask.id }, data: taskData });
    } else {
      await prisma.onboardingTask.create({ data: taskData });
    }
  }

  const delegationData = {
    grantorUserId: adminUser.id,
    delegateUserId: hrUser.id,
    permissionKey: 'leave.view',
    scopeType: 'INSTITUTION' as const,
    scopeUnitId: null,
    startDate: plusDays(0),
    endDate: plusDays(365),
    reason: 'Demo delegation for leave approval coverage',
    status: 'ACTIVE' as const,
    revokedAt: null,
    revokedById: null,
  };
  const existingDelegation = await prisma.delegation.findFirst({
    where: {
      grantorUserId: adminUser.id,
      delegateUserId: hrUser.id,
      permissionKey: 'leave.view',
      status: 'ACTIVE',
      revokedAt: null,
    },
  });
  if (existingDelegation) {
    await prisma.delegation.update({ where: { id: existingDelegation.id }, data: delegationData });
  } else {
    await prisma.delegation.create({ data: delegationData });
  }

  await ensureReminder({
    type: 'CONTRACT_EXPIRY',
    entityType: 'CONTRACT',
    entityId: fixedTermContract.id,
    recipientUserId: hrUser.id,
    dueDate: contractEndDate,
    message: 'Demo reminder: fixed-term contract expires in 45 days',
  });
  await ensureReminder({
    type: 'CONTRACT_EXPIRY',
    entityType: 'CONTRACT',
    entityId: fixedTermContract.id,
    recipientUserId: adminUser.id,
    dueDate: contractEndDate,
    message: 'Demo reminder: fixed-term contract expires in 45 days',
  });
  await ensureReminder({
    type: 'PROBATION_REVIEW',
    entityType: 'PROBATION_RECORD',
    entityId: probationRecord.id,
    recipientUserId: hrUser.id,
    dueDate: probationReviewDate,
    message: 'Demo reminder: probation review is due in 14 days',
  });
  await ensureReminder({
    type: 'PROBATION_REVIEW',
    entityType: 'PROBATION_RECORD',
    entityId: probationRecord.id,
    recipientUserId: hodUser.id,
    dueDate: probationReviewDate,
    message: 'Demo reminder: probation review is due in 14 days',
  });

  const panelUser = await ensureUser('panel@umu.ac.mw', lecturer.id, [
    { roleKey: 'RECRUITMENT_PANEL_MEMBER', scopeType: 'ASSIGNED' },
  ], password);

  const lecturerPosition = await prisma.position.findFirstOrThrow({
    where: { unitId: computerScience.id, title: 'Lecturer' },
  });
  const closingDate = plusDays(45);
  const vacancy = await prisma.vacancy.upsert({
    where: { code: 'PHASE3-LECT' },
    update: {
      title: 'Lecturer (recruitment demo)',
      description: 'Demo vacancy for the Phase 3 recruitment-to-onboarding workflow.',
      requirements: 'Postgraduate qualification and teaching experience.',
      unitId: computerScience.id,
      positionId: lecturerPosition.id,
      employmentType: 'PERMANENT',
      openings: 1,
      closingDate,
      status: 'PUBLISHED',
      publishedAt: now,
      approvedById: adminUser.id,
      createdById: adminUser.id,
    },
    create: {
      code: 'PHASE3-LECT',
      title: 'Lecturer (recruitment demo)',
      description: 'Demo vacancy for the Phase 3 recruitment-to-onboarding workflow.',
      requirements: 'Postgraduate qualification and teaching experience.',
      unitId: computerScience.id,
      positionId: lecturerPosition.id,
      employmentType: 'PERMANENT',
      openings: 1,
      closingDate,
      status: 'PUBLISHED',
      publishedAt: now,
      approvedById: adminUser.id,
      createdById: adminUser.id,
    },
  });

  await prisma.panelAssignment.upsert({
    where: { vacancyId_userId: { vacancyId: vacancy.id, userId: panelUser.id } },
    update: { role: 'CHAIR' },
    create: { vacancyId: vacancy.id, userId: panelUser.id, role: 'CHAIR', createdById: adminUser.id },
  });

  const applicantEmail = 'candidate.demo@example.com';
  let applicant = await prisma.applicant.findFirst({ where: { email: applicantEmail } });
  if (!applicant) {
    applicant = await prisma.applicant.create({
      data: {
        firstName: 'Candidate',
        lastName: 'Demo',
        email: applicantEmail,
        phone: '+265 888 000 001',
        coverNote: 'Interested in the lecturer position.',
        qualifications: 'PhD in Computer Science',
      },
    });
  }

  let application = await prisma.application.findFirst({ where: { reference: 'APP-DEMO-0001' } });
  if (!application) {
    application = await prisma.application.create({
      data: {
        reference: 'APP-DEMO-0001',
        vacancyId: vacancy.id,
        applicantId: applicant.id,
        status: 'SHORTLISTED',
        submittedAt: plusDays(-10),
        screeningNote: 'Meets the minimum requirements.',
        events: {
          create: [
            { action: 'SUBMITTED', createdAt: plusDays(-10) },
            { action: 'STATUS_CHANGED', note: 'Moved to screening', actorUserId: hrUser.id, createdAt: plusDays(-8) },
            { action: 'STATUS_CHANGED', note: 'Shortlisted', actorUserId: hrUser.id, createdAt: plusDays(-5) },
          ],
        },
      },
    });
  }

  const interviewCount = await prisma.interview.count({ where: { applicationId: application.id } });
  if (interviewCount === 0) {
    const panelAssignment = await prisma.panelAssignment.findFirstOrThrow({ where: { vacancyId: vacancy.id } });
    await prisma.interview.create({
      data: {
        applicationId: application.id,
        panelAssignmentId: panelAssignment.id,
        scheduledAt: plusDays(5),
        location: 'Room A101',
        note: 'Teaching demonstration and panel interview',
        createdById: hrUser.id,
      },
    });
  }

  const scorecardCount = await prisma.scorecard.count({ where: { applicationId: application.id } });
  if (scorecardCount === 0) {
    const panelAssignment = await prisma.panelAssignment.findFirstOrThrow({ where: { vacancyId: vacancy.id } });
    await prisma.scorecard.create({
      data: {
        applicationId: application.id,
        panelAssignmentId: panelAssignment.id,
        criteria: [
          { name: 'Teaching experience', score: 4, comment: 'Strong track record' },
          { name: 'Research potential', score: 4, comment: 'Good publication record' },
        ],
        recommendation: 'YES',
        strengths: 'Clear communication and relevant experience.',
        concerns: 'None',
      },
    });
  }

  const appraisalCycle = await prisma.appraisalCycle.upsert({
    where: { code: 'PHASE3-2026' },
    update: {
      name: 'Phase 3 demo appraisal cycle',
      templateType: 'ACADEMIC',
      startDate: plusDays(-30),
      endDate: plusDays(60),
      status: 'OPEN',
    },
    create: {
      code: 'PHASE3-2026',
      name: 'Phase 3 demo appraisal cycle',
      templateType: 'ACADEMIC',
      startDate: plusDays(-30),
      endDate: plusDays(60),
      status: 'OPEN',
      createdById: hrUser.id,
    },
  });

  let appraisal = await prisma.appraisal.findFirst({
    where: { cycleId: appraisalCycle.id, employeeId: lecturer.id },
  });
  if (!appraisal) {
    appraisal = await prisma.appraisal.create({
      data: {
        cycleId: appraisalCycle.id,
        employeeId: lecturer.id,
        supervisorUserId: hodUser.id,
        hodUserId: hodUser.id,
        hrUserId: hrUser.id,
        templateType: 'ACADEMIC',
        status: 'SELF_REVIEW',
        selfRating: 4,
        selfComment: 'Delivered all teaching and research targets for the period.',
        developmentPlan: 'Attend an advanced research methods workshop.',
        submittedAt: plusDays(-3),
        objectives: {
          create: [
            { title: 'Teaching quality', target: 'Maintain student evaluation above 4.0', weight: 60, selfRating: 4 },
            { title: 'Research output', target: 'Submit two journal articles', weight: 40, selfRating: 4 },
          ],
        },
      },
    });
  }

  const trainingCourse = await prisma.trainingCourse.upsert({
    where: { code: 'PHASE3-TEACH' },
    update: {
      title: 'Effective university teaching',
      description: 'Demo course for the training workflow.',
      category: 'PEDAGOGICAL',
      provider: 'Centre for Teaching and Learning',
      durationHours: 16,
      isActive: true,
    },
    create: {
      code: 'PHASE3-TEACH',
      title: 'Effective university teaching',
      description: 'Demo course for the training workflow.',
      category: 'PEDAGOGICAL',
      provider: 'Centre for Teaching and Learning',
      durationHours: 16,
      isActive: true,
    },
  });

  let trainingRequest = await prisma.trainingRequest.findFirst({ where: { reference: 'TRN-DEMO-0001' } });
  if (!trainingRequest) {
    trainingRequest = await prisma.trainingRequest.create({
      data: {
        reference: 'TRN-DEMO-0001',
        employeeId: probationEmployee.id,
        courseId: trainingCourse.id,
        reason: 'Required for the new teaching assignment.',
        neededBy: plusDays(60),
        status: 'RECOMMENDED',
        supervisorComment: 'Recommended by the department.',
        decidedById: hodUser.id,
        decidedAt: plusDays(-2),
      },
    });
  }

  const historyPosition = await prisma.position.findFirstOrThrow({ where: { unitId: history.id, title: 'Lecturer' } });
  let careerCase = await prisma.careerCase.findFirst({ where: { reference: 'CAR-DEMO-0001' } });
  if (!careerCase) {
    careerCase = await prisma.careerCase.create({
      data: {
        reference: 'CAR-DEMO-0001',
        employeeId: lecturer.id,
        type: 'TRANSFER',
        status: 'NOMINATED',
        currentUnitId: computerScience.id,
        currentPositionId: lecturerPosition.id,
        proposedUnitId: history.id,
        proposedPositionId: historyPosition.id,
        effectiveDate: plusDays(75),
        reason: 'Demonstration transfer case for the Phase 3 career workflow.',
        events: {
          create: {
            actorUserId: hrUser.id,
            action: 'NOMINATED',
            note: 'Demonstration transfer case for the Phase 3 career workflow.',
          },
        },
      },
    });
  }

  console.log('Demo seed complete.');
  console.log(`Accounts: admin@umu.ac.mw, hr@umu.ac.mw, hod@umu.ac.mw, employee@umu.ac.mw, panel@umu.ac.mw`);
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
