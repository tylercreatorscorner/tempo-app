-- Migration: TikTok API pipeline support
-- Adds data_source column to performance tables, unique constraints for upserts,
-- and populates the tiktok_shop_connections table schema.

-- 1. Add data_source column to track CSV vs API origin
ALTER TABLE video_performance ADD COLUMN IF NOT EXISTS data_source text DEFAULT 'csv';
ALTER TABLE creator_performance ADD COLUMN IF NOT EXISTS data_source text DEFAULT 'csv';
ALTER TABLE product_performance ADD COLUMN IF NOT EXISTS data_source text DEFAULT 'csv';

-- 2. Add tenant_id to performance tables if not present (for multi-tenancy)
ALTER TABLE video_performance ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE creator_performance ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE product_performance ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);

-- 3. Unique constraints for upsert (prevents duplicates on re-run)
-- These use partial unique indexes since some old data may not have these set
CREATE UNIQUE INDEX IF NOT EXISTS video_perf_upsert_idx
  ON video_performance (brand, video_id, report_date, period_type)
  WHERE video_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS creator_perf_upsert_idx
  ON creator_performance (brand, creator_name, report_date, period_type)
  WHERE creator_name IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS product_perf_upsert_idx
  ON product_performance (brand, product_id, report_date, period_type)
  WHERE product_id IS NOT NULL;

-- 4. Ensure tiktok_shop_connections table has the right schema
-- (Table may already exist from original schema; adding missing columns)
CREATE TABLE IF NOT EXISTS tiktok_shop_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  brand text NOT NULL,
  shop_id text NOT NULL,
  shop_name text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  last_sync_at timestamptz,
  last_sync_status text CHECK (last_sync_status IN ('success', 'error')),
  last_sync_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add columns that might be missing if table already existed
ALTER TABLE tiktok_shop_connections ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE tiktok_shop_connections ADD COLUMN IF NOT EXISTS last_sync_status text;
ALTER TABLE tiktok_shop_connections ADD COLUMN IF NOT EXISTS last_sync_error text;
ALTER TABLE tiktok_shop_connections ADD COLUMN IF NOT EXISTS shop_name text;

-- Enable RLS
ALTER TABLE tiktok_shop_connections ENABLE ROW LEVEL SECURITY;

-- RLS policy: service role bypasses, tenant users see their own
CREATE POLICY IF NOT EXISTS "tenant_isolation" ON tiktok_shop_connections
  FOR ALL USING (tenant_id = auth.uid());
