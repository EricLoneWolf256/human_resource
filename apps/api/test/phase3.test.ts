import './setup.js';
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { addDays, toDateOnly, today } from '../src/dates.js';
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

async function publishRequisition(code: string, title: string): Promise<string> {
  const token = await login(app, 'admin@umu.ac.mw');
  const created = await request(app)
    .post('/api/recruitment/requisitions')
    .set(bearer(token))
    .send({
      code,
      title,
      description: 'Phase 3 integration test vacancy',
      unitId: baseline.deptAId,
      employmentType: 'PERMANENT',
      openings: 1,
      closingDate: toDateOnly(addDays(today(), 45)),
    });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  const submitted = await request(app)
    .post(`/api/recruitment/requisitions/${created.body.id}/submit`)
    .set(bearer(token));
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));

  const approved = await request(app)
    .post(`/api/recruitment/requisitions/${created.body.id}/decision`)
    .set(bearer(token))
    .send({ action: 'APPROVE', comment: 'Approved for test' });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));

  const published = await request(app)
    .post(`/api/recruitment/requisitions/${created.body.id}/publish`)
    .set(bearer(token));
  assert.equal(published.status, 200, JSON.stringify(published.body));
  return created.body.id as string;
}

async function applyPublicly(vacancyId: string, email: string, firstName = 'Test') {
  return request(app)
    .post('/api/careers/applications')
    .send({
      vacancyId,
      firstName,
      lastName: 'Candidate',
      email,
      phone: '+265 999 888 777',
      coverNote: 'I am interested in this position.',
      qualifications: 'Relevant degree and experience',
    });
}

async function applicationIdByReference(reference: string): Promise<string> {
  const application = await prisma.application.findUniqueOrThrow({
    where: { reference },
    select: { id: true },
  });
  return application.id;
}

