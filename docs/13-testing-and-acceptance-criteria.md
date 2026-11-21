# 13 — Testing and Acceptance Criteria
## 1. Testing approach
Testing should cover normal use, invalid inputs, permission boundaries, workflow transitions, privacy and reliability. Test with synthetic data, never real staff data unless formally approved.
## 2. Test layers
- Unit: validation, calculations, permission policy and workflow rules.
- Integration: database relations, transactions, notifications and document storage.
- API: success, errors, authentication, scope enforcement and pagination.
- UI: forms, navigation, loading/error states, accessibility and responsive behavior.
- Security: authorization bypass, insecure upload, session, export and sensitive-field tests.
- End-to-end: major lifecycle workflows.
- Recovery: backup restoration and service recovery.
## 3. Core acceptance scenarios
### Employee record
Given an authorized HR user, when they create a staff record with valid required fields, the record is saved with a unique staff number and audit event. Duplicate staff numbers are rejected.
### Scope enforcement
Given an HOD assigned to Department A, when they request Department B's staff record through the API, access is denied even if the UI link is manually entered.
### Employee self-service
An employee can view permitted own data and submit a correction request; they cannot directly change protected employment fields without the required approval.
### Leave workflow
A leave request is validated and routed to the assigned approver; the requester cannot approve their own request; approval updates the record and balance/history correctly.
### Recruitment isolation
A panel member can review assigned vacancy candidates but cannot view candidates from an unrelated vacancy.
### Confidential complaint
Only authorized case users can view the complaint and its attachments; general dashboards and notifications show no confidential narrative.
### Contract alert
A contract nearing expiry creates a notification/task for the configured recipients at the configured interval.
### Delegation expiry
Temporary access stops working at its end date without manual removal.
### Audit
Sensitive changes and exports create protected audit events containing actor, target, action and timestamp.
### Export control
A user with report-view but no export permission can view the report but cannot download it.
### Exit process
Approved exit records trigger the configured clearance tasks and access deactivation checklist, with history retained.
## 4. Definition of done
- Requirement implemented and reviewed.
- Validation and error states handled.
- Authorization enforced server-side and tested.
- Audit event created for applicable actions.
- UI usable and responsive.
- Automated tests pass.
- Documentation updated.
- No secrets or real sensitive data in source, test fixtures or logs.
