# University HR and Staff Management System

Phase 1 implementation of the centralized HR and staff management platform for the university project. The repository includes the original specification pack in `docs/`, a Prisma-backed Express API, and a React web client.

## Project direction

- One university and one campus for this project scope.
- One central HR department.
- Shared platform for HR, management, faculties, departments, supervisors, and employees.
- Granular RBAC with scope restrictions is enforced on every protected API route.
- All records are new; no legacy HR application migration is assumed.

## Implemented in Phase 1

- Authentication with access/refresh tokens, session revocation, login throttling, and password changes.
- Role and scope assignment with effective role assignments and audit logging.
- Organizational units, positions, employee directory, lifecycle statuses, and effective-dated assignments.
- Employee self-service, correction requests, document upload/verification, notifications, dashboard, and audit log.
- React web client for login, dashboard, employees, employee detail, profile, organization, documents, notifications, audit, and access management.

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

## Verification

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

The API test suite uses `apps/api/.env.test` and the `hr_system_test` database. GitHub Actions runs lint, typecheck, build, Prisma migrations, and tests against MySQL 8.4.

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

## Status

Phase 1 implementation is complete and verified. Later roadmap phases are not implemented in this commit.
