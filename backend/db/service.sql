CREATE TABLE IF NOT EXISTS service_users (id UUID PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS service_memberships (user_id UUID REFERENCES service_users(id), tenant_id UUID REFERENCES tenants(id), role TEXT NOT NULL CHECK(role IN ('admin','reviewer','client','auditor')), PRIMARY KEY(user_id,tenant_id));
CREATE TABLE IF NOT EXISTS service_sessions (token_hash TEXT PRIMARY KEY, user_id UUID REFERENCES service_users(id), expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS service_records (id UUID PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(id), kind TEXT NOT NULL, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS service_records_tenant ON service_records(tenant_id,kind);
CREATE TABLE IF NOT EXISTS service_events (id UUID PRIMARY KEY, tenant_id UUID REFERENCES tenants(id), actor_id UUID REFERENCES service_users(id), action TEXT NOT NULL, record_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS service_files (record_id UUID PRIMARY KEY REFERENCES service_records(id), tenant_id UUID REFERENCES tenants(id), filename TEXT NOT NULL, content BYTEA NOT NULL, checksum TEXT NOT NULL);
