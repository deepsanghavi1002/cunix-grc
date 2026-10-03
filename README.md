# Client portal and AI journey guide

See [the client portal walkthrough](docs/CLIENT-PORTAL.md) for new/existing journeys, restricted employee access, task review and Fireworks/DeepSeek guidance.

The [working-release sample guide](docs/SAMPLE-CLIENT.md) describes Northstar Digital, its broad ISMS scope, private reference library and team walkthrough.

# Cunix GRC

The [managed ISMS guide](docs/MANAGED-ISMS.md) covers the guided client portal, 118-topic coverage index, personalized document drafts, recurring evidence reviews, scheduled monitoring, client site records and GitHub collector. Start at **Client workspaces → Guided ISMS & monitoring**.

See the [feature checklist and execution roadmap](docs/FEATURES.md) for delivered workflows, client onboarding, demo steps and remaining production work. The [service guide](docs/SERVICE.md) describes authentication, uploads and deployment limitations. The previous unauthenticated demo APIs are disabled.

Cunix GRC is a multi-tenant compliance workspace for controls, evidence and remediation. This release provides an illustrative ISO 27001:2022 starter workflow; it does not include a complete licensed framework library or certification assessment.

## Included today

- Isolated client workspaces and admin, reviewer, client and read-only auditor roles
- Document uploads, extraction, review, expiry and revision history
- Evidence-based readiness, applicability statements and on-demand remediation monitoring
- Inherent/residual risk scores and version-specific policy acknowledgements
- Audit engagements, control evidence requests and audit package exports
- Docker-based local development and production images
- GitHub Actions validation, GHCR publishing, and self-hosted deployment workflow

## Local development

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Open `http://localhost:5173`. The API health endpoint is `http://localhost:3001/api/health`.

For direct development, start PostgreSQL first, then run `pnpm install` and `pnpm run dev` in both `backend` and `frontend`.

## Production

The deployment workflow publishes `ghcr.io/<owner>/cunix-grc:<commit-sha>` after CI succeeds on `main`. A self-hosted GitHub Actions runner labelled `cunix-grc` pulls that immutable image and invokes `/home/dhs/apps/cunix-grc/deploy-release.sh`. Production binds only to loopback and the CUNIX Tailscale address on port `8082`; publish it externally through the Cloudflare Tunnel route rather than opening the port on the router.

Before enabling production deployment, create the runner, configure the production environment, and set the server's `cunix-grc.env` with `DATABASE_URL` and `APP_ORIGIN`. Set repository variable `ENABLE_DEPLOY=true` only when that infrastructure is ready. Sessions are stored in PostgreSQL. Follow the production foundation roadmap before onboarding real client documents.

GRC sign-in accepts authenticated CUNIX accounts without requiring an `email_verified` claim or a separate email-verification step. The identity provider must still return an email and subject; the corporate-domain restriction and workspace permissions remain enforced.
