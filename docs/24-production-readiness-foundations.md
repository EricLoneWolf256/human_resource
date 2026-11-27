# 24 — Production Readiness Foundations

## Purpose

This document records the first production-readiness work after the Phase 4 handover. It does **not** declare the system ready for real staff data. The system remains a synthetic-data demonstration release until every go/no-go criterion below is met and signed off.

## Implemented foundations

### Configuration guardrails

`apps/api/src/config.ts` now:

- Validates `DATABASE_URL` as a URL and validates `CORS_ORIGIN` as one or more origin-only URLs.
- Rejects wildcard CORS origins.
- Requires `CORS_ORIGIN`, `TRUST_PROXY` and non-placeholder secrets when `NODE_ENV=production`.
- Requires HTTPS CORS origins in production, allowing only localhost exceptions for local TLS testing.
- Defaults `ALLOW_DEMO_SEED=false` in production and rejects the default demo password there.

`apps/api/src/app.ts` honours `TRUST_PROXY` so audit IP addresses and rate limiting work correctly behind a trusted reverse proxy.

`apps/api/prisma/seed.ts` refuses to run unless `ALLOW_DEMO_SEED=true`, preventing accidental demo-account creation in a production environment.

`apps/api/.env.example` documents the new `ALLOW_DEMO_SEED`, `TRUST_PROXY` and `REQUIRE_MFA_FOR_PRIVILEGED` settings. The last setting defaults to `false` outside production and is forced to `true` in production by config validation.

### Backup integrity

`scripts/backup.ps1` writes SHA-256 checksums for the SQL dump and document archive into each backup manifest.

`scripts/restore.ps1` verifies those checksums before starting MySQL, restoring data or replacing private documents. A manifest without checksums is rejected.

### Security automation

- `.github/workflows/security.yml` runs a production-dependency audit and a Trivy filesystem scan on pushes, pull requests and a weekly schedule. Container image scanning remains a Phase 5 task because no production image is built yet.
- Audit and scan reports are uploaded as artifacts/SARIF for review.
- `.github/dependabot.yml` proposes weekly npm and GitHub Actions updates.

The audit and scan steps are initially non-blocking because the current release has known advisories that require coordinated dependency upgrades. They become blocking gates once the remediation work in doc 25 is complete.

## Current known advisories

`npm audit --omit=dev --audit-level=high` currently reports high-severity advisories in `zod`, `effect` and `deepmerge-ts` through Prisma tooling. These must be resolved or formally accepted before real-data deployment. Zod requires a major-version migration, so it is deliberately not bundled into this foundation change.

## Production checklist status

| Item | Status | Evidence / next action |
| --- | --- | --- |
| Explicit production CORS allowlist | Implemented | `apps/api/src/config.ts`, `apps/api/.env.example` |
| Placeholder secret rejection | Implemented | `apps/api/src/config.ts` |
| Demo seeding disabled by default in production | Implemented | `apps/api/src/config.ts`, `apps/api/prisma/seed.ts` |
| Proxy trust configuration | Implemented | `apps/api/src/app.ts` |
| Backup checksum verification | Implemented | `scripts/backup.ps1`, `scripts/restore.ps1` |
| Dependency and filesystem scanning automation | Implemented as reporting-only | `.github/workflows/security.yml`, `.github/dependabot.yml` |
| Container image scanning | Not implemented | Add after the production image is introduced |
| Pinned GitHub Action SHAs | Open | Pin mutable action tags before go-live |
| MFA for privileged accounts | Implemented | TOTP enrolment, verification, recovery codes, login challenge and privileged-route enforcement; `REQUIRE_MFA_FOR_PRIVILEGED=true` in production |
| HTTPS/TLS termination | Template implemented | `deploy/nginx.conf` redirects HTTP, terminates TLS and sets HSTS; certificate issuance/renewal remains an operations task |
| Liveness/readiness and structured logs | Implemented | `/api/health/live`, `/api/health/ready`, JSON request/error/startup logs |
| Secret manager integration | Not implemented | Inject secrets at runtime; never use `.env` files in production |
| Protected object storage | Not implemented | Replace `STORAGE_DIR` local filesystem with encrypted object storage |
| Advisories resolved or accepted | Open | Upgrade Zod/Prisma toolchain and re-run audit |
| Data-protection/retention review | Draft only | Institutional approval still required |

## Go/no-go criteria for real data

1. MFA is enforced for privileged roles and verified by tests.
2. HTTPS is enforced end to end with HSTS and secure cookies.
3. Secrets come from an approved secret manager; no local `.env` files are deployed.
4. Private uploads use encrypted object storage with least-privilege credentials and lifecycle rules.
5. Dependency and image scans are blocking and have no unresolved high/critical findings.
6. A DPIA, lawful-basis register, retention schedule and breach procedure are approved by the institution.
7. A restore drill has been repeated with checksum-verified backups and recorded in the test report.
8. Monitoring, alerting and incident ownership are active.

Until all eight criteria pass, use only synthetic data.
