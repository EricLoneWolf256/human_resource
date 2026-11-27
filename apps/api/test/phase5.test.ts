import './setup.js';
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import request from 'supertest';
import { ERROR_CODES } from '@umu-hr/shared';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { prisma } from '../src/db.js';
import { generateTotpCode, hashRecoveryCode } from '../src/auth/totp.js';
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

test('MFA enrolment produces login challenges and verified sessions', async () => {
  const token = await login(app, 'admin@umu.ac.mw');
  const setup = await request(app).post('/api/auth/mfa/setup').set(bearer(token));
  assert.equal(setup.status, 200);
  assert.match(setup.body.secret, /^[A-Z2-7]+$/);

  const enabled = await request(app)
    .post('/api/auth/mfa/enable')
    .set(bearer(token))
    .send({ code: generateTotpCode(setup.body.secret) });

  assert.equal(enabled.status, 200);
  assert.equal(enabled.body.recoveryCodes.length, 8);

  const challenge = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@umu.ac.mw', password: 'Demo#Pass123' });

  assert.equal(challenge.status, 200);
  assert.equal(challenge.body.mfaRequired, true);
  assert.ok(challenge.body.challengeToken);
  assert.equal(challenge.body.accessToken, undefined);

  const verified = await request(app)
    .post('/api/auth/mfa/verify')
    .send({ challengeToken: challenge.body.challengeToken, code: generateTotpCode(setup.body.secret) });

  assert.equal(verified.status, 200);
  assert.ok(verified.body.accessToken);
  assert.equal(verified.body.user.mfaEnabled, true);

  const me = await request(app).get('/api/auth/me').set(bearer(verified.body.accessToken));
  assert.equal(me.status, 200);

  const invalid = await request(app)
    .post('/api/auth/mfa/verify')
    .send({ challengeToken: challenge.body.challengeToken, code: '000000' });
  assert.equal(invalid.status, 401);

  const audit = await prisma.auditEvent.findFirst({ where: { action: 'auth.mfa.verified' } });
  assert.equal(audit?.actorUserId, baseline.adminUserId);
});

test('MFA recovery codes are audited and single-use', async () => {
  const token = await login(app, 'admin@umu.ac.mw');
  const setup = await request(app).post('/api/auth/mfa/setup').set(bearer(token));
  const enabled = await request(app)
    .post('/api/auth/mfa/enable')
    .set(bearer(token))
    .send({ code: generateTotpCode(setup.body.secret) });
  const recoveryCode = enabled.body.recoveryCodes[0] as string;

  const challenge = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@umu.ac.mw', password: 'Demo#Pass123' });

  const recovered = await request(app)
    .post('/api/auth/mfa/recover')
    .send({ challengeToken: challenge.body.challengeToken, recoveryCode });

  assert.equal(recovered.status, 200);
  assert.ok(recovered.body.accessToken);

  const usedCode = await prisma.mfaRecoveryCode.findFirst({
    where: { userId: baseline.adminUserId, usedAt: { not: null } },
  });
  assert.ok(usedCode?.usedAt);
  assert.equal(usedCode?.codeHash, hashRecoveryCode(recoveryCode));

  const secondChallenge = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@umu.ac.mw', password: 'Demo#Pass123' });

  const reused = await request(app)
    .post('/api/auth/mfa/recover')
    .send({ challengeToken: secondChallenge.body.challengeToken, recoveryCode });

  assert.equal(reused.status, 401);
  assert.equal(reused.body.error.code, ERROR_CODES.MFA_INVALID_CODE);

  const audit = await prisma.auditEvent.findFirst({ where: { action: 'auth.mfa.recovery_used' } });
  assert.equal(audit?.actorUserId, baseline.adminUserId);
});

test('privileged routes require MFA when enforcement is enabled', async () => {
  const previous = config.REQUIRE_MFA_FOR_PRIVILEGED;
  config.REQUIRE_MFA_FOR_PRIVILEGED = 'true';
  try {
    const adminToken = await login(app, 'admin@umu.ac.mw');
    const blocked = await request(app).get('/api/access/users').set(bearer(adminToken));
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error.code, ERROR_CODES.MFA_REQUIRED);

    const employeeToken = await login(app, 'employee@umu.ac.mw');
    const allowed = await request(app).get('/api/dashboard').set(bearer(employeeToken));
    assert.equal(allowed.status, 200);

    const setup = await request(app).post('/api/auth/mfa/setup').set(bearer(adminToken));
    assert.equal(setup.status, 200);
    const enabled = await request(app)
      .post('/api/auth/mfa/enable')
      .set(bearer(adminToken))
      .send({ code: generateTotpCode(setup.body.secret) });
    assert.equal(enabled.status, 200);

    const allowedPrivileged = await request(app).get('/api/access/users').set(bearer(adminToken));
    assert.equal(allowedPrivileged.status, 200);
  } finally {
    config.REQUIRE_MFA_FOR_PRIVILEGED = previous;
  }
});

test('report presets are private to their owner and can be deleted', async () => {
  const adminToken = await login(app, 'admin@umu.ac.mw');
  const created = await request(app)
    .post('/api/reports/presets')
    .set(bearer(adminToken))
    .send({ name: 'Academic year', query: { from: '2020-01-01', to: '2030-12-31', unitId: baseline.deptAId } });

  assert.equal(created.status, 201);
  assert.equal(created.body.name, 'Academic year');
  assert.equal(created.body.query.unitId, baseline.deptAId);

  const listed = await request(app).get('/api/reports/presets').set(bearer(adminToken));
  assert.equal(listed.status, 200);
  assert.equal(listed.body.length, 1);

  const employeeToken = await login(app, 'employee@umu.ac.mw');
  const denied = await request(app).get('/api/reports/presets').set(bearer(employeeToken));
  assert.equal(denied.status, 403);

  const deleted = await request(app)
    .delete(`/api/reports/presets/${created.body.id}`)
    .set(bearer(adminToken));
  assert.equal(deleted.status, 200);

  const empty = await request(app).get('/api/reports/presets').set(bearer(adminToken));
  assert.equal(empty.body.length, 0);
});

test('liveness and readiness probes report service state', async () => {
  const live = await request(app).get('/api/health/live');
  assert.equal(live.status, 200);
  assert.equal(live.body.status, 'ok');

  const ready = await request(app).get('/api/health/ready');
  assert.equal(ready.status, 200);
  assert.equal(ready.body.status, 'ready');
  assert.equal(ready.body.database, 'connected');
});
