# ISMS working-release sample

The sample workspace is **Northstar Digital — ISMS Sample**. It is a fictional software and managed IT company with deliberately broad scope. It is suitable for a team walkthrough; its records and approvals are simulations, not statements about a real client or ISO certification readiness.

## Release coverage

- All 93 Annex A references and the 25 indexed management topics are applicable in this sample. This does not prescribe universal applicability for real clients.
- Eleven scope areas cover governance/risk, software delivery, cloud services, networks/endpoints, people/remote work, physical locations, suppliers, personal/customer information, continuity, obligations and assurance.
- Five site types: headquarters, delivery office, remote workforce, colocation and cloud.
- The sample contains control records, individual simulated evidence records, six risks, six suppliers, eleven asset groups, policies, training, an audit, seven remediation cases, all six engagement stages and all eight recurring evidence routines.
- Seven deliberate gaps demonstrate pending review, expired records, vulnerabilities, training, supplier reassessment and internal audit. Do not interpret the displayed readiness percentage as an effectiveness assessment.
- Integration inventory stays not connected. No cloud/GitHub observations or successful system checks are fabricated.

## User-supplied reference pack

The target is the private **ISMS 2022.zip** Drive pack: 144 files after removing folder entries and desktop metadata. It contains 118 DOCX, 23 XLSX, two PDF posters and one legacy DOC manual: 39 policies, 25 procedures, 12 processes, seven plans, 30 templates, 22 formats and supporting assessment/manual/overview files.

The repository is public. The originals and extracted source text are imported privately into PostgreSQL; neither is committed to this repository or exposed as a public static asset. The setup script reads the private catalog from the operator's environment. Originals are downloaded through existing authenticated, tenant-scoped file routes.

Reference templates never count as operating evidence or create missing-evidence alerts. They are read-only. **Create working draft** produces a separate editable record, substitutes the company name where supported, flags unresolved placeholders and preserves the original. Repeated requests reuse an unapproved draft. A reviewer still confirms applicability, actual practice and evidence validity before approval. XLSX uploads support completed spreadsheet records; the legacy DOC original remains downloadable and its supplied extracted text supports draft creation.

## Team walkthrough

1. Sign in to CUNIX GRC and select **Northstar Digital — ISMS Sample**.
2. Open **Guided ISMS & monitoring → Scope areas** to understand the boundary, then **Control coverage**.
3. Open **Reference pack**, then the document library's **Reference templates** tab. Preview or download an original. Use **Create working draft** to adapt it without changing the reference.
4. In **Working documents**, complete a draft, map a control, set validity, and request reviewer approval. Inspect existing sample evidence and the deliberately expired/pending cases.
5. Review risks, assets, vendors, policies and training in **Registers**. Review the engagement stages, recurring requests and monitoring attention queue.
6. Create an audit for the selected period and download its package. Only treat replaced, real operating evidence as client evidence.

## Operator setup

After deploying the committed image, place the catalog and originals in a private import directory inside the running container. Run:

```sh
ISMS_REFERENCE_CATALOG=/tmp/isms-reference/catalog-private.json \
ISMS_REFERENCE_ROOT=/tmp/isms-reference \
node src/sample-client.js
```

The setup transaction uses the existing administrator, creates only the fixed sample slug, verifies original checksums and size limits, and returns the existing workspace on subsequent runs. It never resets subsequent team edits or modifies other clients. The configured master identity can access it through the existing membership mechanism; other users require explicitly assigned workspace membership.

Back up PostgreSQL before the initial import. Imported files persist with the database, so its backups include the source library. Removing/resetting the sample is a separate maintainer action, not an automatic deployment step.

## Acceptance and boundaries

Backend tests cover full reference coverage, sample idempotence, preservation of edits, reference exclusion from readiness, immutable originals, deduplicated drafts, placeholder approval blocking, tenant isolation, auditor permissions, profile metadata preservation and XLSX extraction. Playwright covers sample sign-in, scope/reference navigation, template-to-draft creation, preserved originals and mobile visibility against disposable data. CI also exercises backend workflows against PostgreSQL.

Oneleet evidence/policy journeys, Sprinto's scoped ISMS/evidence model and Vanta's scope/risk/applicability checklist informed the connected workflow. This release does not claim their integration coverage or security automation. Formal risk acceptance, full corrective-action effectiveness workflows, broader collectors, notifications, OCR, malware scanning and disaster-recovery validation remain additional work.
