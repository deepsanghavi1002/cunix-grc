# Cunix GRC service

## Getting started

Run `docker compose up --build` and open http://localhost:5173. Create a workspace with a company name, administrator name, email and a password of at least 12 characters. Each workspace receives twelve illustrative ISO 27001 controls and a scope record.

Complete Scope with the business services, people, systems, locations and information included in the ISMS. Review applicability and expand the starter controls with your licensed framework content. Add owners and operational evidence. Create client, reviewer and read-only auditor accounts in Members.

## Client document workflow

Clients upload PDF, DOCX, TXT, Markdown and CSV evidence up to 5 MB. The server stores the original in PostgreSQL, records a SHA-256 checksum, extracts text and sets the evidence to review required. Image-only PDFs are marked as requiring OCR. No third-party AI receives the uploaded content.

A Cunix administrator or reviewer selects a control, records a review note and approves the document, or returns it for revision. Clients cannot approve documents. Missing evidence is tracked using Tasks. Each mutation generates a workspace activity entry. Export audit package downloads a JSON register with records and activity; original files remain available via an authenticated download endpoint.

## Implemented modules

Scope, controls, document intake and human review, inherent/residual risk scoring, vendor and asset registers, versioned policy acknowledgements, remediation tasks, training records, integration inventory, user access, revision history, readiness monitoring and audit engagements with evidence requests. See [the current feature checklist](FEATURES.md) for behavior, limitations and demonstration steps. These modules persist data and enforce membership checks on workspace routes.

## Deployment

Use TLS at the reverse proxy and set APP_ORIGIN to the exact HTTPS client origin. Production cookies are Secure, HttpOnly and SameSite=Strict. Database credentials belong in the server environment, not Git. Migrations create the service tables in addition to the legacy demo tables. Legacy unauthenticated APIs have been disabled.

CI executes the workspace-isolation and document-approval integration test, frontend build, PostgreSQL migration and container smoke test. Production deployment requires a configured self-hosted runner, server environment, and the repository variable ENABLE_DEPLOY=true. The workflow installs the supplied deployment script. Deployment is serialized on the server and restores the previous image if health verification fails; database migration rollback is not automatic.

## Current limits

This release is a functional service foundation rather than Sprinto feature parity. Cloud-provider connectors, scheduled automated control tests, OCR, AI analysis, SSO/MFA, email invitations, password recovery, training delivery, complete framework libraries and external certification systems are not implemented. Integration inventory always shows not connected. Readiness monitoring is triggered by a reviewer. Applicability statements cover only the recorded controls; starter controls are not a complete ISO implementation. Audit packages support human review and do not make certification decisions.

Uploads are stored in PostgreSQL; production scale requires malware scanning, extraction isolation, object storage, backup/retention controls and upload capacity limits. Sign-in uses an in-process attempt limit; a shared rate limiter and account recovery are needed before public client rollout. Validate with a dedicated staging environment before real client data is onboarded.
