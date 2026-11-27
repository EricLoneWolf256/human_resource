# 20 — Phase 4 Test Report

## Scope

This report records Phase 4 verification for the demonstration-ready HR system. The test suite uses synthetic data in `hr_system_test`; no real staff information is used.

## Environment

| Item | Value |
| --- | --- |
| Database | MySQL 8.4 via Docker Compose, host port 3307 |
| Test database | `hr_system_test` |
| API runtime | Node native TypeScript stripping with `apps/api/ts-loader.mjs` |
| Test runner | `node:test` with Supertest, serial execution |
| Web build | webpack 5 with Tailwind 3 |

## Commands

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

GitHub Actions runs the same verification sequence plus `prisma migrate deploy` for both development and test databases.

## Result summary

| Check | Result | Evidence |
| --- | --- | --- |
| Lint | Pass | `npm run lint` |
| Typecheck | Pass | `npm run typecheck` |
| Production build | Pass | `npm run build` |
| API integration suite | Pass, 31 tests | `npm test` |
| CI workflow | Pass on push/PR to `main` | `.github/workflows/ci.yml` |

## Acceptance traceability

| Acceptance area | Test or evidence | Result |
| --- | --- | --- |
| Health endpoint | `auth.test.ts`: public health reports DB connectivity | Pass |
| Authentication and audit | `auth.test.ts`: login writes `auth.login.success` | Pass |
| Duplicate staff number | `employees.test.ts`: duplicate rejected | Pass |
| Effective assignment history | `employees.test.ts`: history preserved | Pass |
| HOD cross-scope denial | `access.test.ts`: Department B employee denied; `phase4.test.ts`: report returns zero | Pass |
| Upload content validation | `documents.test.ts`: matching and mismatched magic bytes | Pass |
| Self-service boundary | `documents.test.ts` and `phase2.test.ts`: own data only, no protected-field writes | Pass |
| Leave workflow and no self-approval | `phase2.test.ts`: approval updates balance; self-approval denied | Pass |
| Restricted complaint isolation | `phase2.test.ts`: unauthorized employee cannot view narrative | Pass |
| Contract alert | `phase2.test.ts`: reminder scan creates contract expiry reminder | Pass |
| Delegation expiry | `phase2.test.ts`: expired delegation grants no access | Pass |
| Recruitment panel isolation | `phase3.test.ts`: panel sees only assigned applications | Pass |
| Offers require recommendation | `phase3.test.ts`: early offer rejected, documented offer accepted | Pass |
| Appraisal lifecycle | `phase3.test.ts`: staged review and finalization | Pass |
| Training lifecycle | `phase3.test.ts`: approved request, completion record and skill | Pass |
| Career movement | `phase3.test.ts`: effective assignment preserves history | Pass |
| Report scope | `phase4.test.ts`: institution sees 5 employees; HOD sees 2; outside-unit filter sees 0 | Pass |
| Report permission | `phase4.test.ts`: employee without `report.view` gets 403 | Pass |
| Export control | `phase4.test.ts`: HOD without `report.export` gets 403; admin export succeeds | Pass |
| Export audit | `phase4.test.ts`: `report.exported` stores actor, parameters and row count | Pass |
| Date filters | `phase4.test.ts`: future-only range excludes hires and applications | Pass |
| CSV injection protection | `phase4.test.ts`: formula-like unit name is escaped in metadata | Pass |
| Deactivation and session revocation | `phase4.test.ts`: status change revokes session and login fails | Pass |
| Forced password change | `phase4.test.ts`: reset users cannot call other APIs until password change succeeds | Pass |
| Audit immutability | `phase4.test.ts`: no POST/PATCH/DELETE route on `/api/audit` | Pass |
| Sensitive fields | `phase4.test.ts`: directory response excludes national ID and date of birth | Pass |
| Backup and restore | `scripts/backup.ps1`, `scripts/restore.ps1`, runbook in doc 22 | Demonstration procedure recorded |
| Accessibility | Manual review and fixes recorded in doc 21 | Pass for demonstration scope |

## New Phase 4 tests

`apps/api/test/phase4.test.ts` contains three integration tests:

1. `reports honour institutional and departmental scope` — validates row scope, scope labels, aggregates and denial for ordinary employees.
2. `report export requires export permission and is audited with its parameters` — validates separate export permission, CSV metadata and audit payload.
3. `deactivated accounts lose sessions and audit events cannot be altered through the API` — validates forced password change enforcement, account deactivation, session revocation, audit write denial and sensitive-field omission.

## Known limitations

- No automated browser/axe accessibility suite is configured; accessibility evidence is a documented manual review.
- Backup/restore is a repeatable scripted drill, not an automated CI stage.
- Production deployment, TLS and external secret management are documented but not executed in this student demonstration environment.
- Email, SMS, MFA, SSO, payroll and exit clearance are out of scope.
