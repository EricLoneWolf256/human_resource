# 26 — Phase 5 Test Report

## Scope

This report records the verification evidence for the Phase 5 hardening increment: production configuration foundations, MFA, readiness probes, structured logs, TLS proxy template and saved report presets.

## Commands

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

## Result

| Check | Result |
| --- | --- |
| ESLint | Passed |
| Shared/API/Web typecheck | Passed |
| Shared/API/Web build | Passed |
| API test suite | 36 tests passed, 0 failed |
| Webpack bundle-size warnings | Present; non-blocking |

The API suite includes five Phase 5 tests in `apps/api/test/phase5.test.ts`:

- TOTP enrolment, login challenge, verification and session creation.
- One-time recovery codes and `auth.mfa.recovery_used` audit events.
- `MFA_REQUIRED` enforcement on privileged routes when `REQUIRE_MFA_FOR_PRIVILEGED=true`.
- Private report preset creation, listing, deletion and denial for users without `report.view`.
- Liveness and readiness probe responses.

MFA challenge tokens are bound to the account's current `lastLoginAt`, so a completed challenge cannot be replayed. Failed TOTP and recovery attempts are written to `LoginAttempt` and subject to the existing 15-minute/5-attempt throttle.

## Migration evidence

`apps/api/prisma/migrations/20261127180000_phase5_mfa_and_presets/migration.sql` was applied with `prisma migrate deploy` to both `hr_system` and `hr_system_test`.

## Remaining risk

This increment does not clear all real-data go/no-go criteria in doc 24. Secret-manager injection, key rotation, encrypted object storage, blocking dependency/image scans, metrics/alerts, certificate lifecycle operations and institutional privacy approvals remain open. `npm audit --omit=dev --audit-level=high` still reports advisories in the Prisma tooling dependency chain; the security workflow remains reporting-only until they are remediated or formally accepted.
