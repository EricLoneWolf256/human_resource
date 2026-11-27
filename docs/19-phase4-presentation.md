# 19 — Phase 4 Presentation

This Markdown deck can be pasted into slide software or rendered with a Markdown presenter. Each `##` heading is one slide.

## Slide 1 — University HR and Staff Management System

Phase 4: reporting, security hardening, responsive polish and demonstration-ready release.

Synthetic data only. No production or real staff data.

## Slide 2 — Problem and objectives

- Fragmented HR records and approvals across faculties and departments.
- Need one shared platform for HR, management, supervisors and employees.
- Need granular permissions and auditable workflows.
- Need a defensible final-year project demonstration.

## Slide 3 — Solution overview

- Modular monolith with npm workspaces.
- Shared contracts in `packages/shared`.
- Express 5 and Prisma 6 API backed by MySQL 8.4.
- React 19, React Router, TanStack Query and Tailwind 3 web client.
- Node test runner and Supertest integration suite.

## Slide 4 — Architecture

```text
React web client
      |
      | /api
      v
Express API  --  access policy / RBAC  --  audit service
      |
      v
Prisma ORM
      |
      v
MySQL 8.4 + private document storage
```

Health check: `/api/health` is public. All other API paths authenticate globally, with explicit public exceptions for login, refresh, logout and careers.

## Slide 5 — Access model

- Roles combine permissions with scope: OWN, ASSIGNED, TEAM, DEPARTMENT, FACULTY and INSTITUTION.
- Department and faculty scopes expand to descendants.
- Delegations add time-bounded permissions and expire automatically.
- `employeeWhere` applies row scope to queries.
- Domain policies separately protect requests, vacancies, applications, appraisals and training.

## Slide 6 — Workflows delivered

- Employee directory, effective assignments and self-service corrections.
- Documents with content validation, verification and authorized downloads.
- Leave, contracts, probation, onboarding and HR request workflows.
- Careers portal, panels, scorecards, offers and candidate responses.
- Appraisal cycles, training, promotion, transfer and acting appointments.

## Slide 7 — Phase 4 reporting

- New `/api/reports` endpoint requiring `report.view`.
- Workforce: headcount, status, type, unit, grade, academic split, hires and exits.
- Operations: leave, contracts, requests, onboarding, probation, appraisals, training and recruitment.
- Governance: role assignments, delegations and audit activity when authorized.
- Date and organizational-unit filters with clear scope labels.

## Slide 8 — Export control

- `/api/reports/export` requires the separate `report.export` permission.
- CSV carries generation time, report parameters and aggregate rows.
- Values are CSV-injection protected.
- Every export writes an audited `report.exported` event with row count and parameters.
- View-only roles receive `403 FORBIDDEN` on direct export attempts.

## Slide 9 — Responsive and accessible UI

- Reports page with labelled filters, accessible tables and visual bars with tabular equivalents.
- Mobile navigation drawer with `aria-expanded` and `aria-controls`.
- Skip link, named landmarks and focus-visible styling.
- Loading, error and empty states announced to assistive technology.
- Dialog with `role="dialog"`, `aria-modal`, initial focus, Escape handling and focus trap.
- Card headings use real heading elements; tables use captions and column scopes.

## Slide 10 — Security evidence

- HOD scope test: Department A staff only; Department B report filter returns zero.
- Export test: view without export permission is denied.
- Deactivation test: account login fails and active sessions are revoked.
- Audit immutability test: no write endpoint exists for audit events.
- Sensitive-field test: directory payload excludes national ID and date of birth.

## Slide 11 — Operations evidence

- Public database health endpoint.
- MySQL health check in Docker Compose.
- PowerShell backup script for database and private storage.
- Restore script with explicit `-ConfirmRestore` safeguard.
- Deployment and incident-response guidance in the operations runbook.

## Slide 12 — Verification

```text
npm run lint
npm run typecheck
npm run build
npm test
```

The GitHub Actions workflow also applies Prisma migrations to development and test databases against MySQL 8.4. Evidence is recorded in `docs/20-phase4-test-report.md`.

## Slide 13 — Risks and limitations

- In-app notifications only; email, SMS and push are future extensions.
- No MFA or SSO in the demonstration release.
- UI accessibility was reviewed manually; no automated axe/browser suite is included.
- Production TLS, secret management and private object storage are documented but not executed.
- Exit clearance and payroll are outside the current scope.

## Slide 14 — Demo path

1. Secure foundation and audit.
2. Employee and organization records.
3. Self-service and leave approval.
4. Restricted complaint isolation.
5. Recruitment, appraisal and training.
6. Reports and audited export.
7. Deactivation and recovery.

See `docs/18-phase4-demo-script.md` for role-by-role steps and expected evidence.

## Slide 15 — Conclusion

Phase 4 turns the workflow platform into a demonstration-ready release with scoped analytics, guarded exports, tested authorization boundaries, accessible responsive screens and repeatable operational procedures.