async function assignPanel(vacancyId: string): Promise<string> {
  const token = await login(app, 'admin@umu.ac.mw');
  const response = await request(app)
    .post('/api/recruitment/panels')
    .set(bearer(token))
    .send({ vacancyId, userId: baseline.panelUserId, role: 'CHAIR' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.id as string;
}

async function setApplicationStatus(applicationId: string, status: string, note?: string) {
  const token = await login(app, 'admin@umu.ac.mw');
  const response = await request(app)
    .post(`/api/recruitment/applications/${applicationId}/status`)
    .set(bearer(token))
    .send({ status, note });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body;
}

async function submitScorecard(applicationId: string, token: string, recommendation = 'YES') {
  return request(app)
    .post('/api/recruitment/scorecards')
    .set(bearer(token))
    .send({
      applicationId,
      criteria: [
        { name: 'Relevant experience', score: 4, comment: 'Strong background' },
        { name: 'Interview performance', score: 5, comment: 'Clear answers' },
      ],
      recommendation,
      strengths: 'Good communication skills',
      concerns: 'None',
    });
}

test('public careers portal publishes vacancies, accepts applications and supports tracking', async () => {
  const vacancyId = await publishRequisition('PHASE3-REQ1', 'Lecturer - public portal');
  const publicVacancies = await request(app).get('/api/careers/vacancies');
  assert.equal(publicVacancies.status, 200);
  assert.ok(publicVacancies.body.some((item: { id: string }) => item.id === vacancyId));

  const publicVacancy = await request(app).get(`/api/careers/vacancies/${vacancyId}`);
  assert.equal(publicVacancy.status, 200);
  assert.equal(publicVacancy.body.code, 'PHASE3-REQ1');
  assert.ok(!JSON.stringify(publicVacancy.body).toLowerCase().includes('applicant'));

  const applied = await applyPublicly(vacancyId, 'candidate.one@example.com');
  assert.equal(applied.status, 201, JSON.stringify(applied.body));
  assert.equal(applied.body.status, 'SUBMITTED');
  const reference = applied.body.reference as string;
  assert.ok(reference.startsWith('APP-'));

  const tracked = await request(app)
    .get('/api/careers/applications/track')
    .query({ reference, email: 'candidate.one@example.com' });
  assert.equal(tracked.status, 200);
  assert.equal(tracked.body.reference, reference);
  assert.equal(tracked.body.status, 'SUBMITTED');

  const wrongEmail = await request(app)
    .get('/api/careers/applications/track')
    .query({ reference, email: 'other@example.com' });
  assert.equal(wrongEmail.status, 404);

  const duplicate = await applyPublicly(vacancyId, 'candidate.one@example.com');
  assert.equal(duplicate.status, 409);
});

test('panel members see only assigned candidates and scorecards require panel assignment', async () => {
  const assignedVacancyId = await publishRequisition('PHASE3-REQ2', 'Lecturer - panel assigned');
  const otherVacancyId = await publishRequisition('PHASE3-REQ3', 'Lecturer - unassigned');
  await assignPanel(assignedVacancyId);

  const assignedApplication = await applyPublicly(assignedVacancyId, 'panel.candidate@example.com');
  await applyPublicly(otherVacancyId, 'outside.candidate@example.com');
  const applicationId = await applicationIdByReference(assignedApplication.body.reference as string);
  await setApplicationStatus(applicationId, 'SHORTLISTED', 'Shortlisted for panel review');

  const panelToken = await login(app, 'panel@umu.ac.mw');
  const visible = await request(app).get('/api/recruitment/applications').set(bearer(panelToken));
  assert.equal(visible.status, 200);
  assert.equal(visible.body.total, 1);
  assert.equal(visible.body.items[0].id, applicationId);

  const vacancies = await request(app).get('/api/recruitment/vacancies').set(bearer(panelToken));
  assert.equal(vacancies.status, 200);
  assert.deepEqual(
    vacancies.body.items.map((item: { id: string }) => item.id).sort(),
    [assignedVacancyId].sort(),
  );

  const outsideScorecard = await request(app)
    .post('/api/recruitment/scorecards')
    .set(bearer(panelToken))
    .send({
      applicationId,
      criteria: [{ name: 'General', score: 3 }],
      recommendation: 'YES',
    });
  assert.equal(outsideScorecard.status, 201);

  const duplicate = await submitScorecard(applicationId, panelToken);
  assert.equal(duplicate.status, 409);

  const employeeToken = await login(app, 'employee@umu.ac.mw');
  const denied = await request(app).get('/api/recruitment/applications').set(bearer(employeeToken));
  assert.equal(denied.status, 403);

  const audit = await prisma.auditEvent.findMany({
    where: { action: 'recruitment.scorecard_submitted', entityType: 'Scorecard' },
  });
  assert.equal(audit.length, 1);
  assert.equal(audit[0]?.actorUserId, baseline.panelUserId);
});

test('offers require a documented recommendation and candidates can respond', async () => {
  const vacancyId = await publishRequisition('PHASE3-REQ4', 'Lecturer - offer flow');
  await assignPanel(vacancyId);
  const applicantEmail = 'offer.candidate@example.com';
  const applied = await applyPublicly(vacancyId, applicantEmail);
  const reference = applied.body.reference as string;
  const applicationId = await applicationIdByReference(reference);
  await setApplicationStatus(applicationId, 'SHORTLISTED', 'Shortlisted for offer');

  const adminToken = await login(app, 'admin@umu.ac.mw');
  const earlyOffer = await request(app)
    .post(`/api/recruitment/applications/${applicationId}/offer`)
    .set(bearer(adminToken))
    .send({ note: 'Offer before panel recommendation', offerDetails: 'Salary grade 1' });
  assert.equal(earlyOffer.status, 409);

  const panelToken = await login(app, 'panel@umu.ac.mw');
  const scorecard = await submitScorecard(applicationId, panelToken);
  assert.equal(scorecard.status, 201, JSON.stringify(scorecard.body));

  const offer = await request(app)
    .post(`/api/recruitment/applications/${applicationId}/offer`)
    .set(bearer(adminToken))
    .send({ note: 'Panel recommended appointment', offerDetails: 'Salary grade 1' });
  assert.equal(offer.status, 200, JSON.stringify(offer.body));
  assert.equal(offer.body.status, 'OFFERED');

  const wrongEmailResponse = await request(app)
    .post(`/api/careers/applications/${reference}/response`)
    .send({ email: 'different@example.com', action: 'ACCEPT' });
  assert.equal(wrongEmailResponse.status, 404);

  const accepted = await request(app)
    .post(`/api/careers/applications/${reference}/response`)
    .send({ email: applicantEmail, action: 'ACCEPT', note: 'I accept the offer.' });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.status, 'ACCEPTED');
  assert.ok(accepted.body.offerDetails);

  const stored = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
  assert.ok(stored.offerRespondedAt);

  const notifications = await prisma.notification.findMany({
    where: { eventType: 'recruitment.offer_accepted' },
  });
  assert.ok(notifications.length > 0);
});

test('appraisal moves through self-review, staged reviews, finalization and archive', async () => {
  const adminToken = await login(app, 'admin@umu.ac.mw');
  const cycleResponse = await request(app)
    .post('/api/performance/cycles')
    .set(bearer(adminToken))
    .send({
      code: 'PHASE3-CYCLE1',
      name: 'Phase 3 test cycle',
      templateType: 'ACADEMIC',
      startDate: toDateOnly(addDays(today(), -30)),
      endDate: toDateOnly(addDays(today(), 60)),
    });
  assert.equal(cycleResponse.status, 201, JSON.stringify(cycleResponse.body));
  const cycleId = cycleResponse.body.id as string;

  const opened = await request(app).post(`/api/performance/cycles/${cycleId}/open`).set(bearer(adminToken));
  assert.equal(opened.status, 200, JSON.stringify(opened.body));

  const created = await request(app)
    .post('/api/performance/appraisals')
    .set(bearer(adminToken))
    .send({
      cycleId,
      employeeId: baseline.plainEmployeeId,
      objectives: [
        { title: 'Teaching quality', target: 'Maintain strong evaluations', weight: 60 },
        { title: 'Research output', target: 'Submit two articles', weight: 40 },
      ],
    });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const appraisalId = created.body.id as string;
  const objectives = created.body.objectives as { id: string }[];
  assert.equal(objectives.length, 2);

  const employeeToken = await login(app, 'employee@umu.ac.mw');
  const selfReview = await request(app)
    .post(`/api/performance/appraisals/${appraisalId}/self-review`)
    .set(bearer(employeeToken))
    .send({
      selfRating: 4,
      selfComment: 'I met all targets for the period.',
      developmentPlan: 'Attend a research methods workshop.',
      objectiveRatings: objectives.map((objective) => ({ id: objective.id, rating: 4 })),
    });
  assert.equal(selfReview.status, 200, JSON.stringify(selfReview.body));
  assert.equal(selfReview.body.status, 'SELF_REVIEW');
  assert.equal(selfReview.body.objectives[0].selfRating, 4);

  const selfRatings = await prisma.appraisalObjective.findMany({ where: { appraisalId } });
  assert.ok(selfRatings.every((objective) => objective.selfRating === 4));

  for (const stage of ['SUPERVISOR', 'HOD', 'HR'] as const) {
    const reviewed = await request(app)
      .post(`/api/performance/appraisals/${appraisalId}/review`)
      .set(bearer(adminToken))
      .send({ stage, rating: 4, comment: `Completed ${stage.toLowerCase()} review` });
    assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body));
  }

  const finalized = await request(app)
    .post(`/api/performance/appraisals/${appraisalId}/finalize`)
    .set(bearer(adminToken))
    .send({ finalRating: 4, comment: 'Appraisal finalized for the record.' });
  assert.equal(finalized.status, 200, JSON.stringify(finalized.body));
  assert.equal(finalized.body.status, 'FINALIZED');

  const archived = await request(app)
    .post(`/api/performance/appraisals/${appraisalId}/archive`)
    .set(bearer(adminToken));
  assert.equal(archived.status, 200, JSON.stringify(archived.body));
  assert.equal(archived.body.status, 'ARCHIVED');

  const reviewAudit = await prisma.auditEvent.findMany({
    where: { entityType: 'Appraisal', action: { contains: 'review' } },
  });
  assert.ok(reviewAudit.length >= 3);
});

