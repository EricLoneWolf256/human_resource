# 11 — Notifications and Reporting
## 1. Notification channels
Initial release: in-app notifications and dashboard task queues. Email can be added next. SMS/push may be future channels depending on cost and integration.
## 2. Notification event catalogue
| Event | Recipient | Priority |
|---|---|---|
| Leave submitted | Assigned approver, HR if required | Normal |
| Leave approved/rejected | Employee, relevant HR | Normal |
| Approval overdue | Approver, escalation recipient | High |
| Request assigned/updated | Request owner and requester as appropriate | Normal |
| Restricted complaint assigned | Assigned authorized case handler only | High |
| Vacancy published/application received | Recruitment users/applicant | Normal |
| Interview scheduled/changed | Assigned panel and candidate | High |
| Offer accepted/onboarding task | HR and task owner | Normal |
| Contract/probation nearing deadline | HR, supervisor, employee as policy allows | High |
| Appraisal opens/overdue | Employee, supervisor, HR as applicable | Normal/High |
| Training approved/completed | Employee, HR/training owner | Normal |
| Promotion/transfer decision | Employee and authorized stakeholders | Normal |
| Access granted/revoked | User and security administrator | High |
## 3. Notification fields
Event, recipient, title, safe summary, priority, related record, created time, read time, expiry, delivery channel and delivery status.
## 4. Rules
- Notifications link to the relevant record only if the recipient is authorized to open it.
- Never include salary, medical details, complaint narratives or sensitive evidence in notification text.
- Reminders and escalation timing are configurable.
- Users may manage ordinary notification preferences, but critical security messages may remain mandatory.
- Read/unread state and notification history are maintained.
## 5. Reports
### Workforce
- Headcount by unit, employment type, status, grade/position and staff category.
- Academic and non-academic totals.
- Staff movement, hiring, exits and vacancies.
### HR operations
- Leave usage/balances and pending requests.
- Recruitment funnel, time-to-fill and vacancy status.
- Onboarding completion and probation status.
- Contracts expiring and renewal status.
- Appraisal completion and overdue reviews.
- Training attendance, completion and skill/certificate expiry.
- Requests by category, status, workload and resolution time.
### Governance
- Access reviews, privileged accounts, role assignments and delegation expiry.
- Audit events and export activity, within authorized scope.
## 6. Report controls
- Apply scope and permissions to both rows and columns.
- Export permission is separate from view permission.
- Date filters, organizational filters and clear report definitions.
- Use aggregated results where individual details are not necessary.
- Exports should include generation date and report parameters; log export activity.
