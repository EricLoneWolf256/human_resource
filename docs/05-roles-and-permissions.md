# 05 — Roles and Permissions
## 1. RBAC approach
Access is determined by **role + permission + scope + assignment + conditions**. A role is a permission bundle, not a job title. Users may have more than one role, but effective access should be the minimum needed for their duties.
## 2. Candidate role catalogue (provisional)
1. Super Administrator (controlled emergency/administrative authority)
2. System Administrator (technical configuration and operations)
3. Security & Access Administrator
4. Executive Approver (VC or authorized executive)
5. Executive Delegate
6. HR Director
7. HR Manager
8. HR Officer
9. Faculty HR Administrator
10. HR Records Officer
11. Recruitment Officer
12. Recruitment Panel Member
13. Onboarding Officer
14. Payroll/Compensation Officer (if module is included)
15. Benefits & Welfare Officer
16. Training & Development Officer
17. Performance Management Officer
18. Career & Promotion Officer
19. Employee Relations Officer
20. Dean
21. Department Head (HOD)
22. Supervisor / Line Manager
23. Committee Chair
24. Committee Member / Reviewer
25. Internal Auditor
26. Employee

This is a starting catalogue. Consolidate roles where a separate role adds little value; do not create a role for every job title.
## 3. Permission examples
- `employee.view`, `employee.create`, `employee.update`, `employee.archive`
- `employee.verify`, `employee.assign_unit`, `employee.assign_supervisor`
- `employee.view_sensitive`, `employee.view_salary`, `employee.export`
- `document.view`, `document.upload`, `document.verify`, `document.download`, `document.delete`
- `leave.submit`, `leave.view`, `leave.approve`, `leave.reject`, `leave.adjust_balance`
- `recruitment.create`, `recruitment.manage`, `candidate.view`, `candidate.score`, `candidate.export`
- `appraisal.create`, `appraisal.review`, `appraisal.finalize`
- `training.manage`, `training.approve`, `promotion.review`, `promotion.approve`
- `complaint.view_assigned`, `complaint.assign`, `complaint.investigate`, `complaint.close`
- `report.view`, `report.export`, `audit.view`
- `user.manage`, `role.manage`, `permission.manage`, `access.delegate`
## 4. Scope types
- **Own:** the user's own records.
- **Assigned:** records explicitly assigned to the user.
- **Team/direct reports:** current direct-report records.
- **Department:** records within an assigned department.
- **Faculty/unit:** records within an assigned faculty or organizational unit.
- **Institution:** institution-wide records, only when granted.
## 5. Example access matrix
| Role | Typical scope | Typical permissions | Default restrictions |
|---|---|---|
| Employee | Own | Self-service, submit requests, view own documents | No other employee's private data |
| Supervisor | Team/direct reports | Review, approve assigned requests, appraisal | No salary, unrelated complaint or broad export |
| HOD | Department | Staff view, leave approvals, staffing request, assigned appraisal | Sensitive records and salary separately granted |
| Dean | Faculty/unit | Faculty staffing summaries and delegated approvals | No unrestricted institution-wide HR data |
| HR Officer | Assigned/institutional HR scope | HR transactions, records, document processing | Sensitive case access requires explicit permission |
| HR Director | Institution | HR oversight and authorized operations | Restricted case access remains controlled |
| Payroll Officer | Payroll/compensation assignment | Payroll processing and salary records | No automatic grievance or disciplinary access |
| Recruitment Panel | Assigned vacancy | Candidate review, score and comments | Cannot browse unrelated applicants or edit final HR records |
| Auditor | Approved audit scope | Read-only review and audit logs | Export limited; access time/case may be restricted |
| System Administrator | Technical system scope | Technical configuration and service operations | No automatic HR-content access |
## 6. Separation of duties
- A user should not approve their own request or transaction where a second-person approval is required.
- The creator of a sensitive case should not be its sole final approver.
- Payroll changes should have independent verification where applicable.
- Recruitment scoring and final appointment authority should be separated according to institutional policy.
- Emergency access should require reason, be time-limited and be audited.
## 7. Delegation and temporary access
- Delegation records include grantor, delegate, permissions, scope, start/end, reason and approval.
- Automatically expire access at the end date.
- Delegation must not exceed the grantor's authority or bypass restricted permissions.
- Pending tasks should be reassigned or delegated explicitly when an approver is unavailable.
## 8. Access review
HR and security administrators should periodically review roles, assignments, expired access, privileged users, inactive accounts and high-risk permissions. The system should record review completion and decisions.