test('training request completes with a training record and skill, and bypass is blocked', async () => {
  const adminToken = await login(app, 'admin@umu.ac.mw');
  const courseResponse = await request(app)
    .post('/api/training/courses')
    .set(bearer(adminToken))
    .send({
      code: 'PHASE3-TRAIN1',
      title: 'Research methods',
      category: 'PEDAGOGICAL',
      provider: 'Centre for Teaching',
      durationHours: 12,
    });
  assert.equal(courseResponse.status, 201, JSON.stringify(courseResponse.body));
  const courseId = courseResponse.body.id as string;

  const employeeToken = await login(app, 'employee@umu.ac.mw');
  const requested = await request(app)
    .post('/api/training/requests')
    .set(bearer(employeeToken))
    .send({ courseId, reason: 'Needed for my current teaching duties.' });
  assert.equal(requested.status, 201, JSON.stringify(requested.body));
  const requestId = requested.body.id as string;

  const recommended = await request(app)
    .post(`/api/training/requests/${requestId}/decision`)
    .set(bearer(adminToken))
    .send({ action: 'RECOMMEND', comment: 'Recommended by supervisor' });
  assert.equal(recommended.status, 200, JSON.stringify(recommended.body));

  const approved = await request(app)
    .post(`/api/training/requests/${requestId}/decision`)
    .set(bearer(adminToken))
    .send({ action: 'APPROVE', comment: 'Approved by HR' });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));

  const registered = await request(app)
    .post(`/api/training/requests/${requestId}/status`)
    .set(bearer(adminToken))
    .send({ status: 'REGISTERED' });
  assert.equal(registered.status, 200, JSON.stringify(registered.body));

  const completedAt = toDateOnly(today());
  const completed = await request(app)
    .post(`/api/training/requests/${requestId}/complete`)
    .set(bearer(adminToken))
    .send({
      completedAt,
      score: 88,
      certificateNumber: 'CERT-PHASE3-001',
      skillName: 'Research methods',
    });
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  assert.equal(completed.body.status, 'COMPLETED');

  const record = await prisma.trainingRecord.findFirst({ where: { requestId } });
  assert.ok(record);
  assert.equal(record.score, 88);
  const skill = await prisma.employeeSkill.findFirst({
    where: { employeeId: baseline.plainEmployeeId, name: 'Research methods' },
  });
  assert.ok(skill);

  const secondRequest = await request(app)
    .post('/api/training/requests')
    .set(bearer(employeeToken))
    .send({ courseId, reason: 'Second request for bypass test.' });
  assert.equal(secondRequest.status, 201, JSON.stringify(secondRequest.body));
  const bypass = await request(app)
    .post(`/api/training/requests/${secondRequest.body.id}/status`)
    .set(bearer(adminToken))
    .send({ status: 'COMPLETED' });
  assert.equal(bypass.status, 400);
});

