import './setup.js';
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { bearer, cleanDatabase, login, seedBaseline, type Baseline } from './helpers.js';

const app = createApp();
let baseline: Baseline;

beforeEach(async () => {
  await cleanDatabase();
  baseline = await seedBaseline();
});

after(async () => {
  await prisma.$disconnect();
});

test('admin can assign a scoped role and the change is audited', async () => {
  const adminToken = await login(app, 'admin@umu.ac.mw');
  const response = await request(app)
    .post(`/api/access/users/${baseline.employeeUserId}/roles`)
    .set(bearer(adminToken))
    .send({
      roleId: baseline.roleIds.HOD,
      scopeType: 'DEPARTMENT',
      scopeUnitId: baseline.deptBId,
      reason: 'Test department assignment',
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.scopeUnitId, baseline.deptBId);
  assert.equal(response.body.effective, true);

  const audit = await prisma.auditEvent.findFirst({ where: { action: 'role.assigned' } });
  assert.ok(audit);
  assert.equal(audit?.entityId, baseline.employeeUserId);
});

test('HOD sees only employees in the assigned department', async () => {
  const hodToken = await login(app, 'hod@umu.ac.mw');
  const response = await request(app).get('/api/employees').set(bearer(hodToken));

  assert.equal(response.status, 200);
  const ids = response.body.items.map((item: { id: string }) => item.id);
  assert.ok(ids.includes(baseline.staffAId));
  assert.ok(ids.includes(baseline.hodEmployeeId));
  assert.ok(!ids.includes(baseline.staffBId));

  const outside = await request(app).get(`/api/employees/${baseline.staffBId}`).set(bearer(hodToken));
  assert.equal(outside.status, 403);
});

test('employee without management permissions cannot list accounts', async () => {
  const token = await login(app, 'employee@umu.ac.mw');
  const response = await request(app).get('/api/access/users').set(bearer(token));
  assert.equal(response.status, 403);
});
