# 23 — Phase 4 Backlog and Handover

## Release candidate

- Scope: Phase 4 reporting, hardening, responsive/accessibility polish and demonstration operations.
- Data policy: synthetic data only.
- Recommended release label: `phase4-demo-rc1`.
- Handover artifacts: this document, docs 17–22, the demo script, the user guide, the presentation deck source and the API acceptance suite.

## Delivered in Phase 4

- `/api/reports` with workforce, operations and governance aggregates.
- Date and organizational-unit filters with effective scope labels.
- Separate `/api/reports/export` permission and audited, parameterized CSV output.
- Reports & analytics web page with accessible tables, filter form and export control.
- Responsive mobile navigation, skip link, focus rings, improved dialog semantics and announced status states.
- Phase 4 API tests for report scope, export denial/audit, deactivation, audit immutability and sensitive-field omission.
- Backup and restore scripts with explicit restore acknowledgement.
- Deployment/operations runbook, security/accessibility review, test report, demo script, user guide and presentation source.

## Specification traceability

| Specification area | Implementation | Evidence |
| --- | --- | --- |
| Workforce reports | `apps/api/src/reports/service.ts`, `ReportsPage.tsx` | `phase4.test.ts`, demo scene 6 |
| HR operations reports | `apps/api/src/reports/service.ts` | `phase4.test.ts`, user guide |
| Governance reports | `apps/api/src/reports/service.ts` | `phase4.test.ts`, security review |
| Row and column scoping | `employeeWhere`, domain scope helpers, aggregate DTOs | `phase4.test.ts`, doc 21 |
| Separate export permission | `report.view` and `report.export` route guards | `phase4.test.ts` |
| Export metadata and logging | audit `report.exported`, CSV preamble | `phase4.test.ts` |
| RBAC/security testing | existing Phase 1–3 tests plus `phase4.test.ts` | doc 20 |
| Responsive/a11y refinements | `Layout.tsx`, `ui.tsx`, `DashboardPage.tsx`, `ReportsPage.tsx` | doc 21 |
| Backup/restore | `scripts/backup.ps1`, `scripts/restore.ps1` | doc 22 |
| Monitoring/deployment | health endpoint, CI, runbook | doc 22 |
| Demo/user guide/presentation | docs 17–19 | demo rehearsal |

## Known limitations and accepted risks

- Email, SMS and push notifications remain future channels; in-app notifications and reminders are implemented.
- MFA and SSO are not implemented.
- No automated browser accessibility suite; manual checklist is provided.
- Production TLS, secret manager and private object storage are documented but not provisioned.
- Payroll, compensation and attendance-device integrations remain Phase 5 work.
- Formal exit clearance and access-deactivation checklist workflows are not implemented; account deactivation and session revocation are covered.
- Backup/restore is a manual, scripted drill rather than a scheduled CI stage.

## Backlog

### High priority before any real deployment

1. Add MFA for privileged accounts.
2. Configure HTTPS, secret management and production CORS allowlists.
3. Move private uploads to protected object storage with encryption and lifecycle policy.
4. Add automated dependency and container scanning to CI.
5. Complete institutional data-protection and retention review.

### Medium priority

1. Add browser-based accessibility and responsive tests.
2. Add email notification channel with template review and opt-out rules.
3. Implement exit clearance and asset-return checklist workflow.
4. Add report scheduling and saved filter presets.
5. Add delivery-status tracking for notifications.

### Future phases

1. Payroll or compensation module.
2. SSO and identity-provider integration.
3. Attendance devices only after privacy review.
4. Workforce forecasting, succession planning and policy assistant.

## Handover checks

- Run `npm run lint`, `npm run typecheck`, `npm run build` and `npm test`.
- Reset and reseed synthetic data before the final demonstration.
- Rehearse the role-based demo script once end to end.
- Confirm export denial for HOD and export audit for admin.
- Perform one backup/restore drill and record the result.
- Tag the accepted release candidate after review.
