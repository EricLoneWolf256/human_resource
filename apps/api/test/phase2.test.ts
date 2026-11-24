import './setup.js';
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { addDays, toDateOnly, today } from '../src/dates.js';
import { prisma } from '../src/db.js';
import { DEMO_PASSWORD, bearer, cleanDatabase, login, seedBaseline, type Baseline } from './helpers.js';

const app = createApp();
const foundation = new Date('2020-01-01T00:00:00.000Z');
let baseline: Baseline;

beforeEach(async () => {
  await cleanDatabase();
  baseline = await seedBaseline();
});

after(async () => {
  await prisma.$disconnect();
});

function futureWeekday(offset: number): string {
  let date = addDays(today(), offset);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date = addDays(date, 1);
  }
  return toDateOnly(date);
}

async function createUser(email: string, employeeId: string | null, withEmployeeRole = false): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(DEMO_PASSWORD),
      employeeId,
    },
  });
  if (withEmployeeRole) {
    await prisma.roleAssignment.create({
      data: {
        userId: user.id,
        roleId: baseline.roleIds.EMPLOYEE!,
        scopeType: 'OWN',
        startDate: foundation,
        reason: 'Phase 2 test baseline',
      },
    });
  }
  return user.id;
}

test('leave request is submitted, approved and reflected in the balance', async () => {
  const adminToken = await login(app, 'admin@umu.ac.mw');
  const date = futureWeekday(7);
  const submitted = await request(app)
    .post('/api/leave/requests')
    .set(bearer(adminToken))
    .send({
      employeeId: baseline.staffAId,
      leaveTypeId: baseline.leaveTypeId,
      startDate: date,
      endDate: date,
      reason: 'Annual leave',
    });

  assert.equal(submitted.status, 201);
  assert.equal(submitted.body.status, 'SUBMITTED');
  assert.equal(submitted.body.daysRequested, 1);
  assert.equal(submitted.body.steps.length, 1);
  assert.equal(submitted.body.steps[0].status, 'ACTIVE');
  assert.ok(submitted.body.steps[0].approverName);

  const hodToken = await login(app, 'hod@umu.ac.mw');
  const approved = await request(app)
    .post(`/api/leave/requests/${submitted.body.id}/decision`)
    .set(bearer(hodToken))
    .send({ action: 'APPROVE', comment: 'Approved' });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.status, 'APPROVED');
  assert.equal(approved.body.steps[0].status, 'APPROVED');

  const balance = await prisma.leaveBalance.findUnique({
    where: {
      employeeId_leaveTypeId_period: {
        employeeId: baseline.staffAId,
        leaveTypeId: baseline.leaveTypeId,
        period: date.slice(0, 4),
      },
    },
  });
  assert.equal(balance?.usedDays, 1);

  const audit = await prisma.auditEvent.findMany({ where: { entityType: 'LeaveRequest' } });
  assert.ok(audit.some((event) => event.action === 'leave.submitted'));
  assert.ok(audit.some((event) => event.action === 'leave.approve'));

  const overlap = await request(app)
    .post('/api/leave/requests')
    .set(bearer(adminToken))
    .send({
      employeeId: baseline.staffAId,
      leaveTypeId: baseline.leaveTypeId,
      startDate: date,
      endDate: date,
      reason: 'Overlapping leave',
    });
  assert.equal(overlap.status, 409);
});

test('an employee cannot approve leave for their own employee record', async () => {
  const adminToken = await login(app, 'admin@umu.ac.mw');
  const date = futureWeekday(8);
  const submitted = await request(app)
    .post('/api/leave/requests')
    .set(bearer(adminToken))
    .send({
      employeeId: baseline.hodEmployeeId,
      leaveTypeId: baseline.leaveTypeId,
      startDate: date,
      endDate: date,
      reason: 'Personal leave',
    });
  assert.equal(submitted.status, 201);

  const hodToken = await login(app, 'hod@umu.ac.mw');
  const decision = await request(app)
    .post(`/api/leave/requests/${submitted.body.id}/decision`)
    .set(bearer(hodToken))
    .send({ action: 'APPROVE', comment: 'Self approval attempt' });
  assert.equal(decision.status, 403);
});

