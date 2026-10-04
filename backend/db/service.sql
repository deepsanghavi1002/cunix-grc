CREATE TABLE IF NOT EXISTS service_users (id UUID PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS service_memberships (user_id UUID REFERENCES service_users(id), tenant_id UUID REFERENCES tenants(id), role TEXT NOT NULL CONSTRAINT service_memberships_role_check CHECK(role IN ('admin','reviewer','client','employee','auditor')), PRIMARY KEY(user_id,tenant_id));
CREATE TABLE IF NOT EXISTS service_sessions (token_hash TEXT PRIMARY KEY, user_id UUID REFERENCES service_users(id), expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS service_records (id UUID PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(id), kind TEXT NOT NULL, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS service_records_tenant ON service_records(tenant_id,kind);
ALTER TABLE service_records ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS service_stages (
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key)
);
CREATE TABLE IF NOT EXISTS service_events (id UUID PRIMARY KEY, tenant_id UUID REFERENCES tenants(id), actor_id UUID REFERENCES service_users(id), action TEXT NOT NULL, record_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS service_files (record_id UUID PRIMARY KEY REFERENCES service_records(id), tenant_id UUID REFERENCES tenants(id), filename TEXT NOT NULL, content BYTEA NOT NULL, checksum TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS service_versions (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  record_id UUID NOT NULL REFERENCES service_records(id),
  actor_id UUID NOT NULL REFERENCES service_users(id),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS service_acknowledgements (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  record_id UUID NOT NULL REFERENCES service_records(id),
  user_id UUID NOT NULL REFERENCES service_users(id),
  version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(record_id,user_id,version)
);

CREATE TABLE IF NOT EXISTS service_programs (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id),
  profile JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_run_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS service_sites (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS service_routines (
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  key TEXT NOT NULL,
  data JSONB NOT NULL,
  PRIMARY KEY(tenant_id,key)
);
CREATE TABLE IF NOT EXISTS service_signals (
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  key TEXT NOT NULL,
  data JSONB NOT NULL,
  PRIMARY KEY(tenant_id,key)
);
CREATE TABLE IF NOT EXISTS service_monitor_runs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS service_runs_tenant ON service_monitor_runs(tenant_id,created_at);
CREATE TABLE IF NOT EXISTS service_collectors (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id),
  token_hash TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS service_observations (
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  key TEXT NOT NULL,
  data JSONB NOT NULL,
  PRIMARY KEY(tenant_id,key)
);

-- Employees have an explicitly restricted API surface; existing memberships remain unchanged.
ALTER TABLE service_memberships DROP CONSTRAINT IF EXISTS service_memberships_role_check;
ALTER TABLE service_memberships ADD CONSTRAINT service_memberships_role_check CHECK(role IN ('admin','reviewer','client','employee','auditor'));
CREATE TABLE IF NOT EXISTS service_guide_turns (
 id UUID PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(id), user_id UUID NOT NULL REFERENCES service_users(id),
 request_id UUID NOT NULL, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,user_id,request_id)
);
CREATE INDEX IF NOT EXISTS service_guide_tenant ON service_guide_turns(tenant_id,user_id,created_at);
CREATE TABLE IF NOT EXISTS service_task_comments (
 id UUID PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(id), task_id UUID NOT NULL REFERENCES service_records(id),
 actor_id UUID NOT NULL REFERENCES service_users(id), body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_invitations (
 id UUID PRIMARY KEY,
 tenant_id UUID NOT NULL REFERENCES tenants(id),
 email TEXT NOT NULL,
 name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('reviewer','client','employee','auditor')),
 token_hash TEXT NOT NULL UNIQUE,
 created_by UUID NOT NULL REFERENCES service_users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 expires_at TIMESTAMPTZ NOT NULL,
 accepted_at TIMESTAMPTZ,
 accepted_by UUID REFERENCES service_users(id),
 revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS service_invitations_tenant ON service_invitations(tenant_id);
