# 15 — Dated Roadmap (23 Nov – 31 Dec 2026)

## Scope
Execution roadmap after specification approval. Covers **Phase 1 foundation + core Phase 2 HR operations slices** from the spec pack, sized for a student demo. No production deployment or real staff data.

## Assumptions
- Specs are baseline-approved; open decisions logged as blockers, not silent assumptions.
- Team capacity: student project pace; **Dec 25 public holiday/reduced capacity**.
- Stack (provisional): React+TS+Vite, Node+Express+TS, Prisma, MySQL, shared Zod schemas.
- All data is synthetic/anonymized; server-side RBAC/audit enforced from day one.

## Dated Plan

| Dates | Phase / Sprint | Focus | Key Tasks | Deliverables | Exit Criteria |
|---|---|---|---|---|---|
| **Mon 23 Nov – Sun 29 Nov 2026** | Sprint 1 — Foundation Setup | Repo, architecture, auth/RBAC skeleton | Initialize monorepo/apps/packages; env/config; DB schema v1 (users, roles, permissions, scopes, audit); auth (login/session/JWT or session), password hashing; RBAC middleware/policy checks; seed synthetic users/roles; CI/typecheck/lint baseline. | Running dev stack, migration baseline, auth + RBAC proof, seed script. | Unauthorized API access denied by tests; admin can assign role/scope; audit event recorded for login/role change. |
| **Mon 30 Nov – Sun 6 Dec 2026** | Sprint 2 — Org & Employee Core | Organization structure, employee records | Org units (faculty/department/unit), positions, assignments, supervisor/HOD effective-dated records; employee CRUD/profile, staff number uniqueness, status/history; document metadata model/storage stub; employee directory with scope filtering; basic audit for sensitive changes. | Org module, employee module, scoped directory, profile/detail pages. | HOD sees only assigned department scope; staff number duplicate rejected; employee history preserved on assignment change. |
| **Mon 7 Dec – Sun 13 Dec 2026** | Sprint 3 — Leave & Workflow Engine | Leave workflow, notifications, dashboards | Leave types/balances/policies; leave request/approval/rejection/cancellation flow; configurable approval routing by scope; overlap/balance validation; in-app notifications/task queue; role-aware dashboards; workflow history/timeline component. | Leave end-to-end flow, notification center, dashboard MVP. | Employee submits leave; approver acts within scope; requester cannot self-approve; balance/history updates correctly. |
| **Mon 14 Dec – Sun 20 Dec 2026** | Sprint 4 — HR Services & Contracts | Requests, contracts/probation, onboarding basics | HR request/service desk tickets; restricted complaint category model (access-controlled); contract/probation records, expiry reminders; onboarding checklist template/instance; document upload verification flow; delegation/time-bound access basics. | Request module, contract/reminder jobs/logs, onboarding checklist, restricted-case access rules. | Confidential complaint invisible to unauthorized roles; contract nearing expiry generates task/reminder; delegation expires as configured. |
| **Mon 21 Dec – Sun 27 Dec 2026** | Sprint 5 — Reports, Security, Hardening | Reporting, security review, bugfix | Scoped reports (headcount, leave, contracts, requests); export permission checks/logging; security pass (authZ bypass, upload validation, sensitive fields, audit coverage); accessibility/responsive fixes; test coverage expansion; synthetic demo dataset polish. *Reduced capacity Dec 25.* | Report pages/exports, security test checklist, bugfix log, demo dataset. | Export denied without permission and logged; major P1 flows pass E2E; no critical auth bypass findings. |
| **Mon 28 Dec – Wed 31 Dec 2026** | Sprint 6 — Demo & Handover | QA, demo pack, closure | Regression test run; seed/demo script; role-based demo walkthrough; known issues/backlog; deployment/runbook notes (dev/test); final spec-to-implementation traceability update. | Demo script, test report, backlog/next-steps, release tag/candidate. | Demo runs end-to-end on synthetic data; all P1 acceptance scenarios mapped as pass/fail with evidence. |

## Milestone Gates

| Date | Milestone | Go/No-Go Evidence |
|---|---|---|
| **29 Nov 2026** | M1 Foundation | Auth, RBAC, audit, migrations, seed data working. |
| **6 Dec 2026** | M2 Core Records | Org + employee + scope filtering + history. |
| **13 Dec 2026** | M3 Leave Workflow | End-to-end leave approval, notifications, dashboards. |
| **20 Dec 2026** | M4 HR Ops Slice | Requests/contracts/reminders/onboarding/restricted access. |
| **27 Dec 2026** | M5 Hardening | Reports, security tests, bugfixes, demo readiness. |
| **31 Dec 2026** | M6 Demo Handover | Demo pack, test evidence, backlog, next-phase plan. |

## Priority Cut Line (if behind)
1. **Must keep**: Auth/RBAC/scope, employee/org records, leave workflow, audit, basic notifications.
2. **Should keep**: Contracts/reminders, HR requests, scoped reports.
3. **Can defer**: Full onboarding/offboarding, advanced exports, email/SMS, recruitment/appraisal modules.

## Risks / Controls
| Risk | Impact | Control |
|---|---|---|
| RBAC/scope complexity | Data exposure / rework | Server-side policy tests before UI polish; deny-by-default. |
| Schema churn | Migration delays | Freeze core entities per sprint; migration review. |
| Holiday/reduced capacity | Missed M5/M6 | Cut-line enforced Dec 20; no new scope after Dec 24. |
| Unclear HR rules | Wrong workflow | Log assumptions in issue/backlog; configurable rules where possible. |
