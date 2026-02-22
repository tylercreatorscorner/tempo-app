-- ============================================================
-- MIGRATION 001: Multi-Tenancy Foundation
-- ============================================================
-- This migration adds tenant isolation to Tempo.
-- Run in Supabase SQL Editor. Safe to run on existing data.
-- ============================================================

-- ==================== STEP 1: Create tenants table ====================
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'brand' CHECK (plan IN ('brand', 'agency', 'enterprise')),
  max_brands INTEGER NOT NULL DEFAULT 1,
  onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create Tyler's tenant (Creators Corner / Tempo)
INSERT INTO tenants (id, name, slug, plan, max_brands, onboarding_complete)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Creator''s Corner',
  'creators-corner',
  'enterprise',
  100,
  true
)
ON CONFLICT (slug) DO NOTHING;

-- ==================== STEP 2: Add tenant_id to all data tables ====================

-- videos (474K+ rows)
ALTER TABLE videos ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- creator_performance (287K+ rows)
ALTER TABLE creator_performance ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- video_performance (166K+ rows)
ALTER TABLE video_performance ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- managed_creators (1K+ rows)
ALTER TABLE managed_creators ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- brands (5 rows)
ALTER TABLE brands ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- campaigns (7 rows)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- products (1 row)
ALTER TABLE products ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- contact_log (60 rows)
ALTER TABLE contact_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- user_profiles (199 rows)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- ==================== STEP 3: Backfill existing data ====================
-- All existing data belongs to Tyler's tenant

UPDATE videos SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE creator_performance SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE video_performance SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE managed_creators SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE brands SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE campaigns SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE products SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE contact_log SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE user_profiles SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- ==================== STEP 4: Make tenant_id NOT NULL ====================
-- After backfill, enforce that all future rows must have a tenant

ALTER TABLE videos ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE creator_performance ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE video_performance ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE managed_creators ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE brands ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE campaigns ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE products ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE contact_log ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE user_profiles ALTER COLUMN tenant_id SET NOT NULL;

-- ==================== STEP 5: Create indexes for performance ====================
-- tenant_id will be in every query now, so it needs indexes

