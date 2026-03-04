-- 014: Managed Roster — creators on retainer per brand
-- Distinguishes "managed" creators from all scraped affiliates

CREATE TABLE IF NOT EXISTS managed_roster (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  creator_handle TEXT NOT NULL,
  creator_name TEXT,
  retainer_amount NUMERIC,
  retainer_currency TEXT DEFAULT 'USD',
  retainer_period TEXT DEFAULT 'monthly',
  start_date DATE,
  end_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT managed_roster_unique UNIQUE (tenant_id, brand_id, creator_handle)
);

CREATE INDEX idx_managed_roster_tenant ON managed_roster(tenant_id);
CREATE INDEX idx_managed_roster_brand ON managed_roster(tenant_id, brand_id);

-- RLS
ALTER TABLE managed_roster ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON managed_roster
  FOR ALL
  USING (tenant_id = auth.jwt() ->> 'tenant_id')
  WITH CHECK (tenant_id = auth.jwt() ->> 'tenant_id');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_managed_roster_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER managed_roster_updated_at
  BEFORE UPDATE ON managed_roster
  FOR EACH ROW
  EXECUTE FUNCTION update_managed_roster_timestamp();
