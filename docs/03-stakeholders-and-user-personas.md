# 03 — Stakeholders and User Personas
## 1. Stakeholder groups
| Stakeholder | Main interests | System needs |
|---|---|---|
| University leadership | Oversight, workforce risks and decisions | Summary dashboards, institution-level reports, approvals within authority |
| Central HR | Accurate records and efficient service | Full HR workflows, staff files, task queues and reporting |
| HR officers | Daily processing | Create/update records, verify documents, process assigned cases |
| Deans/faculty administrators | Faculty staffing and approvals | Faculty-scoped staff, requests and staffing views |
| HODs | Department staffing and day-to-day supervision | Department staff, leave, appraisal and assigned approvals |
| Supervisors/line managers | Team support and performance | Direct-report views, reviews, approvals and reminders |
| Employees | Personal information and HR services | Own profile, leave, requests, documents, notifications and history |
| Recruitment panels | Fair and documented selection | Assigned vacancy, candidate files, scorecards and panel records |
| Applicants | Clear application process | Careers portal, application submission and status communication |
| Internal auditors | Accountability and evidence | Read-only access to approved audit scope and logs |
| Technical administrators | Reliability and platform security | System configuration, operations and troubleshooting without automatic HR-data privilege |

## 2. Personas
### HR Director
Needs institution-wide HR visibility and decision queues. Can perform authorized HR management functions but sensitive case access should still be explicitly granted.
### HR Officer
Processes staff records and transactions within assigned duties. Needs fast search, document checks, queues and clear validation.
### Dean / Faculty Administrator
Views faculty workforce information and handles delegated faculty workflows. Must not see institution-wide salary or confidential complaints by default.
### HOD
Manages department-level requests, staffing needs, leave approvals and assigned performance reviews. Access is limited to department scope and specific permissions.
### Supervisor
Works with direct reports, receives tasks and submits appraisals. Scope follows current reporting assignments.
### Employee
Views own record, submits requests, applies for leave, tracks approvals, receives notifications and updates permitted fields.
### Recruitment Panel Member
Reviews only candidates and vacancies assigned to the panel, records scores and comments, and cannot browse unrelated applicants.
### Internal Auditor
Read-only, time-bounded or case-scoped access for audit duties. Exports are separately permissioned and logged.
### System Administrator
Maintains application configuration and technical operations. Technical access does not automatically grant access to confidential HR content.
## 3. Access design principle
Personas are examples, not hard-coded permissions. Actual access is assigned through roles, granular permissions, scope, record assignment and contextual restrictions.
