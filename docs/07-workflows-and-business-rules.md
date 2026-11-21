# 07 — Workflows and Business Rules
Workflows must be configurable where institutional policy differs. These examples are draft process models, not approved university policy.
## 1. Leave application
1. Employee submits leave dates, type, reason (where required) and attachments.
2. System validates dates, balance, policy and overlapping requests.
3. Supervisor/HOD reviews within assigned scope.
4. HR review is added for policy exceptions or leave types requiring it.
5. Approval or rejection is recorded with comment and timestamp.
6. Employee and relevant HR receive notification; approved balance/calendar updates.
7. Corrections require authorized action and audit history.
**Rules:** no self-approval; balance adjustment must include reason and actor; private medical details are not exposed to managers unnecessarily.
## 2. Recruitment
Requisition → budget/authority review → vacancy publication → applications → eligibility screening → shortlist → panel assignment → interview/assessment → recommendation → approval → offer → accepted/declined → onboarding or archive.
**Rules:** panel members see assigned candidates only; scorecards are attributable; selection decisions require documented authority; candidate communications are logged.
## 3. Onboarding
Offer accepted → onboarding record → required documents → verification → contract/appointment letter → unit and supervisor assignment → account/ID/assets tasks → orientation and policy acknowledgement → probation dates → checklist completion.
**Rules:** employee status should not become Active until required approvals and conditions are satisfied; checklist exceptions need authorized justification.
## 4. Contract and probation
Contract issued → signed/verified → active dates recorded → reminders → renewal/extension/expiry decision. Probation review may lead to confirmation, extension or other policy-approved outcome.
Suggested reminder intervals (configurable): 90, 60 and 30 days before contract expiry; 30, 14 and 7 days before probation end.
## 5. Performance appraisal
Cycle configured → employee self-assessment → supervisor review → HOD review (where applicable) → HR validation → finalization → feedback and development plan → archive.
Academic template may cover teaching, research, publications, supervision, projects, service and administration. Non-academic template may cover duties, quality, productivity, reliability, communication, teamwork, conduct and targets.
## 6. Training
Employee or supervisor request → supervisor/HOD recommendation → HR policy/budget review → approval → registration → attendance/completion → certificate and skills record.
## 7. Promotion or career progression
Application/nomination → eligibility check → document verification → relevant committee review → recommendation → authorized decision → notification → effective-date update and history. Academic promotion may include qualifications, teaching, research, publications, supervision and service evidence.
## 8. Complaint or sensitive case
Submission → restricted assignment → triage → investigation/response → authorized review → resolution → closure. Access is restricted by case assignment and sensitivity; notes and evidence must not appear in general dashboards or notifications. Anonymous submission is a policy decision.
## 9. HR service request
Submit → validate → assign → work/awaiting information → resolve → employee confirms or case closes → feedback. Request categories and target times are configurable.
## 10. Exit/offboarding
Resignation/retirement/termination initiated → approvals and effective date → handover → clearance tasks (department, HR, ICT, finance/assets as appropriate) → access removal → final documents → record archived.
## 11. Delegation and approvals
Delegation must be explicit, approved, scoped, time-bound and audited. It cannot grant access beyond the grantor's own authority. Self-approval is prohibited where policy requires independent review. Reassignment when approvers are absent must preserve the original task and history.
## 12. General business rules
- Use effective dates for assignments, contracts, positions and status changes.
- Preserve history; avoid destructive deletion of official HR records.
- Every approval/rejection records actor, date/time and comment/reason where required.
- Do not send sensitive complaint, salary or medical details in notification text.
- Only authorized users may export data; exports should be logged.
- Workflow state transitions must be validated server-side.
- Invalid or duplicate staff identifiers are rejected.
- Record changes to sensitive fields should require verification/approval where policy defines it.
