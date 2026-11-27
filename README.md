# University HR and Staff Management System

Phase 5 hardening increment of the centralized HR and staff management platform for the university project. The repository includes the specification pack, Phase 4 handover documentation and Phase 5 readiness documentation in `docs/`, a Prisma-backed Express API with scoped reporting, and a responsive React web client.

## Project direction

- One university and one campus for this project scope.
- One central HR department.
- Shared platform for HR, management, faculties, departments, supervisors, and employees.
- Granular RBAC with scope restrictions is enforced on every protected API route.
- All records are new; no legacy HR application migration is assumed.

## Implemented across Phases 1–5

- Authentication with access/refresh tokens, session revocation, login throttling, and password changes.
- Role and scope assignment with effective role assignments, delegation, and audit logging.
- Organizational units, positions, employee directory, lifecycle statuses, and effective-dated assignments.
- Employee self-service, correction requests, document upload/verification, notifications, dashboard, and audit log.
- Leave requests and balances, HR requests, contracts and reminders, probation reviews, and onboarding checklists.
- Vacancy requisitions, a public careers portal, application tracking, interview panels, scorecards, offers, and candidate responses.
- Performance appraisal cycles, staged reviews, finalization, training courses and requests, completion records, and employee skills.
- Promotion, transfer, and acting appointment cases with eligibility, committee, decision, and effective assignment workflows.
- Scoped workforce, HR operations and governance reports with date/unit filters, CSV export and audited export parameters.
- React web client for all management modules, a responsive Reports & analytics page, accessibility refinements, and the unauthenticated careers portal at `/careers`.
- Backup/restore scripts, deployment runbook, monitoring guidance, demo script, user guide, presentation and Phase 4 acceptance evidence.
- TOTP MFA with one-time recovery codes, privileged-account enforcement, login challenge flow and enrolment UI.
- Production config guardrails, secure reverse-proxy template, liveness/readiness probes, structured API logs and checksum-verified backups.
- Per-user saved report presets with create, apply and delete flows.

## Quick start

Requirements: Node.js 22.18 or newer, npm, and Docker.

```bash
npm install --ignore-scripts
npm run db:up
npm run prisma:generate -w @umu-hr/api
npm run db:migrate
npm run db:seed
npm run dev
```

The API runs at `http://localhost:4000/api` and the web client at `http://localhost:5173`. Docker Compose maps MySQL to host port `3307` so it can coexist with other local database containers.

Demo accounts (password `Demo#Pass123`):

- `admin@umu.ac.mw` — super administrator
- `hr@umu.ac.mw` — HR manager
- `hod@umu.ac.mw` — HOD, Computer Science department scope
- `employee@umu.ac.mw` — employee self-service
- `recruiter@umu.ac.mw` — recruitment officer
- `panel@umu.ac.mw` — recruitment panel member

## Verification

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

The API test suite uses `apps/api/.env.test` and the `hr_system_test` database. GitHub Actions runs lint, typecheck, build, Prisma migrations, and tests against MySQL 8.4. Phase 4 scope, export-control and account-deactivation evidence is in `test/phase4.test.ts` and doc 20; Phase 5 MFA, privileged-route and saved-preset evidence is in `test/phase5.test.ts` and doc 26.

For operational drills on synthetic data:

```powershell
$env:MYSQL_ROOT_PASSWORD = '<local docker compose root password>'
./scripts/backup.ps1
./scripts/restore.ps1 -BackupRoot './backups' -ConfirmRestore
```

## Toolchain note

Windows Application Control on the development machine blocks `esbuild.exe`, so the project deliberately avoids Vite, tsx, Vitest, and esbuild. The API and tests run through Node's native TypeScript stripping with a small resolver for relative `.js` specifiers (`apps/api/ts-loader.mjs` and `apps/api/ts-resolve.mjs`). The web client uses webpack and Tailwind 3 with plain JavaScript configuration.

## Documents

See `docs/` for the complete specification pack:

1. Project Vision and Scope
2. Problem Statement and Objectives
3. Stakeholders and User Personas
4. Organizational Structure
5. Roles and Permissions
6. Functional Requirements
7. Workflows and Business Rules
8. Data Dictionary
9. UI/UX and Navigation
10. Security and Privacy
11. Notifications and Reporting
12. Technical Architecture
13. Testing and Acceptance Criteria
14. Implementation Roadmap
15. Dated Roadmap (23 Nov – 31 Dec 2026)
16. Implementation Decisions
17. Phase 4 User Guide
18. Phase 4 Demo Script
19. Phase 4 Presentation
20. Phase 4 Test Report
21. Phase 4 Security and Accessibility Review
22. Phase 4 Deployment and Operations Runbook
23. Phase 4 Backlog and Handover
24. Production Readiness Foundations
25. Phase 5 Plan
26. Phase 5 Test Report

## Status

Phases 1–5 hardening work is implemented as a synthetic-data demonstration release. Lint, typecheck, build and the full API acceptance suite cover the core workflows, scoped reports, export control, RBAC boundary checks, MFA and saved presets. Production-readiness foundations, the remaining Phase 5 gates and verification evidence are documented in docs 24–26; real staff data must not be used until all go/no-go criteria are met.
