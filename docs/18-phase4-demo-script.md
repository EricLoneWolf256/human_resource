# 18 — Phase 4 Demo Script

## Preparation

Use only the synthetic seed data.

```bash
npm install --ignore-scripts
npm run db:up
npm run prisma:generate -w @umu-hr/api
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:5173`. The API health check is available at `http://localhost:4000/api/health`.

To reset before a rehearsal, stop `npm run dev`, run `npm run db:reset`, then `npm run db:seed`.

## Demo accounts

| Persona | Account | Password | Purpose |
| --- | --- | --- | --- |
| Administrator | `admin@umu.ac.mw` | `Demo#Pass123` | Full institutional access and report export |
| HR manager | `hr@umu.ac.mw` | `Demo#Pass123` | HR operations and reporting |
| HOD | `hod@umu.ac.mw` | `Demo#Pass123` | Department A scope and no export permission |
| Employee | `employee@umu.ac.mw` | `Demo#Pass123` | Own-record self-service |
| Recruiter | `recruiter@umu.ac.mw` | `Demo#Pass123` | Recruitment workflow |
| Panel member | `panel@umu.ac.mw` | `Demo#Pass123` | Assigned candidates only |

## Scene 1 — Secure foundation (3 minutes)

1. Sign in as `admin@umu.ac.mw`.
2. Show the header role list and the permission-aware sidebar.
3. Open **Access control** and show active role assignments.
4. Open **Audit trail** and point to actor, action, target and timestamp columns.
5. Sign out and show that protected pages redirect to login.

Expected evidence: authentication, role scope display, audit history and session boundary.

## Scene 2 — Employee and organization records (4 minutes)

1. Sign in as `hr@umu.ac.mw`.
2. Open **Employees** and demonstrate search, status filter and pagination.
3. Open one employee detail page and show assignment history.
4. Open **Organization** and show the university-to-department hierarchy.
5. Attempt to create a duplicate staff number and show the validation error.

Expected evidence: employee lifecycle, effective-dated assignments, validation and audit.

## Scene 3 — Employee self-service and restricted data (4 minutes)

1. Sign in as `employee@umu.ac.mw`.
3. Open **My profile** and show completeness information.
4. Submit a self-service correction request.
5. Open **Leave** and submit a request.
6. Sign in as `hod@umu.ac.mw` and approve the request.
7. Return to the employee account and show the decision and updated leave balance.

Expected evidence: self-service boundaries, approval workflow and balance update.

## Scene 4 — Confidential request isolation (2 minutes)

1. As the employee, submit a complaint category request and choose highly restricted sensitivity.
2. As a different employee, confirm the complaint narrative is not visible.
3. As HR, show that an authorized case user can access it.

Expected evidence: row-level sensitivity control and safe notification summaries.

## Scene 5 — Recruitment to development (5 minutes)

1. As `recruiter@umu.ac.mw`, publish a vacancy from **Recruitment**.
2. Open `/careers` in a new browser session and submit an application.
3. Track the application by reference and email.
4. As `panel@umu.ac.mw`, show only the assigned application and submit a scorecard.
5. As the recruiter, make an offer and show the candidate response flow.
6. Open **Performance** and show a staged appraisal cycle.
7. Open **Training** and show an approved request, completion record and skill.

Expected evidence: public portal isolation, panel scoping, documented offer decision and development lifecycle.

## Scene 6 — Phase 4 reports and export control (5 minutes)

1. Sign in as `admin@umu.ac.mw`.
2. Open **Reports & analytics**.
3. Apply a date range and show workforce, operations and governance sections.
4. Filter by a department and show the aggregate values change.
5. Select **Export CSV** and open the file. Point out the generated-at line, parameters and aggregate-only rows.
6. Show the new `report.exported` event in **Audit trail**.
7. Sign in as `hod@umu.ac.mw` and show that reports are available but **Export CSV** is absent.
8. Call `GET /api/reports/export` with the HOD token and show `403 FORBIDDEN`.

Expected evidence: scoped aggregation, separate export permission, parameter metadata and export audit.

## Scene 7 — Security hardening and recovery (3 minutes)

1. As admin, deactivate a demo employee account from **Access control**.
2. Show that the account can no longer sign in and that existing sessions are revoked.
3. Run the backup and restore scripts described in `docs/22-phase4-deployment-and-operations.md` against the synthetic database.
4. Show the health endpoint returning `database: connected` after restore.

Expected evidence: account deactivation, session revocation, repeatable backup/restore and service recovery.

## Closing talking points

- Permissions are enforced server-side; UI hiding is only a usability layer.
- Reports aggregate within effective role scope and never expose sensitive narratives.
- Audit events cover authentication, access changes, approvals and exports.
- The release is demonstration-ready, not a production deployment with real staff data.
