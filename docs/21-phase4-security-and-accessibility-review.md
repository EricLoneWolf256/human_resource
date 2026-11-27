# 21 — Phase 4 Security and Accessibility Review

## Security review

### Authentication and sessions

- Passwords are hashed; the seed password is synthetic and clearly documented.
- Login throttling records failed attempts and enforces rate limiting.
- Access and refresh tokens are stored in cookies; refresh sessions can be revoked.
- Changing a user status away from `ACTIVE` revokes active sessions immediately.
- A deactivated account cannot sign in, verified by `phase4.test.ts`.
- A password reset sets `mustChangePassword`; the API blocks all authenticated routes except `me`, `change-password` and `logout` with `PASSWORD_CHANGE_REQUIRED` until the user sets a new password.

### Authorization

- All `/api` routes except the health check, login, refresh, logout and careers pass through global authentication.
- Route guards require explicit permissions; domain helpers apply row scope.
- Department and faculty grants expand to descendants.
- Delegations are effective only within their dates and status.
- Reports use `employeeWhere(ctx, 'report.view')` so report rows stay inside the user's effective grant scope.
- Vacancy and application aggregates use report scope unit IDs.
- Highly restricted complaints are excluded from aggregate counts unless the user has a complaint permission or is the assigned case handler.
- Governance counts require an institution-wide access/audit grant and return `null` for scoped or unauthorized users.
- Report view and export permissions are separate; export attempts are enforced server-side even if the UI hides the button.

### Data protection

- Employee list and report DTOs exclude national ID, date of birth and emergency contacts.
- Reports return aggregated labels and counts only; no employee, applicant or complaint identifiers.
- CSV cells and metadata values that begin with spreadsheet formula characters are escaped to reduce CSV-injection risk.
- Private uploads remain outside public web serving and are validated by content and metadata.
- Audit events record actor, action, target, timestamp and reason where applicable, and no write endpoint is exposed.
- Exports include generation time and parameters and create an `report.exported` audit event.

### Findings

No critical authorization bypass was found in the Phase 4 review. Automated API tests cover cross-scope employee access, restricted complaints, recruitment panel isolation, report scope, export denial, forced password change, deactivation and audit immutability.

Residual risks are documented rather than implemented: production TLS, secret manager integration, MFA, SSO, external object storage and automated dependency/security scanning.

## Accessibility review

### Fixes applied

- `Loading` uses `role="status"` and `aria-live="polite"`.
- `ErrorBlock` uses `role="alert"`.
- `EmptyState` uses `role="status"`.
- `Card` titles render as `h2` elements.
- Primary and secondary buttons expose visible focus rings.
- Sidebar uses a named `<nav>` and a mobile toggle with `aria-expanded` and `aria-controls`.
- A skip link targets `<main id="main-content">`.
- The unread notification badge has an accessible label.
- The change-password dialog uses `role="dialog"`, `aria-modal`, `aria-labelledby`, initial focus, a focus trap that ignores disabled controls, and Escape/Cancel only when dismissal is allowed.
- Dashboard and report tables use screen-reader captions, `scope="col"` headers and named keyboard-focusable scroll regions.
- Report filters use visible `<label>` elements through the shared `Field` component.
- Report bars are decorative; all values remain available in accessible tables.
- Pagination wraps on narrow screens.

### Manual checks

| Check | Result |
| --- | --- |
| Keyboard-only navigation to all sidebar items | Pass |
| Visible focus on links, buttons and inputs | Pass |
| Logical heading order on dashboard and reports | Pass |
| Labels for report filters | Pass |
| Status announced for loading, error and empty states | Pass |
| Tables announced with captions and column scopes | Pass |
| Mobile navigation toggle state | Pass |
| Dialog focus entry, trapping and Escape | Pass |
| Information not encoded by color alone | Pass |
| Responsive layout at phone, tablet and desktop widths | Pass |

Automated axe/browser testing was not introduced because the project deliberately avoids the blocked esbuild/Vitest toolchain; the manual checklist above is the Phase 4 evidence for the demonstration release.
