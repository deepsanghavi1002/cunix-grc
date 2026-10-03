# CUNIX client continuous-compliance product blueprint

Status: product and architecture specification, updated 2026-10-03. The client-home, employee, task-review and AI-guide increment is described in CLIENT-PORTAL.md. This document does not mean its proposed features are implemented or deployed. The working release remains described in SAMPLE-CLIENT.md and MANAGED-ISMS.md.

## Product model

CUNIX provides a browser-based continuous ISMS service. Each client has a private workspace that supports both initial implementation and ongoing operation after implementation or certification. The client owns operational decisions and business risks; CUNIX facilitates implementation and performs authorized review. Independent auditors retain their separate assurance role.

Use one maintained application with three primary experiences and a restricted auditor view:

| Experience | Intended user | Home page and permitted work |
| --- | --- | --- |
| Client compliance portal | Client ISMS coordinator, management and assigned control owners | Organization health, upcoming activities, assigned tasks, evidence, registers, approvals appropriate to role and management reporting |
| Employee portal | General employees and contractors | Own policy acknowledgements, training, assigned actions, incident reporting and approved requests; no general access to risk registers, sensitive evidence or other personnel records |
| CUNIX consultant console | Authorized consultants and reviewers | Assigned-client portfolio, overdue work, review queue, guidance, client configuration and engagement oversight |
| Auditor view | Explicitly invited independent auditors | Read-only, time- and engagement-scoped evidence and audit requests; no operational approval or tenant administration |

Client coordinators, control owners, employees, CUNIX reviewers and auditors need distinct permissions. New employees must not receive broad editor/admin permissions. Consultant access is an explicit, auditable client assignment. Do not copy the broad default-access policy from the unrelated Leads app.

## Browser URLs

Current working origin: https://grc.cunixinspire.com, with authenticated workspace routes of the form `/#/workspace/<workspace-id>/isms`. Current client workspace access is enforced by server-side membership, not by knowing the URL.

Recommended first-release entry: keep `grc.cunixinspire.com` as the canonical origin, and land each user in their assigned client or a picker if several are assigned. Consultants use the portfolio on the same origin. No desktop software or Tailscale installation should be required for an externally reachable, authorized customer portal.

Proposed branded client entry: `https://customerabc.cunixinspire.com`. This is an optional alias and is not presently configured. Reserve names already used by other CUNIX applications. A longer product-specific namespace can avoid collisions, but adds certificate/DNS complexity. Neither a friendly path nor a subdomain needs a separate application container.

Prefer branded aliases that redirect to the canonical application's assigned workspace initially. If the app later stays on tenant subdomains, add an explicit verified domain-to-tenant registry, HTTPS for every hostname, trusted host routing, tenant-aware login return validation, exact registered OIDC callbacks, host-scoped cookies and logout behavior. Unknown hosts must fail closed. Do not dynamically trust Host/X-Forwarded-Host or accept arbitrary login return URLs.

A hostname selects context; every API, file, search, export, background job and future AI operation must independently verify identity, current membership and permissions. A subdomain is not a data-isolation control. Test direct cross-client API/file access and connection reuse; add database-layer isolation appropriate to the deployment. Do not use a domain-wide session cookie across unrelated CUNIX apps.

Public hostname availability does not publish evidence. The login page can be reachable on the internet while all records require authorization. If a client chooses a private-only deployment, arrange its corporate network/VPN/private access separately. A public DNS name alone does not make a private server reachable.

## Complete ISMS product scope

