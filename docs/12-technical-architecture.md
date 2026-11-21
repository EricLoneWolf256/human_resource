# 12 — Technical Architecture (Provisional)
## 1. Architecture direction
A modular monolith is recommended for the first version: one API application organized into domain modules, one web application and a relational database. This keeps the project understandable and deployable while preserving boundaries for future scaling.
## 2. Proposed stack (subject to confirmation)
| Layer | Candidate |
|---|---|
| Frontend | React, TypeScript, Vite |
| UI styling | Tailwind CSS |
| Data fetching | TanStack Query |
| Forms | React Hook Form + Zod |
| Backend | Node.js, Express, TypeScript |
| ORM | Prisma |
| Database | MySQL |
| Shared contracts | Shared package for schemas, permission keys and types |
| File storage | Local private storage in development; private object storage in production |
| Background jobs | Queue/worker for reminders, email and scheduled checks (later phase) |

Versions and compatibility should be checked before implementation. This stack is a proposal, not a locked decision.
## 3. Repository layout
```text
university-hr-system/
  README.md
  docs/
  apps/
    api/
    web/
  packages/
    shared/
```
## 4. Backend module boundaries
Auth & Access; Organization; Employees; Recruitment; Onboarding; Leave; Attendance; Requests/Complaints; Contracts; Documents; Performance; Training; Career; Notifications; Reports; Audit; Settings.
## 5. API principles
- REST-style endpoints under `/api` initially.
- Validate inputs and responses using shared schemas where possible.
- Standard error format, pagination, filtering and sorting.
- Authorization middleware/policies on every protected operation.
- Avoid leaking database details or sensitive fields.
- Use transactions for multi-record HR actions.
- Version API when breaking changes are needed.
## 6. Database principles
Relational data model with foreign keys, unique identifiers, effective-dated assignments, workflow records and audit events. Use migrations; avoid manual production schema changes. Index search and relationship fields based on usage.
## 7. Frontend principles
Reusable components, permission-aware route and action rendering, form validation, accessible interaction, loading/error/empty states and centralized API client. Server remains the authorization source of truth.
## 8. Environments
Development, test and production must be separate. Secrets are stored in environment variables or a secret manager—not committed. Production uses HTTPS, secure backups, monitoring and restricted administrative access.
## 9. Deployment outline
Build frontend; deploy API and database in protected environment; configure private file storage; apply migrations; create approved admin account; configure backups, monitoring and TLS; verify health endpoint and restore process. Avoid default/demo credentials in production.
## 10. Integration roadmap
Potential later integrations: institutional email, payroll/finance, identity provider/SSO, attendance devices, SMS provider, document signing and calendar. Each requires access, privacy and data-sharing review.
