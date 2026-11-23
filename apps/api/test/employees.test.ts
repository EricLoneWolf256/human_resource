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

test('duplicate staff number is rejected', async () => {
  const token = await login(app, 'admin@umu.ac.mw');
  const response = await request(app)
    .post('/api/employees')
    .set(bearer(token))
    .send({
      staffNumber: 'UMU-0001',
      firstName: 'Duplicate',
      lastName: 'Record',
      employmentType: 'PERMANENT',
    });

  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'CONFLICT');
});

test('effective-dated assignments preserve history', async () => {
  const token = await login(app, 'admin@umu.ac.mw');
  const created = await request(app)
    .post(`/api/employees/${baseline.staffAId}/assignments`)
    .set(bearer(token))
    .send({
      unitId: baseline.deptBId,
      startDate: '2025-01-01',
      assignmentType: 'PRIMARY',
    });

  assert.equal(created.status, 201);

  const response = await request(app).get(`/api/employees/${baseline.staffAId}`).set(bearer(token));
  assert.equal(response.status, 200);
  const assignments = response.body.assignments as { unitId: string; startDate: string; endDate: string | null }[];
  assert.equal(assignments.length, 2);

  const oldPrimary = assignments.find((assignment) => assignment.unitId === baseline.deptAId);
  const newPrimary = assignments.find((assignment) => assignment.unitId === baseline.deptBId);
  assert.ok(oldPrimary);
  assert.ok(newPrimary);
  assert.equal(oldPrimary?.endDate?.slice(0, 10), '2024-12-31');
  assert.equal(newPrimary?.startDate.slice(0, 10), '2025-01-01');
});

test('invalid employment status transitions are rejected', async () => {
  const token = await login(app, 'admin@umu.ac.mw');
  const response = await request(app)
    .post(`/api/employees/${baseline.staffAId}/status`)
    .set(bearer(token))
    .send({ toStatus: 'DRAFT', effectiveDate: '2026-01-01', reason: 'Test invalid transition' });

  assert.equal(response.status, 422);
  assert.equal(response.body.error.code, 'INVALID_TRANSITION');
});