| Module | Required operating workflow | Present release boundary |
| --- | --- | --- |
| Onboarding and scope | Choose new implementation or existing ISMS; define entities, sites, services, information, boundaries, people and responsibility; import baseline; authorize consultant access | Workspaces, profiles, sites and manual membership exist; new/existing journey selection and starter actions now exist; invitations and broader imports need work |
| Controls and applicability | Maintain applicability, exclusions, owners, implementation, framework mappings and revision history; keep Statement of Applicability aligned with scope and risks | 93 Annex A references, 25 management topics and applicability records exist; complete lifecycle and reuse across frameworks need work |
| Policies and documents | Template to controlled draft, review, approval, publishing, version-specific acknowledgement, periodic review and supersession | Private sample library, working drafts, approval checks and versioned acknowledgements exist; broader campaigns and document lifecycle need work |
| Evidence and recurring activities | Request by control/site/period; reuse qualified evidence across applicable requirements; collect original, source, timestamps and provenance; independent review; renewal and history | Manual upload/review, freshness, eight routines and cycle history exist; evidence is currently mapped to one control record; many-to-many reuse and richer period/provenance models need work |
| People and competence | Directory sync/import, joiner/mover/leaver activities, policy acknowledgement, training, competence and access responsibilities | Membership and training records exist; directory sync, restricted employee portal exists; directory sync and delivered training need work |
| Assets and technical checks | Discover/import systems; classify and assign owners; connect approved integrations; test actual configuration; route failed or unknown checks to owners | Asset registers and one GitHub branch-protection collector exist; broad cloud, identity, endpoint and ticketing connectors do not |
| Access governance | Access requests, periodic entitlement reviews, decisions, revoked-access evidence and controlled exceptions | Recurring access-review evidence exists; live entitlements, request approvals and revocation verification need work |
| Risk management | Defined methodology, inherent/residual assessment, treatment actions, business-owner acceptance, expiry and reassessment | Scoring and treatment descriptions exist; formal acceptance, expiry and treatment approval need work |
| Supplier assurance | Inventory, criticality, due diligence, agreements, security evidence, reviews, findings and renewal | Vendor register and supplier-review cycle exist; full supplier lifecycle and external questionnaire workflow need work |
| Incidents and corrective action | Restricted reporting, triage, response timeline, containment/recovery, lessons, root cause, corrective action and independent effectiveness review | Generic remediation tasks exist; incident lifecycle and full corrective-action effectiveness flow need work |
| Continuity and recovery | Business-impact analysis, approved recovery objectives, plans, exercise schedules, results, follow-up and management decisions | Sites, reference plans and recurring recovery evidence exist; structured BIA, exercises and recovery objective tracking need work |
| Legal and privacy obligations | Applicable obligations and contracts, responsible owners, review dates and relevant information-handling actions | Scope/register foundation exists; dedicated obligations and privacy workflow need work |
| Management oversight | Objectives, measurements, dashboards, management-review inputs, decisions, actions and review history | Management topics and recurring review exist; structured objectives/KPIs and management decision records need work |
| Audits and certification lifecycle | Audit program, independence, period/site/requirement sampling, requests, findings, nonconformities, follow-up, certification/surveillance dates | Audit engagements and JSON exports exist; scoped auditor invitations, full findings lifecycle and bundled originals need work |
| Collaboration and reminders | Personal work queue, threaded clarification, due reminders, escalation, digest and delivery records | In-app attention and activity exist; assigned-user task queues and discussion exist; email/Teams/Slack notifications need work |
| Customer assurance | Optional approved disclosures, gated documents, questionnaires and public trust profile | Not implemented; never expose the internal evidence library through a public trust page |
| Administration and data lifecycle | Invitations, recovery, IdP/SSO policy, role administration, offboarding, retention/export/deletion, controlled backups and tested restore | Central OIDC, local login, memberships and database persistence exist; self-service client IdP setup, recovery/invitation lifecycle and validated customer restore need work |

## Client journeys

### New implementation

1. CUNIX creates a workspace, chooses the client's ISMS starting point, assigns a coordinator and authorizes named consultants.
2. Coordinator defines the boundary and assigns owners; consultant reviews applicability.
3. Import existing documents; generate missing controlled drafts from selected private templates. Never count a template or unresolved draft as operating evidence.
4. Perform implementation activities and collect dated evidence. Review exceptions and record actual decisions.
5. Complete internal audit, management review and corrective actions; prepare external-audit evidence. The platform does not certify the client.
6. Continue the same workspace through recurring reviews and surveillance periods; no duplicate post-certification workspace is required.

