# 01 — Project Vision and Scope


## 1. Vision
Build a secure, centralized University HR and Staff Management System that digitizes the staff lifecycle, improves HR service delivery, gives authorized decision-makers reliable workforce information, and gives employees a convenient self-service experience.

## 2. Project purpose
The system replaces fragmented paper-based and manually tracked HR activities with organized digital records, defined workflows, accountable approvals, notifications, reporting, and controlled access to staff information.

## 3. Project setting and assumptions
- One university, treated as one campus in this project.
- A centralized HR department manages institutional HR operations.
- Faculties, schools, directorates, departments and units may have delegated tasks within their assigned scope.
- The system is new; existing records will be entered or created through an approved digitization process rather than migrating from an assumed HR application.
- Academic and non-academic staff are both supported.
- Institutional policies, forms, approval chains and retention rules will be configurable where practical.

## 4. Goals
- Establish a reliable central staff record.
- Digitize recruitment, onboarding, employment, leave, training, appraisal, career progression and exit workflows.
- Reduce repetitive paperwork, lost documents and approval delays.
- Give employees self-service access to their own information and requests.
- Support HR and management with accurate, permission-aware reports.
- Protect confidential staff records through least privilege, audit trails and secure document handling.
- Preserve history when staff, roles, departments or reporting relationships change.

## 5. In scope
- Authentication, user accounts, roles, permissions and scoped access.
- Staff profiles, staff directory, organizational structure and position management.
- Recruitment and applicant tracking, including a public careers/application area.
- Onboarding, probation and contract management.
- Leave and attendance-related records/workflows.
- Employee requests, HR service desk and restricted complaints handling.
- Performance appraisal, training, promotion, transfer and career progression.
- Employee documents and official HR letters.
- Notifications, approvals, dashboards, reports and audit logs.
- Exit, retirement, resignation, termination and clearance.
- Configuration for policies, templates and workflow routing.

## 6. Out of scope for initial delivery
- Full accounting or university finance system.
- Full payroll calculation and payment processing unless selected as a later integration/module.
- Student information, admissions and academic learning systems.
- Multi-campus administration.
- Biometric or GPS attendance collection before policy, privacy and technical review.
- Automated decisions about hiring, discipline, promotion or employee performance.
- AI making binding HR decisions.

## 7. Success indicators
- Authorized staff can find an employee's current record quickly.
- HR transactions have a traceable status, owner and history.
- Employees can submit and track common requests without visiting HR for every update.
- Approval tasks are routed to the correct role and organizational scope.
- Reports reconcile to the underlying records and respect access rules.
- Sensitive records are not exposed to unauthorized users.
- Critical workflows can be demonstrated end-to-end with seeded test data.

## 8. Constraints and principles
- Simple enough for a student to implement and present in stages.
- Secure-by-design, with RBAC enforced on the server—not just hidden in the UI.
- Modular monolith initially; avoid unnecessary microservices.
- Prefer configurable workflows over hard-coded institution-wide assumptions.
- Every important action should have a clear owner, status, and audit history.
- Accessibility, responsive layout and plain-language labels are design priorities.
## 9. Open questions
- Which institutional policies and forms should be represented first?
- Which approval steps are mandatory for each workflow?
- What data retention and archive rules apply?
- Which reports are required by university leadership?
- Is payroll in scope for a later release, and what system would it integrate with?
