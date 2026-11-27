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

test('reports honour institutional and departmental scope', async () => {
  const adminToken = await login(app, 'admin@umu.ac.mw');
  const institutional = await request(app).get('/api/reports').set(bearer(adminToken));

  assert.equal(institutional.status, 200);
  assert.equal(institutional.body.workforce.total, 5);
  assert.equal(institutional.body.period.scopeLabel, 'Institution');
  assert.ok(institutional.body.period.generatedAt);
  assert.ok(institutional.body.operations);
  assert.ok(institutional.body.governance);
  assert.equal(institutional.body.governance.activeRoleAssignments, 4);
  assert.equal(institutional.body.governance.expiringRoleAssignments30Days, 0);
  assert.equal(typeof institutional.body.governance.auditEvents, 'number');

  const futureRange = await request(app)
    .get('/api/reports?from=2030-01-01&to=2030-12-31')
    .set(bearer(adminToken));

  assert.equal(futureRange.status, 200);
  assert.equal(futureRange.body.workforce.hires, 0);
  assert.equal(futureRange.body.operations.applicationsReceived, 0);

  const hodToken = await login(app, 'hod@umu.ac.mw');
  const departmental = await request(app).get('/api/reports').set(bearer(hodToken));

  assert.equal(departmental.status, 200);
  assert.equal(departmental.body.workforce.total, 2);
  assert.equal(departmental.body.period.scopeLabel, 'DEPARTMENT: Department A');

  const outsideUnit = await request(app)
    .get(`/api/reports?unitId=${baseline.deptBId}`)
    .set(bearer(hodToken));

  assert.equal(outsideUnit.status, 200);
  assert.equal(outsideUnit.body.workforce.total, 0);

  const employeeToken = await login(app, 'employee@umu.ac.mw');
  const denied = await request(app).get('/api/reports').set(bearer(employeeToken));
  assert.equal(denied.status, 403);
});

test('report export requires export permission and is audited with its parameters', async () => {
  const hodToken = await login(app, 'hod@umu.ac.mw');
  const denied = await request(app).get('/api/reports/export').set(bearer(hodToken));
  assert.equal(denied.status, 403);

  const adminToken = await login(app, 'admin@umu.ac.mw');
  const exported = await request(app)
    .get(`/api/reports/export?from=2020-01-01&to=2030-12-31&unitId=${baseline.deptAId}`)
    .set(bearer(adminToken));

  assert.equal(exported.status, 200);
  assert.match(exported.headers['content-type'] ?? '', /text\/csv/);
  assert.match(exported.text, /Generated at:/);
  assert.match(exported.text, /from="2020-01-01"; to="2030-12-31"; unit="Department A"; scope="Institution"/);
  assert.match(exported.text, /section,metric,value/);

  const audit = await prisma.auditEvent.findFirst({ where: { action: 'report.exported' } });
  assert.ok(audit);
  assert.equal(audit?.actorUserId, baseline.adminUserId);
  assert.equal(audit?.entityType, 'Report');
  const after = audit?.after as { rowCount?: number; unitId?: string };
  assert.ok((after.rowCount ?? 0) > 0);
  assert.equal(after.unitId, baseline.deptAId);

  const unsafeUnit = await prisma.orgUnit.create({
    data: {
      code: 'CSV-INJECT',
      name: '=HYPERLINK("bad")',
      type: 'OFFICE',
      effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
    },
  });
  const escaped = await request(app)
    .get(`/api/reports/export?unitId=${unsafeUnit.id}`)
    .set(bearer(adminToken));

  assert.equal(escaped.status, 200);
  assert.match(escaped.text, /'=HYPERLINK/);
});

test('deactivated accounts lose sessions and audit events cannot be altered through the API', async () => {
  const adminToken = await login(app, 'admin@umu.ac.mw');
  const reset = await request(app)
    .post(`/api/access/users/${baseline.employeeUserId}/reset-password`)
    .set(bearer(adminToken))
    .send({ newPassword: 'Temp#Pass123' });

  assert.equal(reset.status, 200);

  const temporaryToken = await login(app, 'employee@umu.ac.mw', 'Temp#Pass123');
  const blocked = await request(app).get('/api/dashboard').set(bearer(temporaryToken));

  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error.code, 'PASSWORD_CHANGE_REQUIRED');

  const me = await request(app).get('/api/auth/me').set(bearer(temporaryToken));
  assert.equal(me.status, 200);

  const changed = await request(app)
    .post('/api/auth/change-password')
    .set(bearer(temporaryToken))
    .send({ currentPassword: 'Temp#Pass123', newPassword: 'Demo#Pass123' });

  assert.equal(changed.status, 200);

  const employeeToken = await login(app, 'employee@umu.ac.mw');
  const deactivate = await request(app)
    .patch(`/api/access/users/${baseline.employeeUserId}/status`)
    .set(bearer(adminToken))
    .send({ status: 'DEACTIVATED', reason: 'Phase 4 deactivation check' });

  assert.equal(deactivate.status, 200);

  const revokedSession = await request(app).get('/api/dashboard').set(bearer(employeeToken));
  assert.equal(revokedSession.status, 401);

  const newLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'employee@umu.ac.mw', password: 'Demo#Pass123' });

  assert.equal(newLogin.status, 401);
  assert.equal(newLogin.body.error.code, 'ACCOUNT_DEACTIVATED');

  for (const method of ['post', 'patch', 'delete'] as const) {
    const tamper = await request(app)[method]('/api/audit').set(bearer(adminToken)).send({});
    assert.equal(tamper.status, 404);
  }

  const employees = await request(app).get('/api/employees').set(bearer(adminToken));
  assert.equal(employees.status, 200);
  assert.ok(!JSON.stringify(employees.body).includes('nationalId'));
  assert.ok(!JSON.stringify(employees.body).includes('dateOfBirth'));
});
