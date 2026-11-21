# 04 — Organizational Structure
## 1. Proposed structure
The application should support a configurable institutional hierarchy, for example:
- University
  - Faculty / School
  - Directorate / Office
  - Department
  - Unit / Section (optional)

Not every branch must use every level. The model should support different types of organizational units without requiring a fixed depth.
## 2. Organizational entities
- **Organization:** the university record.
- **Organizational unit:** faculty, school, directorate, department, office, unit or section.
- **Position:** an approved post or job position, optionally linked to a job description and grade.
- **Employee assignment:** person occupying a position or performing a role, with start/end dates and history.
- **Reporting relationship:** employee-to-supervisor relationship, which may change over time.
- **Acting assignment:** temporary appointment with start/end dates and delegated authority if approved.
## 3. Requirements
- Unit names, types, parent relationships and active status are configurable.
- Units may be deactivated rather than deleted when they have history.
- Changes must not rewrite historical employment records.
- The system should record effective dates for organizational changes.
- Employees may have a primary department and, if approved, additional assignments.
- Supervisors and HODs are assigned explicitly; their job title alone does not grant permissions.
- Scope calculations should use current assignments, with historical context available for past transactions.
- Prevent invalid circular parent relationships and reporting loops.
## 4. Example fields
| Field | Description |
|---|---|
| unit_id | Unique identifier |
| unit_name | Display name |
| unit_type | Faculty, Directorate, Department, Unit, etc. |
| parent_unit_id | Parent organizational unit, if applicable |
| head_employee_id | Assigned head, where applicable |
| effective_from / effective_to | Historical validity dates |
| status | Active or inactive |
## 5. Open design decisions
- Can departments belong to more than one faculty?
- Can employees hold concurrent positions?
- What rules govern acting appointments and delegation?
- Who approves changes to the organizational chart?
