# Cunix GRC: delivery plan and functionality

This release implements several connected compliance workflows inspired by Sprinto. It is an early service, not equivalent to Sprinto's mature integration and automation platform. No ISO certification or auditor acceptance is implied by the readiness score.

## Delivered functionality

| Capability | Working behavior | Limit |
| --- | --- | --- |
| Client onboarding | Cunix admin creates separate workspaces, assigns client/reviewer/auditor accounts, and switches clients | Initial passwords are shared manually; no emailed invitations or recovery |
| Scope and controls | Scope records, owner assignment, implementation status, applicability rationale and downloadable statement | 12 illustrative ISO 27001:2022 controls, not the full standard |
| Document processing | PDF/DOCX/text extraction, private originals, control mapping, reviewer decisions and expiry dates | Scanned documents require external OCR; extraction does not assess conformity |
| Evidence governance | Changing approved evidence content, mapping or expiry invalidates approval; previous record versions are retained | Original uploaded files are immutable; updated files are separate evidence records |
| Readiness | A control needs current approved evidence, confirmed implementation, and no open remediation tasks | Does not automatically verify the contents or audit period relevance |
| Evidence monitoring | Reviewer-triggered run creates seven-day remediation tasks for gaps; repeat runs do not duplicate open requests | On demand, not a background schedule; no live cloud checks |
| Risk assessment | Validated 1–5 inherent/residual likelihood and impact; calculated scores and ratings; treatment description | No automatic risk signals or formal acceptance approval |
| Policy acknowledgements | Members acknowledge published policy versions; content changes create drafts requiring fresh acknowledgement | No email campaigns or employee directory sync |
| Audit preparation | Period-scoped audit engagements generate per-control evidence requests; auditor reads packages containing evidence, history and requests | JSON package; originals downloaded individually; no auditor portal invitations |
| Access and activity | Authenticated tenant membership, read-only auditors, reviewer-only governance, event log and revision history | No SSO/MFA; additional production hardening needed |
| Registers | Assets, vendors, training, integrations and tasks stored per workspace | These remain basic registers, not automated provider connections or training delivery |
| CI/CD | Backend tests, frontend build, database migration and container smoke check; immutable image publication | Production needs configured infrastructure and an enabled self-hosted runner |

## Client demonstration

1. Register a Cunix admin or sign in. Under **Members**, create a client workspace, then create client and reviewer accounts in that workspace.
2. Define the services, locations, systems, information and boundaries under **Scope**.
3. In **Readiness**, review applicability. Excluding a control requires justification. Use **Controls** to assign implementation status.
4. Client uploads documents under **Documents** and maps each to its control. In **Readiness**, set an evidence expiry date.
5. Reviewer inspects the extracted text and original file, records a review note, and approves the evidence under **Documents**. Approval is a human decision.
6. Run monitoring under **Readiness**. Address generated tasks under **Tasks**, then resolve them. Expired evidence and open tasks continue to block readiness.
7. Record inherent and residual risk scores under **Risks**. Publish policies under **Policies**; clients acknowledge their current versions under **Readiness**.
8. Create an audit engagement under **Readiness**. Each applicable control gets an evidence request. Review period relevance, resolve requests, and download the engagement package. Use an auditor account for read-only access.

## Next implementation phases

1. **Production foundation:** managed PostgreSQL, encrypted object storage, backups/restore drills, file scanning and isolated extraction, SSO/MFA, password recovery, expiring invitations, stronger abuse controls and retention settings.
2. **Continuous collection:** OAuth installation and credential vault; start with GitHub branch protection and identity access reviews; signed ingestion, scheduled jobs, provider-specific check results, retry/backoff and evidence lineage. A named integration alone must never count as connected.
3. **Broader compliance:** complete licensed framework libraries and mappings, approval workflows for risk acceptance, recurring policy campaigns, vendor reviews, employee training delivery, and auditor request discussions.
4. **Service operations:** worker queues, observability, tenant quotas, database migration versioning, penetration testing, disaster recovery and documented operational ownership.

## Research basis

- [Sprinto continuous monitoring](https://sprinto.com/products/continuous-monitoring/): connected systems, current evidence and remediation.
- [Sprinto risk management](https://sprinto.com/products/risk-management/): risk assessment and treatment tied to compliance work.
- [Sprinto evidence workflows](https://docs.sprinto.com/audits/evidences/how-it-works): collection, organization and review.
- [Sprinto audits](https://docs.sprinto.com/audits/overview): audit engagements and evidence coordination.

## Verification

Automated tests cover tenant isolation, reviewer permissions, approval invalidation, evidence freshness, open-task blocking, monitoring deduplication, applicability rationale, version-specific acknowledgement, risk bounds, audit packages and additional-client creation. Frontend production build is checked. A production deployment and full browser acceptance test are not established by those checks.