test('career case progresses to an effective assignment while preserving history', async () => {
  const token = await login(app, 'admin@umu.ac.mw');
  const effectiveDate = addDays(today(), 30);
  const created = await request(app)
    .post('/api/career/cases')
    .set(bearer(token))
    .send({
      employeeId: baseline.staffAId,
      type: 'TRANSFER',
      proposedUnitId: baseline.deptBId,
      effectiveDate: toDateOnly(effectiveDate),
      reason: 'Documented transfer for the Phase 3 integration test.',
    });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const caseId = created.body.id as string;

  const eligibility = await request(app)
    .post(`/api/career/cases/${caseId}/progress`)
    .set(bearer(token))
    .send({ status: 'ELIGIBILITY_CHECK', note: 'Eligibility confirmed' });
  assert.equal(eligibility.status, 200, JSON.stringify(eligibility.body));

  const documents = await request(app)
    .post(`/api/career/cases/${caseId}/progress`)
    .set(bearer(token))
    .send({ status: 'DOCUMENT_VERIFICATION', documentsVerified: true, note: 'Documents verified' });
  assert.equal(documents.status, 200, JSON.stringify(documents.body));

  const committee = await request(app)
    .post(`/api/career/cases/${caseId}/progress`)
    .set(bearer(token))
    .send({ status: 'COMMITTEE_REVIEW', documentsVerified: true, note: 'Committee reviewed' });
  assert.equal(committee.status, 200, JSON.stringify(committee.body));

  const recommended = await request(app)
    .post(`/api/career/cases/${caseId}/progress`)
    .set(bearer(token))
    .send({ status: 'RECOMMENDED', note: 'Committee recommends approval' });
  assert.equal(recommended.status, 200, JSON.stringify(recommended.body));

  const approved = await request(app)
    .post(`/api/career/cases/${caseId}/decision`)
    .set(bearer(token))
    .send({ decision: 'APPROVE', note: 'Approved by competent authority' });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.status, 'APPROVED');

  const effective = await request(app)
    .post(`/api/career/cases/${caseId}/effective`)
    .set(bearer(token));
  assert.equal(effective.status, 200, JSON.stringify(effective.body));
  assert.equal(effective.body.status, 'EFFECTIVE');

  const assignments = await prisma.employeeAssignment.findMany({
    where: { employeeId: baseline.staffAId },
    orderBy: { startDate: 'asc' },
  });
  assert.equal(assignments.length, 2);
  assert.equal(toDateOnly(assignments[0]!.endDate!), toDateOnly(addDays(effectiveDate, -1)));
  assert.equal(toDateOnly(assignments[1]!.startDate), toDateOnly(effectiveDate));
  assert.equal(assignments[1]!.unitId, baseline.deptBId);
});

