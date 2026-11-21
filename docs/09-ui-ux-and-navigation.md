# 09 — UI/UX and Navigation
## 1. Design goals
Clear, consistent, responsive and accessible. Users should see the tasks they are allowed to perform without being overwhelmed by menus. UI visibility is not a security boundary; API permissions must also be enforced.
## 2. Main layout
- Top bar: university branding, search, notifications, help, profile and session menu.
- Sidebar: role- and permission-aware modules.
- Main area: page title, breadcrumb, filters, primary action, content and pagination.
- Responsive behavior: sidebar collapses on smaller screens; tables provide usable mobile alternatives.
## 3. Proposed navigation
- Dashboard
- Staff / Employee Directory
- Organization
- Recruitment / Careers
- Onboarding
- Leave
- Attendance (if enabled)
- Requests & Complaints
- Performance
- Training
- Promotion & Career
- Contracts
- Documents
- Reports
- Notifications
- Administration / Access / Settings (authorized users only)
## 4. Dashboard concepts
**HR Director:** headcount, academic/non-academic totals, hiring/leavers, contracts nearing expiry, probation, pending approvals, recruitment, appraisals and restricted workload indicators.
**HR Officer:** task queue, add staff, onboarding, requests, contract alerts, document verification and quick actions.
**Dean:** faculty workforce summary, vacancies, leave/approval queue, training and appraisal progress.
**HOD:** department staff, pending leave, assigned appraisals, staffing requests and contract reminders.
**Employee:** profile completion, leave balance, submitted requests, documents, appraisal tasks, training and notifications.
## 5. Page patterns
- Tables: search, filters, sort, pagination, status chips, permitted row actions and export only where allowed.
- Forms: grouped fields, clear validation, save draft, submit, confirmation for high-impact actions.
- Detail pages: overview, related records, documents, timeline and workflow history.
- Approvals: request summary, evidence, decision, comment and approve/reject actions.
- Documents: upload status, category, verification, expiry and access indicators.
## 6. Accessibility and usability
- Keyboard navigation and visible focus.
- Label every input and provide useful error messages.
- Do not communicate status by color alone.
- Use readable contrast, consistent spacing and responsive layouts.
- Confirm destructive/high-impact actions and explain consequences.
- Keep sensitive information masked until user explicitly opens it with permission.
## 7. UX rules
- Use plain language and consistent status labels.
- Show who owns the next step and whether it is overdue.
- Provide empty states with a useful action.
- Keep employee self-service straightforward.
- Avoid showing confidential case details in cards, previews or notifications.
