# 10 — Security and Privacy
## 1. Security objectives
Confidentiality, integrity, availability, accountability and appropriate use of staff information.
## 2. Information classification
| Class | Examples | Controls |
|---|---|---|
| Public | Job adverts, public policies | Public publishing review |
| Internal | Internal notices, organizational chart | Authenticated access where appropriate |
| Confidential | Employee profiles, contracts, appraisals, salary, personal documents | Scoped permissions, secure storage, audit, masking |
| Highly Restricted | Medical, disciplinary, sensitive grievances, legal matters | Case-specific access, strict audit, minimal exposure |
## 3. Authentication and account security
- Secure password hashing using a modern approved algorithm; never store plaintext passwords.
- MFA for privileged accounts and, where feasible, all users.
- Secure session expiry, logout, revocation and protection against session fixation.
- Login throttling and account recovery controls.
- Account disablement when employment or access ends.
- Avoid shared accounts.
## 4. Authorization
- Enforce least privilege and server-side permission checks.
- Combine roles with scopes, assignment, conditions and dates.
- Separate view, edit, approve, export, download and sensitive-field permissions.
- Restrict salary, medical, complaint and disciplinary records.
- Prevent self-approval and enforce separation of duties.
- Temporary and delegated permissions must expire automatically.
- Technical administrators do not receive HR-content access by default.
## 5. Data and document protection
- Use HTTPS in deployment.
- Encrypt sensitive data at rest where supported and protect encryption keys.
- Store uploads outside publicly served directories; use authorized download checks.
- Validate file type, size and content; scan uploads when possible.
- Avoid exposing file storage keys or predictable paths.
- Mask sensitive identifiers in list views.
- Use secure backups and test restoration.
## 6. Audit and monitoring
Record security and business events including sign-in events, access grants, sensitive record access, changes, approvals/rejections, exports, delegation, emergency access and account changes. Audit entries should be protected from ordinary alteration and include actor, event, target, timestamp and reason where appropriate. Do not log passwords, tokens or unnecessary confidential content.
## 7. Privacy practices
- Collect only data needed for a documented HR purpose.
- Explain collection purpose and access.
- Define retention, correction, archive and deletion rules according to institutional policy and applicable law.
- Limit exports and sharing.
- Use anonymized or aggregated data for demonstrations and testing.
- Do not claim legal compliance without institutional/legal review. Validate applicable Uganda data-protection requirements before deployment.
## 8. Threats to consider
Unauthorized staff-record browsing; privilege escalation; stolen credentials; malicious insider; insecure document upload; accidental export; approval manipulation; API authorization bypass; ransomware; backup compromise; session theft; excessive access by administrators.
## 9. Security response
Maintain a documented incident response process: identify, contain, investigate, recover, communicate, preserve evidence and review. Define responsible owners and reporting obligations before production.
## 10. Minimum security acceptance
No cross-scope access by default; API authorization tested; sensitive exports logged; account deactivation effective; delegation expires; backup restore demonstrated; audit log protected; restricted records inaccessible to unauthorized roles.
