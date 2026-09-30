# Cunix GRC

Cunix GRC is a multi-tenant compliance workspace for managing client frameworks, controls, evidence, and remediation work. The first release targets SOC 2 and ISO 27001 readiness for cloud-first clients.

## Included today

- Client tenant workspaces with role-ready data boundaries
- Framework, control, evidence, and finding data model
- Compliance health dashboard with evidence freshness and remediation metrics
- REST API for dashboard data and creating findings
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

The deployment workflow publishes `ghcr.io/<owner>/cunix-grc:<commit-sha>` after CI succeeds on `main`. A self-hosted GitHub Actions runner labelled `cunix-grc` pulls that immutable image and invokes `/home/dhs/apps/cunix-grc/deploy-release.sh`.

Before enabling production deployment, create the runner, configure the production environment, and set the server's `cunix-grc.env` with `DATABASE_URL`, `AUTH_SECRET`, and `APP_ORIGIN`.