test('dashboard exposes Phase 3 counts and protected modules reject ordinary employees', async () => {
  const adminToken = await login(app, 'admin@umu.ac.mw');
  const dashboard = await request(app).get('/api/dashboard').set(bearer(adminToken));
  assert.equal(dashboard.status, 200);
  assert.ok(dashboard.body.phase3);
  for (const key of [
    'openVacancies',
    'applicationsInProgress',
    'appraisalsInReview',
    'pendingTrainingApprovals',
    'pendingCareerCases',
  ]) {
    assert.equal(typeof dashboard.body.phase3[key], 'number');
  }

  const employeeToken = await login(app, 'employee@umu.ac.mw');
  const deniedRead = await request(app).get('/api/recruitment/requisitions').set(bearer(employeeToken));
  assert.equal(deniedRead.status, 403);

  const writeAttempts = [
    { path: '/api/recruitment/requisitions', body: {} },
    {
      path: '/api/performance/cycles',
      body: {
        code: 'EMP-CYCLE',
        name: 'Unauthorized cycle',
        templateType: 'ACADEMIC',
        startDate: toDateOnly(today()),
        endDate: toDateOnly(addDays(today(), 30)),
      },
    },
    {
      path: '/api/training/courses',
      body: { code: 'EMP-COURSE', title: 'Unauthorized course', category: 'OTHER' },
    },
  ];
  for (const attempt of writeAttempts) {
    const denied = await request(app).post(attempt.path).set(bearer(employeeToken)).send(attempt.body);
    assert.equal(denied.status, 403, `${attempt.path} should reject an ordinary employee`);
  }
});
