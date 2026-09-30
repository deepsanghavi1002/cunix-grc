CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS frameworks (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tenant_frameworks (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  framework_id UUID NOT NULL REFERENCES frameworks(id),
  status TEXT NOT NULL CHECK (status IN ('planning', 'active', 'audit_ready')) DEFAULT 'planning',
  PRIMARY KEY (tenant_id, framework_id)
);

CREATE TABLE IF NOT EXISTS controls (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  owner TEXT NOT NULL,
  frequency_days INTEGER NOT NULL DEFAULT 90,
  status TEXT NOT NULL CHECK (status IN ('passing', 'attention', 'not_started')) DEFAULT 'not_started',
  UNIQUE (tenant_id, external_id)
);

CREATE TABLE IF NOT EXISTS evidence (
  id UUID PRIMARY KEY,
  control_id UUID NOT NULL REFERENCES controls(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('current', 'expiring', 'expired')) DEFAULT 'current'
);

CREATE TABLE IF NOT EXISTS findings (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  control_id UUID REFERENCES controls(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  owner TEXT NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'accepted', 'resolved')) DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO tenants (id, name, slug) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Acme Health', 'acme-health')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO frameworks (id, code, name) VALUES
  ('10000000-0000-4000-8000-000000000001', 'SOC2', 'SOC 2 Type II'),
  ('10000000-0000-4000-8000-000000000002', 'ISO27001', 'ISO 27001:2022')
ON CONFLICT (code) DO NOTHING;

INSERT INTO tenant_frameworks (tenant_id, framework_id, status) VALUES
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'active'),
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'planning')
ON CONFLICT DO NOTHING;

INSERT INTO controls (id, tenant_id, external_id, title, owner, frequency_days, status) VALUES
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'CC6.1', 'Logical access is restricted to authorized users', 'IT Operations', 90, 'passing'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'CC7.2', 'Security events are monitored and investigated', 'Security', 30, 'attention'),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'CC8.1', 'Changes are authorized, tested, and approved', 'Engineering', 30, 'passing')
ON CONFLICT (tenant_id, external_id) DO NOTHING;

INSERT INTO evidence (id, control_id, source, collected_at, expires_at, status) VALUES
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Microsoft Entra', now() - interval '3 days', now() + interval '87 days', 'current'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Microsoft Defender', now() - interval '31 days', now() - interval '1 day', 'expired')
ON CONFLICT (id) DO NOTHING;

INSERT INTO findings (id, tenant_id, control_id, title, severity, owner, due_date, status) VALUES
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'Endpoint-monitoring evidence has expired', 'high', 'Security', CURRENT_DATE + 7, 'open')
ON CONFLICT (id) DO NOTHING;

