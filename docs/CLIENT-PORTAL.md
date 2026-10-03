# Client portal and AI journey guide

## What is delivered

A browser-based Client home for CUNIX consultants and the client's compliance team, and a restricted My compliance tasks home for employees. The same maintained application serves every workspace. Existing templates, registers, evidence cycles and audits remain connected through journey shortcuts.

New clients created in the console have the ISMS index activated automatically. Client home offers two starting points: a new implementation or an existing implemented ISMS. Choosing one creates four initial actions once, preserves all existing records, and records the starting point. The six journey sections connect scope/baseline, owners/registers, documents/evidence, recurring operation, audits/management review and improvement. Task completion is not automatically an approval of an engagement stage or an ISO requirement.

Each action has a named account owner, due date, instructions, discussion and review status. Legacy tasks appear on the board but must be explicitly assigned to an account before they appear for an employee. Free-text owner names do not grant employee access.

## Access and URLs

Open `https://grc.cunixinspire.com`. Client/employee users with one workspace land in Client home automatically. Consultants select an authorized client from their portfolio.

Use **Copy client portal URL** to share a readable authenticated entry of the form `https://grc.cunixinspire.com/#/client/<client-slug>`. A link does not grant membership. Unknown or unauthorized client slugs reveal only the user's own portfolio, not another client's data. Per-client DNS subdomains such as `customerabc.cunixinspire.com` are not configured by this release.

Under **People & access**, a CUNIX administrator creates a named account with one of these roles:

- **Client:** coordinate actions and records; create/assign tasks and submit work; cannot make reviewer decisions.
- **Employee:** see only explicitly assigned tasks and published workspace policies; submit task notes/evidence and acknowledge policies; cannot read general documents, registers, member lists, exports or integration settings. API restrictions apply even when a URL is typed directly.
- **Reviewer:** review evidence and submitted tasks, and perform existing governance workflows.
- **Auditor:** read-only workspace access. Time- and engagement-limited auditor invitations remain future work.
- **Administrator:** existing workspace administration and review privileges. Employees never receive this role by default.

Production public self-registration is disabled unless the operator explicitly sets `ALLOW_SELF_REGISTRATION=true`. Accounts are provisioned by CUNIX. Local customer email sign-in is available; central OIDC retains its existing identity restrictions. Self-service invitations, account recovery and customer-specific IdP configuration are not delivered here. Share initial credentials through an approved private channel, not in task notes.

## Daily work and review

1. Coordinator creates or assigns a task and sets its due date.
2. Employee/control contributor opens their task, reads the instructions, starts work and adds discussion where needed.
3. Attach a PDF, DOCX, XLSX, TXT, Markdown or CSV record up to 5 MB. The original is stored privately and extracted text is available for review. New task evidence is never sent to the AI provider automatically. The task view links only its attached evidence; previous evidence records remain in the full library.
4. Describe the performed work and **Submit for review**.
5. A different reviewer checks the record and original. They explicitly approve unapproved attached evidence with a decision note before **Accept and complete**, or **Request changes**. A reviewer cannot accept their own submission.
6. Completion records history. A reviewer can reopen work. Existing recurring evidence-cycle acceptance remains a separate action under Recurring evidence; closing a task does not silently close a cycle, accept risk or approve a control.

Current policies can be read and acknowledged from Client home. A changed published version requires a new acknowledgement. This is not a training delivery engine, and acknowledgement alone does not prove understanding or competence.

## Fireworks/DeepSeek connection

The GRC backend uses `FIREWORKS_API_KEY` and `FIREWORKS_MODEL` from its private server environment. The current deployment reuses the authorized Fireworks connection from Leads, without sharing Leads data or making the browser call the provider. `FIREWORKS_API_URL` is an operator-controlled endpoint override used for disposable test providers. Never commit or display the key.

A CUNIX administrator/reviewer enables the guide for each workspace. The enable/disable decision is audited. The provider receives the user's question, recent personal guide conversation, scope/service metadata, task instructions/status/dates, published-policy titles and acknowledgement status, recorded readiness counts and routine status. It does not receive uploaded originals, document contents, member email lists or other client workspaces. Questions themselves may contain whatever the user types; do not paste unnecessary confidential or personal data.

Employee context includes only their personal tasks and policy obligations. Chat history belongs to the current user and client, and broader-role history is withheld from an employee view. For consultants, the guide uses the selected client, not every client's records in one prompt.

The guide explains steps, proposes new actions and can suggest revised instructions or due dates for existing open tasks. It cannot execute commands, change applicability, accept risks, approve evidence, close tasks, add users or issue a certification verdict. Suggestions are validated and mapped only to known workspace task/control references.

### Turn suggestions into work

- Ask a question, then select useful proposed actions and a real owner. **Add selected tasks** creates the actions; exact-title duplicates of open tasks are skipped and repeat clicks do not create them again.
- **Apply suggested updates** changes only proposed instructions/dates. If a task changed, received newer discussion, entered review or was completed, application is blocked and the user asks for a refreshed plan.
- **Undo added tasks** removes only untouched proposed actions. **Undo task updates** restores only unchanged applied instructions/dates. Later edits, evidence, decisions or discussion are preserved; a conflicting batch is rejected rather than partly discarded.
- Provider failures leave existing tasks and records unchanged. The task board works without AI. Responses are bounded, requests time out and per-user request limits apply. In-flight/attempt limiting is process-local; a distributed limit is needed if the API scales to multiple instances.

## Suggested operating practice for CUNIX

At onboarding, choose the actual starting point and ask: **“We already have an implemented ISMS. Help us review the baseline and assign the next four actions without recreating valid documents.”** For a new client: **“Help me turn our scope discussion into practical actions; ask what information is missing.”**

At each coordination meeting, open the selected client's board and ask: **“Explain the overdue work, identify blockers and propose the next week's actions. Do not move deadlines just to clear overdue status.”** Assign proposals to actual owners, adjust dates where necessary, and review the results with the client. Request evidence clarification through task discussion. Review and audit decisions remain with people.

Customers can ask: **“Explain this assigned task in five simple steps and tell me what record I should submit.”** Coordinators can ask: **“We completed implementation. Plan the next month using our existing tasks and recurring reviews.”** Employees can ask: **“Which of my obligations should I do first?”**

The guide has recorded metadata, not an independent view of a client system or original document. Questions requiring a technical verification or content assessment should direct the person to the actual evidence or consultant rather than invent a conclusion.

## Verification and remaining scope

Backend coverage includes new/existing setup idempotence, employee API isolation and assignment removal, invalid/foreign owners, dated tasks, private task files, self-review blocking, explicit evidence approval, policy acknowledgements, mocked provider failure, structured-output validation, per-user/client chat, idempotent suggestion application, stale-update rejection and guarded undo with later discussion preserved.

Playwright uses disposable records and a mock provider to exercise client URLs, journey setup, suggested actions/undo, employee login and submission, independent reviewer completion, and the previous private-reference workflows. CI repeats integration tests on PostgreSQL and checks the container.

Production verification uses the real configured provider against the fictional sample only, and verifies live application pages/files with a temporary existing-admin session. That does not constitute a new customer SSO acceptance test. Do not upload real customer material into testing without authorization.

This increment delivers the client/task/guide foundation. Email/Teams/Slack reminders, directory sync, delivered training, broad cloud/endpoint monitoring, formal risk acceptance, complete incident/corrective-action effectiveness workflows, scoped auditor invitations, full customer recovery/invitation flows and the security/restore controls listed in CLIENT-CONTINUOUS-COMPLIANCE.md remain separate implementation work. AI does not substitute for these modules.