### Existing implemented/certified client

1. Import and review the existing scope, applicability, policies, risk/register baseline, past audits and certificate dates where applicable.
2. Preserve historical dates and reviews; determine which evidence is still valid for the intended period and scope.
3. Configure owners, integrations, review frequencies and upcoming surveillance/renewal activities.
4. Address baseline gaps and operate the continuous cycle. Do not require unnecessary new drafts of accepted documents.

### Daily experience

An employee sees their own obligations. A control owner sees tasks and failed checks relevant to their assignments. The coordinator sees organizational attention and deadlines. CUNIX sees authorized clients needing review. A routine opens work, the owner performs it, evidence is submitted, an independent reviewer decides, and the next cycle is scheduled with history preserved.

A technical check can run more frequently than a human review. Review frequency is configurable by control, site and risk. Unknown, stale or disconnected sources must not produce a passing result. A dashboard should distinguish implementation, evidence freshness, technical observations, unresolved findings and audit-review state instead of presenting one percentage as certification readiness.

## AI assistance

Use AI to suggest scope-aware drafts, identify missing fields, map candidate evidence, summarize changes and propose clarification or remediation. Reuse verified extracted fields and collected evidence before requesting more. Show the source and basis of suggestions; do not invent evidence or silently approve a control, accept a business risk, change applicability, close an incident or issue a certification verdict. Client content processing needs explicit provider/retention controls and tenant isolation. AI is assistance within the existing workflow, not a second uncontrolled set of registers.

## Working-release priorities and acceptance

1. Client experience and access: explicit client home, personal actions, coordinator and employee roles, named-owner assignment, invitations and canonical URL landing. Test employee object-level access and membership removal against actual backend APIs, not just hidden menus.
2. End-to-end operating loop: evidence reuse, period-aware requests, notifications/escalation, reviewer conversation, policy campaigns, structured risk acceptance, incidents/corrective action, objectives and management review. Test submit/change/review/renewal and failure paths.
3. Verified technical monitoring: selected identity/cloud/source/endpoint integrations with minimally scoped credentials, provenance, freshness, unknown/failure behavior and real-provider tests. Do not label an integration connected based only on an inventory row.
4. Customer launch foundation: private production and test separation, file capacity/scanning/extraction isolation, supported backups and restore drills, access recovery, retention/export/offboarding, observability and operational support. Use fictional or properly authorized data in testing.
5. Audit and optional assurance extensions: period-scoped auditor access, complete findings follow-up, a reproducible package with originals and mapping, and optional gated disclosures.

Before calling the product all-encompassing, walk one non-demo client through onboarding, an employee policy/training obligation, a real-provider failure, evidence review/renewal, formal risk acceptance, incident corrective action, management review, an audit and tenant-scoped export/restore. Verify desktop/mobile behavior, API permissions, cross-client denial and regression checks in CI. Passing synthetic sample data is not sufficient.

## Primary reference research

- Vanta role model and employee portal: https://help.vanta.com/en/articles/11345385-managing-user-roles
- Vanta workspace isolation/configuration: https://help.vanta.com/en/articles/11345360-getting-started-with-workspaces
- Vanta managed-service-provider relationship: https://help.vanta.com/en/articles/11346132-how-to-transfer-an-existing-vanta-account-under-your-partnership
- Sprinto module navigation: https://docs.sprinto.com/dashboard/overview/new-sprinto-app-navigation-ui-overview
- Oneleet evidence, requests and review distinction: https://docs.oneleet.com/compliance/evidence/
- Oneleet actual technical monitoring: https://docs.oneleet.com/compliance/monitors/
- OWASP tenant authorization and isolation: https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html
- OWASP session scoping: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

These references inform the proposed product. Their published functionality is not evidence that CUNIX already provides it. Framework mappings and real-client applicability require consultant validation and appropriately licensed source material.