test('restricted complaints are hidden from unauthorized employees', async () => {
  const employeeToken = await login(app, 'employee@umu.ac.mw');
  const created = await request(app)
    .post('/api/requests')
    .set(bearer(employeeToken))
    .send({
      category: 'COMPLAINT',
      subject: 'Confidential concern',
      description: 'A private workplace complaint that must remain restricted.',
    });
  assert.equal(created.status, 201);
  assert.equal(created.body.sensitivity, 'HIGHLY_RESTRICTED');

  await createUser('other@umu.ac.mw', baseline.staffBId, true);
  const otherToken = await login(app, 'other@umu.ac.mw');
  const denied = await request(app)
    .get(`/api/requests/${created.body.id}`)
    .set(bearer(otherToken));
  assert.equal(denied.status, 403);

  const adminToken = await login(app, 'admin@umu.ac.mw');
  const visible = await request(app)
    .get(`/api/requests/${created.body.id}`)
    .set(bearer(adminToken));
  assert.equal(visible.status, 200);
  assert.equal(visible.body.description, created.body.description);
});

test('contract reminders are generated for upcoming expiries', async () => {
  const adminToken = await login(app, 'admin@umu.ac.mw');
  const contract = await request(app)
    .post('/api/contracts')
    .set(bearer(adminToken))
    .send({
      employeeId: baseline.staffBId,
      type: 'FIXED_TERM',
      startDate: toDateOnly(today()),
      endDate: toDateOnly(addDays(today(), 20)),
      status: 'ACTIVE',
    });
  assert.equal(contract.status, 201);

  const scan = await request(app)
    .post('/api/reminders/scan')
    .set(bearer(adminToken))
    .send({ type: 'CONTRACT_EXPIRY', daysAhead: 30 });
  assert.equal(scan.status, 200);
  assert.ok(scan.body.created >= 1);

  const reminders = await request(app).get('/api/reminders').set(bearer(adminToken));
  assert.equal(reminders.status, 200);
  assert.ok(reminders.body.items.some((item: { type: string }) => item.type === 'CONTRACT_EXPIRY'));
});

test('expired delegations do not grant access', async () => {
  const adminToken = await login(app, 'admin@umu.ac.mw');
  const delegateUserId = await createUser('delegate@umu.ac.mw', null);
  const delegation = await request(app)
    .post('/api/delegations')
    .set(bearer(adminToken))
    .send({
      delegateUserId,
      permissionKey: 'contract.view',
      scopeType: 'INSTITUTION',
      startDate: toDateOnly(addDays(today(), -5)),
      endDate: toDateOnly(addDays(today(), -1)),
      reason: 'Expired temporary access',
    });
  assert.equal(delegation.status, 201);

  const delegateToken = await login(app, 'delegate@umu.ac.mw');
  const contracts = await request(app).get('/api/contracts').set(bearer(delegateToken));
  assert.equal(contracts.status, 403);
});

test('onboarding checklists create tasks and record task completion', async () => {
  const adminToken = await login(app, 'admin@umu.ac.mw');
  const created = await request(app)
    .post('/api/onboarding/checklists')
    .set(bearer(adminToken))
    .send({
      employeeId: baseline.staffAId,
      templateId: baseline.onboardingTemplateId,
      dueDate: toDateOnly(addDays(today(), 14)),
    });
  assert.equal(created.status, 201);
  assert.equal(created.body.tasks.length, 2);

  const updated = await request(app)
    .patch(`/api/onboarding/tasks/${created.body.tasks[0].id}`)
    .set(bearer(adminToken))
    .send({ status: 'COMPLETED', comment: 'Completed in test' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.status, 'COMPLETED');

  const audit = await prisma.auditEvent.findFirst({ where: { action: 'onboarding.task_updated' } });
  assert.ok(audit);
});

test('dashboard exposes Phase 2 operation metrics', async () => {
  const adminToken = await login(app, 'admin@umu.ac.mw');
  const response = await request(app).get('/api/dashboard').set(bearer(adminToken));
  assert.equal(response.status, 200);
  assert.ok(response.body.phase2);
  assert.equal(typeof response.body.phase2.pendingLeaveApprovals, 'number');
  assert.equal(typeof response.body.phase2.openHrRequests, 'number');
});