CREATE INDEX IF NOT EXISTS idx_videos_tenant ON videos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_videos_tenant_brand ON videos(tenant_id, brand);
CREATE INDEX IF NOT EXISTS idx_creator_perf_tenant ON creator_performance(tenant_id);
CREATE INDEX IF NOT EXISTS idx_creator_perf_tenant_brand ON creator_performance(tenant_id, brand);
CREATE INDEX IF NOT EXISTS idx_video_perf_tenant ON video_performance(tenant_id);
CREATE INDEX IF NOT EXISTS idx_video_perf_tenant_brand ON video_performance(tenant_id, brand);
CREATE INDEX IF NOT EXISTS idx_managed_creators_tenant ON managed_creators(tenant_id);
CREATE INDEX IF NOT EXISTS idx_brands_tenant ON brands(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant ON user_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON campaigns(tenant_id);

-- ==================== STEP 6: Enable RLS on all tables ====================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE managed_creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- ==================== STEP 7: RLS Policies ====================
-- Pattern: users can only see rows where tenant_id matches their profile's tenant_id
-- Service role key bypasses RLS (for admin operations, cron jobs, data imports)

-- Helper function: get current user's tenant_id from their profile
CREATE OR REPLACE FUNCTION auth.tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM user_profiles WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- tenants: users can only see their own tenant
CREATE POLICY "Users can view own tenant" ON tenants
  FOR SELECT USING (id = auth.tenant_id());

-- videos
CREATE POLICY "Tenant isolation" ON videos
  FOR ALL USING (tenant_id = auth.tenant_id());

-- creator_performance
CREATE POLICY "Tenant isolation" ON creator_performance
  FOR ALL USING (tenant_id = auth.tenant_id());

-- video_performance
CREATE POLICY "Tenant isolation" ON video_performance
  FOR ALL USING (tenant_id = auth.tenant_id());

-- managed_creators
CREATE POLICY "Tenant isolation" ON managed_creators
  FOR ALL USING (tenant_id = auth.tenant_id());

-- brands
CREATE POLICY "Tenant isolation" ON brands
  FOR ALL USING (tenant_id = auth.tenant_id());

-- campaigns
CREATE POLICY "Tenant isolation" ON campaigns
  FOR ALL USING (tenant_id = auth.tenant_id());

-- products
CREATE POLICY "Tenant isolation" ON products
  FOR ALL USING (tenant_id = auth.tenant_id());

-- contact_log
CREATE POLICY "Tenant isolation" ON contact_log
  FOR ALL USING (tenant_id = auth.tenant_id());

-- user_profiles: users see profiles in their tenant
CREATE POLICY "Tenant isolation" ON user_profiles
  FOR SELECT USING (tenant_id = auth.tenant_id());

-- user_profiles: users can update their own profile
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (user_id = auth.uid());

-- ==================== STEP 8: Update RPC functions ====================
-- Add p_tenant_id parameter to all existing RPCs

CREATE OR REPLACE FUNCTION get_brand_summary(
  p_brand TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS TABLE (
  total_gmv NUMERIC,
  total_orders BIGINT,
  total_items_sold BIGINT,
  total_refunds NUMERIC,
  total_videos BIGINT,
  total_live_streams BIGINT,
  total_est_commission NUMERIC,
  unique_creators BIGINT,
  avg_aov NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(cp.gmv), 0) AS total_gmv,
    COALESCE(SUM(cp.orders), 0)::BIGINT AS total_orders,
    COALESCE(SUM(cp.items_sold), 0)::BIGINT AS total_items_sold,
    COALESCE(SUM(cp.refunds), 0) AS total_refunds,
    COALESCE(SUM(cp.videos), 0)::BIGINT AS total_videos,
    COALESCE(SUM(cp.live_streams), 0)::BIGINT AS total_live_streams,
    COALESCE(SUM(cp.est_commission), 0) AS total_est_commission,
    COUNT(DISTINCT cp.creator_name)::BIGINT AS unique_creators,
    CASE WHEN SUM(cp.orders) > 0 
      THEN ROUND(SUM(cp.gmv) / SUM(cp.orders), 2)
      ELSE 0 
    END AS avg_aov
  FROM creator_performance cp
  WHERE cp.brand = p_brand
    AND cp.report_date BETWEEN p_start_date AND p_end_date
    AND cp.period_type = 'daily'
    AND (p_tenant_id IS NULL OR cp.tenant_id = p_tenant_id);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION get_creator_rankings(
  p_brand TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_limit INTEGER DEFAULT 20,
  p_managed_only BOOLEAN DEFAULT false,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS TABLE (
  creator_name TEXT,
  total_gmv NUMERIC,
  total_orders BIGINT,
  total_items_sold BIGINT,
  days_active BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp.creator_name,
    COALESCE(SUM(cp.gmv), 0) AS total_gmv,
    COALESCE(SUM(cp.orders), 0)::BIGINT AS total_orders,
    COALESCE(SUM(cp.items_sold), 0)::BIGINT AS total_items_sold,
    COUNT(DISTINCT cp.report_date)::BIGINT AS days_active
  FROM creator_performance cp
  WHERE cp.brand = p_brand
    AND cp.report_date BETWEEN p_start_date AND p_end_date
    AND cp.period_type = 'daily'
    AND (p_tenant_id IS NULL OR cp.tenant_id = p_tenant_id)
  GROUP BY cp.creator_name
  ORDER BY total_gmv DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION get_product_summary(
  p_brand TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_limit INTEGER DEFAULT 20,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS TABLE (
  product_name TEXT,
  total_gmv NUMERIC,
  total_orders BIGINT,
  total_items_sold BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    vp.product_name,
    COALESCE(SUM(vp.gmv), 0) AS total_gmv,
    COALESCE(SUM(vp.orders), 0)::BIGINT AS total_orders,
    COALESCE(SUM(vp.items_sold), 0)::BIGINT AS total_items_sold
  FROM video_performance vp
  WHERE vp.brand = p_brand
    AND vp.report_date BETWEEN p_start_date AND p_end_date
    AND vp.period_type = 'daily'
    AND (p_tenant_id IS NULL OR vp.tenant_id = p_tenant_id)
  GROUP BY vp.product_name
  ORDER BY total_gmv DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION get_video_summary(
  p_brand TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_limit INTEGER DEFAULT 20,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS TABLE (
  video_id TEXT,
  video_title TEXT,
  creator_name TEXT,
  total_gmv NUMERIC,
  total_orders BIGINT,
  total_items_sold BIGINT,
  total_est_commission NUMERIC,
  days_active BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    vp.video_id,
    MAX(vp.video_title) AS video_title,
    MAX(vp.creator_name) AS creator_name,
    COALESCE(SUM(vp.gmv), 0) AS total_gmv,
    COALESCE(SUM(vp.orders), 0)::BIGINT AS total_orders,
    COALESCE(SUM(vp.items_sold), 0)::BIGINT AS total_items_sold,
    COALESCE(SUM(vp.est_commission), 0) AS total_est_commission,
    COUNT(DISTINCT vp.report_date)::BIGINT AS days_active
  FROM video_performance vp
  WHERE vp.brand = p_brand
    AND vp.report_date BETWEEN p_start_date AND p_end_date
    AND vp.period_type = 'daily'
    AND (p_tenant_id IS NULL OR vp.tenant_id = p_tenant_id)
  GROUP BY vp.video_id
  ORDER BY total_gmv DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION get_daily_trend(
  p_brand TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS TABLE (
  report_date DATE,
  daily_gmv NUMERIC,
  daily_orders BIGINT,
  daily_items_sold BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp.report_date,
    COALESCE(SUM(cp.gmv), 0) AS daily_gmv,
    COALESCE(SUM(cp.orders), 0)::BIGINT AS daily_orders,
    COALESCE(SUM(cp.items_sold), 0)::BIGINT AS daily_items_sold
  FROM creator_performance cp
  WHERE cp.brand = p_brand
    AND cp.report_date BETWEEN p_start_date AND p_end_date
    AND cp.period_type = 'daily'
    AND (p_tenant_id IS NULL OR cp.tenant_id = p_tenant_id)
  GROUP BY cp.report_date
  ORDER BY cp.report_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- ==================== DONE ====================
-- Summary:
-- 1. Created tenants table with Tyler's tenant as first entry
-- 2. Added tenant_id to 9 tables
-- 3. Backfilled all existing data to Tyler's tenant
-- 4. Made tenant_id NOT NULL
-- 5. Created performance indexes
-- 6. Enabled RLS on all tables
-- 7. Created RLS policies (tenant isolation)
-- 8. Updated 5 RPC functions with optional p_tenant_id param
--
-- IMPORTANT: Service role key bypasses RLS.
-- The Next.js app uses service role key (createAdminClient) so it
-- still works immediately. When you switch to anon key + auth,
-- RLS kicks in automatically.
-- ============================================================
