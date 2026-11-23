import './setup.js';
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { cleanDatabase, DEMO_PASSWORD, login, seedBaseline } from './helpers.js';

const app = createApp();

beforeEach(async () => {
  await cleanDatabase();
  await seedBaseline();
});

after(async () => {
  await prisma.$disconnect();
});

test('health endpoint is public and reports database connectivity', async () => {
  const response = await request(app).get('/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
  assert.equal(response.body.database, 'connected');
});

test('unauthenticated API access is denied', async () => {
  const response = await request(app).get('/api/employees');
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'UNAUTHORIZED');
});

test('invalid credentials are rejected', async () => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@umu.ac.mw', password: 'wrong-password' });
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'INVALID_CREDENTIALS');
});

test('malformed JSON returns a validation error', async () => {
  const response = await request(app)
    .post('/api/auth/login')
    .set('Content-Type', 'application/json')
    .send('{not-json');

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});

test('successful login returns a session and writes an audit event', async () => {
  const token = await login(app, 'admin@umu.ac.mw', DEMO_PASSWORD);
  assert.ok(token);

  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  assert.equal(me.status, 200);
  assert.equal(me.body.email, 'admin@umu.ac.mw');
  assert.ok(me.body.permissions.includes('employee.view'));

  const audit = await prisma.auditEvent.findFirst({ where: { action: 'auth.login.success' } });
  assert.ok(audit);
  assert.equal(audit?.actorLabel, 'admin@umu.ac.mw');
});
