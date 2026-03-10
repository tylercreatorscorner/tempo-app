-- ============================================================
-- MIGRATION 016: Add tenant_id + RLS to data_freshness
-- ============================================================

ALTER TABLE data_freshness ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE data_freshness SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE data_freshness ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_data_freshness_tenant ON data_freshness(tenant_id);

ALTER TABLE data_freshness ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON data_freshness
  FOR ALL USING (tenant_id = auth.tenant_id());
