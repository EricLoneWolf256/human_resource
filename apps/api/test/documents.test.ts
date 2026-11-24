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

function pdfUpload(employeeId: string) {
  return request(app)
    .post('/api/documents')
    .field('employeeId', employeeId)
    .field('category', 'CONTRACT')
    .field('title', 'Test contract')
    .field('sensitivity', 'CONFIDENTIAL')
    .attach('file', Buffer.from('%PDF-1.4\n%%EOF'), {
      filename: 'contract.pdf',
      contentType: 'application/pdf',
    });
}

test('document upload verifies file content and metadata', async () => {
  const token = await login(app, 'admin@umu.ac.mw');
  const uploaded = await pdfUpload(baseline.staffAId).set(bearer(token));
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.body.status, 'PENDING');
  assert.equal(uploaded.body.employeeId, baseline.staffAId);

  const list = await request(app).get('/api/documents').set(bearer(token));
  assert.equal(list.status, 200);
  assert.equal(list.body.total, 1);

  const download = await request(app).get(`/api/documents/${uploaded.body.id}/download`).set(bearer(token));
  assert.equal(download.status, 200);
  assert.match(download.headers['content-type'] ?? '', /application\/pdf/);

  const verified = await request(app)
    .post(`/api/documents/${uploaded.body.id}/verify`)
    .set(bearer(token))
    .send({ note: 'Checked' });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.status, 'VERIFIED');
});

test('upload rejects mismatched file content', async () => {
  const token = await login(app, 'admin@umu.ac.mw');
  const response = await request(app)
    .post('/api/documents')
    .set(bearer(token))
    .field('employeeId', baseline.staffAId)
    .field('category', 'CONTRACT')
    .field('title', 'Fake contract')
    .attach('file', Buffer.from('not a pdf'), {
      filename: 'fake.pdf',
      contentType: 'application/pdf',
    });

  assert.equal(response.status, 400);
});

test('employee role can view only their own documents', async () => {
  const token = await login(app, 'employee@umu.ac.mw');
  const response = await request(app).get('/api/documents').set(bearer(token));
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.items));

  const otherEmployee = await request(app)
    .get(`/api/documents?employeeId=${baseline.staffAId}`)
    .set(bearer(token));
  assert.equal(otherEmployee.status, 403);
});
