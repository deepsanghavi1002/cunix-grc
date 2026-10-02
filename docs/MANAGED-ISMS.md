# Managed ISMS: implemented workflows

Open the client portfolio, choose a client, then **Guided ISMS & monitoring**. Activate the program as an administrator or reviewer. Activation preserves existing records and is idempotent.

## What is working

- Separate authenticated client workspaces and a central attention queue. Each workspace has its own portal URL; URLs do not confer access. Client roles see only their memberships.
- A coverage index of 93 Annex A controls and 25 management-system topics, using short navigation labels. Existing starter controls are retained; activation adds missing references without duplication. This is not reproduced normative standard text or an automated certification assessment.
- Twelve plain-language guides with steps, expected evidence and mapped references. Organization profile answers personalize editable drafts in the document library. Unresolved decision placeholders block approval. Existing unapproved generated drafts are reused rather than duplicated.
- Site records for offices, remote teams, data centers and cloud locations. Assign recurring routines to a site or all in-scope sites. These are operating locations, not separate hosting deployments or isolated site-level permission boundaries.
- Eight configurable recurring evidence routines: access review, recovery exercise, vulnerability review, supplier review, awareness, risk, management review and internal audit. Owners, due dates, recurrence and site are configurable by reviewers.
- Client submits a document and collection date for the current cycle. Evidence must be approved, current, dated and unchanged since submission. Another reviewer accepts or requests changes. Acceptance retains history and schedules the next cycle. It does not assert that the entire control is effective.
- Server-side hourly metadata monitoring, with due work polled every minute while the API is running. Checks profile completeness, expired/undated approved evidence, coverage, unmapped documents, unresolved placeholders, recurring evidence and overdue remediation. Pausing stops scheduled runs; reviewers can still run a manual check. Durable next-run timestamps survive restarts. Row locks serialize runs per tenant across processes.
- Run history and deduplicated attention signals. The central portfolio shows each client's last run, attention count and due routines. This release uses in-app attention queues, not emailed alerts.
- GitHub branch-protection collector with expiring, revocable, tenant-scoped ingestion credentials. Raw credentials are shown once and only their SHA-256 hashes are stored. Client GitHub credentials never leave the runner. Reports have provenance, observation time, receipt time and a 26-hour freshness threshold. Failure or insufficient permissions is unknown, never pass. No observations means awaiting data, not connected success.

## Demonstration

1. Open **Northstar Demo**, the fictional local workspace. If needed activate its ISMS program.
2. Complete **Profile**: service scope, information, coordinator and sponsor.
3. Open **Guided setup → Describe what you protect → Prepare my draft**.
4. Open the draft in **Document library**, edit its working text and replace every decision placeholder. Save the text, map the control, set evidence validity and request review. Approval of a scope document is distinct from operational evidence for access reviews or backups.
5. Add a site under **Client sites**, then configure a recurring routine for its owner/site.
6. Upload a completed operating record, submit it under **Recurring evidence**, and use a different reviewer account to approve the document and accept the cycle. A single administrator cannot approve their own cycle submission.
7. Run **Monitoring → Run checks now** to update attention signals. Return to **Client workspaces** for the cross-client console.

## GitHub collector setup

1. Activate ISMS, then open **Connections** as a workspace administrator. Create a token and store it as a runner secret. Tokens expire after 90 days. Rotation invalidates the old credential immediately; revocation blocks new reports.
2. Copy `scripts/github-collector.mjs` into the client's repository or trusted runner. Requires Node 22+. Use a controlled schedule (daily recommended).
3. Configure environment variables:

| Variable | Value |
| --- | --- |
| `CUNIX_URL` | Deployed HTTPS application origin; local testing can use `http://localhost:3001` |
| `CUNIX_TENANT` | Workspace ID displayed in Connections |
| `CUNIX_COLLECTOR_TOKEN` | Secret generated in Connections |
| `GITHUB_REPOSITORY` | `owner/repository` |
| `GITHUB_BRANCH` | Branch name; defaults to `main` |
| `GITHUB_TOKEN` | Client-side GitHub credential with repository Contents read access for private repositories; optional for public repositories |

Run `node scripts/github-collector.mjs`. A hosted CI runner cannot reach your laptop's localhost; use a deployed HTTPS endpoint or a local runner. The script performs a read-only GitHub request and reports only the result, not source code or credentials. GitHub endpoint documentation: https://docs.github.com/en/rest/branches/branches#get-a-branch.

An installable daily CI example is provided in [github-collector-workflow.example.yml](github-collector-workflow.example.yml). It is a template, not an enabled workflow in this repository.

The ingestion endpoint is `POST /api/service/collect/:tenantId` with a bearer collector token. It accepts only the supported observation shape, rejects stale/future timestamps, ignores duplicate or older observations and limits authenticated submission bursts to 30 per minute per tenant/process. A production distributed limiter remains needed for horizontally scaled deployments. A token permits result submission only, not document reads or other workspace APIs.

These are client-reported observations. They are not independent attestations, and a protection flag does not prove that a particular review policy is configured correctly. The GitHub connector has automated ingestion tests; a real client connection requires the client's runner credentials and schedule.

## Verification and production boundary

Tests cover catalog completeness, repeat activation, draft deduplication, placeholder approval blocking, tenant and role boundaries, site ownership, recurrence validation, evidence freshness, independent review, modified submission rejection, scheduler pause/resume/due checks, collector authentication, cross-tenant rejection, duplicate reports, stale observations and revocation. Run `pnpm --dir backend test` and `pnpm --dir frontend build`. CI repeats the backend workflows against PostgreSQL.

The local service is functional, but not yet an enterprise-certified deployment. Current boundaries include local/password-based identity, no SSO/MFA or email invitations, database-backed files with a 5 MB upload cap, no malware scanning/OCR service, no independent penetration-test report or disaster-recovery validation, one GitHub check rather than broad cloud/endpoint coverage, and no custom client domains. Human applicability assessment, risk acceptance, operational implementation, audits and certification remain necessary.

Source inspiration: [Sprinto continuous compliance](https://sprinto.com/continuous-compliance/), [Oneleet security/compliance platform](https://www.oneleet.com/compliance-platform), [Vanta service provider console](https://www.vanta.com/partners/service-providers). The implemented scope above describes actual behavior rather than feature parity with those platforms.
