# 08 — Data Dictionary (Initial)
This is an initial logical dictionary. Final database types and constraints will be set during design.
## 1. Employee
| Field | Meaning | Notes |
|---|---|---|
| employee_id | Internal unique ID | Generated primary key |
| staff_number | Official staff number | Unique; controlled format |
| first_name, middle_name, last_name | Legal/display names | Validation and change history |
| preferred_name | Preferred name | Optional |
| contact_email, phone | Contact details | Access-controlled |
| date_of_birth | Date of birth | Highly sensitive; collect only if required |
| national_id | Government identifier | Highly restricted; mask by default |
| emergency_contact | Emergency contact details | Restricted |
| employment_type | Permanent, fixed-term, part-time, visiting, adjunct, project, temporary, etc. | Configurable |
| employment_status | Lifecycle status | Controlled state transitions |
| hire_date, end_date | Employment dates | Effective dates |
| primary_unit_id | Primary organizational assignment | FK |
| position_id | Position assignment | FK/history |
| supervisor_id | Current supervisor | Effective-dated |
| profile_status | Draft, incomplete, verified, etc. | Workflow field |
## 2. Organizational unit
`unit_id`, `name`, `type`, `parent_unit_id`, `head_employee_id`, `effective_from`, `effective_to`, `status`.
## 3. Position and assignment
Position: `position_id`, title, job_description, grade, unit, status, approved_headcount. Assignment: `assignment_id`, employee_id, position_id, unit_id, supervisor_id, start_date, end_date, assignment_type, acting_flag.
## 4. User and access
User: `user_id`, employee_id (nullable for external applicants), username/email, password_hash or identity-provider reference, status, last_login. Role assignment: `user_id`, `role_id`, `scope_type`, `scope_id`, start_date, end_date, assigned_by, reason. Permission catalog: `permission_id`, key, description, module. Delegation: grantor, delegate, permissions, scope, valid dates, reason, approval reference.
## 5. Leave
Leave request: `request_id`, employee_id, leave_type_id, start_date, end_date, days_requested, reason (restricted as appropriate), attachment references, status, submitted_at. Leave balance: employee_id, leave_type_id, period, entitlement, carryover, used, adjustment, available. Balance adjustments require actor, reason and timestamp.
## 6. Recruitment
Vacancy: `vacancy_id`, requisition_id, title, unit_id, description, requirements, closing_date, status. Applicant: `applicant_id`, contact details and application data (restricted). Application: applicant_id, vacancy_id, tracking_number, submitted_at, status. Panel assignment, scorecard, interview and decision records are separate entities.
## 7. Contracts and documents
Contract: employee_id, type, start_date, end_date, renewal_status, document_id, status. Document: `document_id`, owner/related_entity, category, filename, storage_key, mime_type, size, uploaded_by, uploaded_at, verified_by, verified_at, expiry_date, sensitivity, version, retention status.
## 8. Performance and training
Appraisal: employee_id, cycle_id, template_id, reviewers, objectives, ratings, comments, status, finalized_at. Training: course_id, title, provider, dates, cost (restricted), attendance, completion, certificate reference, skill tags.
## 9. Requests and complaints
Request: request_id, requester, category, description, attachments, assigned_to, priority, status, opened_at, due_at, resolved_at. Complaint: restricted case_id, complainant reference, category, assigned investigator, evidence references, status, sensitivity and resolution fields; access must be separately enforced.
## 10. Notifications and audit
Notification: recipient_id, event_type, title, safe_summary, related_record_type/id, priority, created_at, read_at, expires_at. Audit event: actor, action, entity_type/id, timestamp, reason, before/after values for approved fields, request/session metadata as justified. Do not store passwords, tokens or unnecessary sensitive content in audit events.
## 11. Data quality rules
- IDs are stable and unique.
- Required fields depend on employment type and policy.
- Date ranges are validated.
- Referential integrity prevents orphaned assignments and requests.
- Official records are archived or deactivated rather than casually deleted.
- Sensitive fields have documented purpose, classification and access.
