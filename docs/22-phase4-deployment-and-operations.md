# 22 — Phase 4 Deployment and Operations Runbook

## Intended environments

This release is prepared for local development, test and synthetic-data demonstration. It is not a production deployment with real staff data.

- Development: MySQL on host port 3307, API on 4000, web on 5173.
- Test: `hr_system_test`, created by `scripts/mysql-init/01-test-db.sql`.
- Production: documented target only; must add TLS, secret management, private object storage and institutional approval before use with real data.

## Prerequisites

- Node.js 22.18 or newer and npm.
- Docker with Compose.
- PowerShell 5.1 or newer for backup/restore scripts.

## Local and demonstration deployment

```bash
npm install --ignore-scripts
npm run db:up
npm run prisma:generate -w @umu-hr/api
npm run db:migrate
npm run db:seed
npm run dev
```

Verification:

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

Check the service:

```text
GET http://localhost:4000/api/health
```

Expected response contains `status: ok` and `database: connected`.

## Build-only deployment

For environments where source files are not copied:

```bash
npm run build
npm run db:migrate
npm run start -w @umu-hr/api
```

Serve the generated `apps/web/dist` with a static web server configured to send unknown non-API paths to `index.html` for client-side routing. Keep `/api` on the API origin or configure a reverse proxy.

## Production target notes

Before any production use:

- Terminate HTTPS at a trusted reverse proxy and redirect HTTP.
- Inject `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` and storage settings from a secret manager or protected environment variables. Never commit them.
- Replace demo accounts, disable seed data and enforce strong password policy.
- Use private object storage with least-privilege credentials and encryption at rest.
- Restrict administrative access and review privileged role assignments.
- Apply schema changes only through `prisma migrate deploy`.
- Configure backups, alerting and incident ownership before go-live.
- Validate Uganda data-protection requirements and institutional policy before processing real staff data.

## Backup

Backups cover the `hr_system` MySQL database and `apps/api/storage/private` documents.

```powershell
$env:MYSQL_ROOT_PASSWORD = '<local docker compose root password>'
./scripts/backup.ps1
```

Outputs are written to `backups/`, which is git-ignored:

- `hr-<timestamp>.sql`
- `storage-<timestamp>.zip` when private documents exist
- `manifest-<timestamp>.json`

The backup uses `--single-transaction`, routines, triggers and hex blobs. Store backups in an access-controlled location with an appropriate retention schedule.

## Restore

The restore script overwrites `hr_system` and requires explicit acknowledgement.

```powershell
$env:MYSQL_ROOT_PASSWORD = '<local docker compose root password>'
./scripts/restore.ps1 -BackupRoot './backups' -ConfirmRestore
```

It selects the newest manifest, restores the exact database and document files recorded in that manifest, clears stale private documents before extraction when a storage backup is present, starts MySQL, and prints the employee row count as a basic verification query. Do not mix files from different manifests.

Restore drill procedure:

1. Run `npm test` and record the result.
2. Create a backup.
3. Delete a synthetic test record or reset the database.
4. Run `restore.ps1` with `-ConfirmRestore`.
5. Check `/api/health`.
6. Sign in with a synthetic account and confirm expected records are present.
7. Record timestamp, commands and result in the test report.

## Monitoring checklist

- API health endpoint and database connectivity.
- MySQL container health status.
- Error rate and latency at the reverse proxy or API logs.
- Failed login and throttling events in `LoginAttempt` and audit events.
- `role.assigned`, `role.revoked`, `user.status_changed` and delegation events.
- `report.exported` events with unexpected volume or scope.
- Private storage capacity and backup job success.
- Disk space for MySQL data and backups.

Do not log passwords, tokens or confidential document content.

## Incident response

1. Identify and classify the event using the information classes in doc 10.
2. Contain affected accounts or sessions using status change and session revocation.
3. Preserve audit events and application logs; do not edit audit records.
4. Investigate with authorized security and HR owners.
5. Restore from a verified backup if data integrity is affected.
6. Communicate through the institution's approved channel.
7. Review root cause, fix the issue, add a regression test and update this runbook.

## Rollback

- Application rollback: redeploy the previous build artifacts and restart the API/web processes.
- Schema rollback: use a forward-fix migration where possible; do not manually edit production tables.
- Data rollback: use the restore procedure with the last verified backup and record the point-in-time impact.

## Routine maintenance

- Run the full verification suite before each demonstration or release candidate.
- Review role assignments, delegations and active accounts.
- Review exported report events and large exports.
- Confirm backups succeed and perform a restore drill each milestone.
- Update the backlog and test report with known issues and resolved defects.
