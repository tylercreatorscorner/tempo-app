-- ============================================================
-- TEMPO SCHEMA V2 — Phase 1: Create New Tables
-- ============================================================
-- This migration creates all new tables ALONGSIDE old ones.
-- Nothing is dropped, nothing is modified. Zero risk.
-- Run this first, verify tables exist, then proceed to Phase 2.
-- ============================================================

-- ============================================================
-- Layer 1: People & Relationships
-- ============================================================

-- BRANDS v2 (UUID PK, enhanced with color/logo/discord)
CREATE TABLE IF NOT EXISTS brands_v2 (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  display_name    TEXT,
  color           TEXT,
  logo_url        TEXT,
  tiktok_shop_id  TEXT,
  discord_guild_id TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, slug)
);

-- CREATORS (one row per human, replaces managed_creators)
CREATE TABLE IF NOT EXISTS creators_v2 (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  real_name       TEXT,
  email           TEXT,
  phone           TEXT,
  discord_id      TEXT,
  discord_username TEXT,
  discord_avatar  TEXT,
  notes           TEXT,
  tags            TEXT[],
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- CREATOR_BRANDS (the join table — one row per creator per brand)
CREATE TABLE IF NOT EXISTS creator_brands (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      UUID NOT NULL REFERENCES creators_v2(id),
  brand_id        UUID NOT NULL REFERENCES brands_v2(id),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  is_managed      BOOLEAN DEFAULT false,
  status          TEXT DEFAULT 'active',
  retainer        NUMERIC DEFAULT 0,
  monthly_post_requirement INTEGER DEFAULT 30,
  contract_length_days     INTEGER DEFAULT 30,
  retainer_start_date      DATE,
  current_tier    TEXT,
  role            TEXT,
  product_assignments JSONB,
  product_retainers   TEXT,
  lifetime_gmv    NUMERIC DEFAULT 0,
  weeks_in_top_5  INTEGER DEFAULT 0,
  weeks_in_top_10 INTEGER DEFAULT 0,
  first_top_10_date DATE,
  employment_status TEXT DEFAULT 'active',
  application_id  INTEGER,
  joined_at       TIMESTAMPTZ,
  applied_at      TIMESTAMPTZ,
  terminated_at   TIMESTAMPTZ,
  termination_reason TEXT,
  status_changed_at  TIMESTAMPTZ,
  last_contact_date  DATE,
  next_followup_date DATE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(creator_id, brand_id)
);

-- TIKTOK_ACCOUNTS (replaces creator_accounts)
CREATE TABLE IF NOT EXISTS tiktok_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      UUID REFERENCES creators_v2(id),  -- NULLABLE for unmatched
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  brand_id        UUID REFERENCES brands_v2(id),
  tiktok_username TEXT NOT NULL,
  tiktok_user_id  TEXT,
  is_primary      BOOLEAN DEFAULT true,
  follower_count  INTEGER,
  verified        BOOLEAN DEFAULT false,
  verified_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, tiktok_username, brand_id)
);

-- ============================================================
-- Layer 2: Daily Data Tables
-- ============================================================

-- DAILY_VIDEO_STATS (replaces videos table — from File 2: Videos tab)
-- Every video with ANY activity on that day (impressions, sales, anything)
CREATE TABLE IF NOT EXISTS daily_video_stats (
  id              BIGSERIAL PRIMARY KEY,
  report_date     DATE NOT NULL,
  brand_id        UUID NOT NULL REFERENCES brands_v2(id),
  tiktok_account_id UUID REFERENCES tiktok_accounts(id),
  tiktok_username TEXT NOT NULL,
  video_id        TEXT NOT NULL,
  video_title     TEXT,
  video_url       TEXT,
  post_date       DATE,
  gmv             NUMERIC DEFAULT 0,
  orders          INTEGER DEFAULT 0,
  items_sold      INTEGER DEFAULT 0,
  items_refunded  INTEGER DEFAULT 0,
  refunded_gmv    NUMERIC DEFAULT 0,
  est_commission  NUMERIC DEFAULT 0,
  est_flat_fee    NUMERIC DEFAULT 0,
  impressions     BIGINT DEFAULT 0,
  likes           INTEGER DEFAULT 0,
  comments        INTEGER DEFAULT 0,
  ctr             NUMERIC,
  gpm             NUMERIC,
  aov             NUMERIC,
  shoppable_video_gmv NUMERIC DEFAULT 0,
  data_source     TEXT DEFAULT 'csv',
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(report_date, brand_id, video_id)
);

-- DAILY_VIDEO_PRODUCT_STATS (replaces video_performance — from File 4: Analytics > All Videos)
-- Product-level breakdown. Only videos with sales activity.
CREATE TABLE IF NOT EXISTS daily_video_product_stats (
  id              BIGSERIAL PRIMARY KEY,
  report_date     DATE NOT NULL,
  brand_id        UUID NOT NULL REFERENCES brands_v2(id),
  tiktok_username TEXT NOT NULL,
  video_id        TEXT NOT NULL,
  video_title     TEXT,
  video_url       TEXT,
  post_date       TIMESTAMPTZ,
  product_name    TEXT NOT NULL,
  product_id      TEXT NOT NULL,
  gmv             NUMERIC DEFAULT 0,
  orders          INTEGER DEFAULT 0,
  items_sold      INTEGER DEFAULT 0,
  items_refunded  INTEGER DEFAULT 0,
  refunded_gmv    NUMERIC DEFAULT 0,
  est_commission  NUMERIC DEFAULT 0,
  est_flat_fee    NUMERIC DEFAULT 0,
  aov             NUMERIC,
  avg_gmv_per_customer NUMERIC,
  data_source     TEXT DEFAULT 'csv',
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(report_date, brand_id, video_id, product_id)
);

-- DAILY_CREATOR_STATS (replaces creator_performance — from File 3: Creators tab)
CREATE TABLE IF NOT EXISTS daily_creator_stats (
  id              BIGSERIAL PRIMARY KEY,
  report_date     DATE NOT NULL,
  brand_id        UUID NOT NULL REFERENCES brands_v2(id),
  tiktok_username TEXT NOT NULL,
  gmv             NUMERIC DEFAULT 0,
  refunds         NUMERIC DEFAULT 0,
  orders          INTEGER DEFAULT 0,
  items_sold      INTEGER DEFAULT 0,
  items_refunded  INTEGER DEFAULT 0,
  aov             NUMERIC,
  avg_daily_products_sold NUMERIC,
  videos          INTEGER DEFAULT 0,
  livestreams     INTEGER DEFAULT 0,
  est_commission  NUMERIC DEFAULT 0,
  samples_shipped INTEGER DEFAULT 0,
  est_flat_fee    NUMERIC DEFAULT 0,
  data_source     TEXT DEFAULT 'csv',
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(report_date, brand_id, tiktok_username)
);

-- DAILY_PRODUCT_STATS (replaces product_performance — from File 1: Products tab)
CREATE TABLE IF NOT EXISTS daily_product_stats (
  id              BIGSERIAL PRIMARY KEY,
  report_date     DATE NOT NULL,
  brand_id        UUID NOT NULL REFERENCES brands_v2(id),
  product_name    TEXT NOT NULL,
  product_id      TEXT NOT NULL,
  product_category TEXT,
  gmv             NUMERIC DEFAULT 0,
  refunds         NUMERIC DEFAULT 0,
  items_sold      INTEGER DEFAULT 0,
  items_refunded  INTEGER DEFAULT 0,
  orders          INTEGER DEFAULT 0,
  avg_daily_customers          NUMERIC,
  avg_daily_creators_with_sales    NUMERIC,
  avg_daily_creators_posted        NUMERIC,
  avg_daily_videos_with_sales      NUMERIC,
  avg_daily_livestreams_with_sales NUMERIC,
  videos          INTEGER DEFAULT 0,
  livestreams     INTEGER DEFAULT 0,
  est_commission  NUMERIC DEFAULT 0,
  samples_shipped INTEGER DEFAULT 0,
  est_flat_fee    NUMERIC DEFAULT 0,
  data_source     TEXT DEFAULT 'csv',
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(report_date, brand_id, product_id)
);

-- ============================================================
-- Mapping table (temporary, for migration)
-- ============================================================

-- Maps old IDs to new IDs during migration
CREATE TABLE IF NOT EXISTS _migration_id_map (
  old_table       TEXT NOT NULL,
  old_id          TEXT NOT NULL,
  new_id          UUID NOT NULL,
  mapped_at       TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(old_table, old_id)
);

-- ============================================================
-- Indexes
-- ============================================================

-- Daily video stats
CREATE INDEX IF NOT EXISTS idx_dvs_date_brand ON daily_video_stats(report_date, brand_id);
CREATE INDEX IF NOT EXISTS idx_dvs_username ON daily_video_stats(tiktok_username);
CREATE INDEX IF NOT EXISTS idx_dvs_video_id ON daily_video_stats(video_id);
CREATE INDEX IF NOT EXISTS idx_dvs_post_date ON daily_video_stats(post_date);
CREATE INDEX IF NOT EXISTS idx_dvs_tenant ON daily_video_stats(tenant_id);

-- Daily video product stats
CREATE INDEX IF NOT EXISTS idx_dvps_date_brand ON daily_video_product_stats(report_date, brand_id);
CREATE INDEX IF NOT EXISTS idx_dvps_username ON daily_video_product_stats(tiktok_username);
CREATE INDEX IF NOT EXISTS idx_dvps_video_id ON daily_video_product_stats(video_id);
CREATE INDEX IF NOT EXISTS idx_dvps_product_id ON daily_video_product_stats(product_id);
CREATE INDEX IF NOT EXISTS idx_dvps_tenant ON daily_video_product_stats(tenant_id);

-- Daily creator stats
CREATE INDEX IF NOT EXISTS idx_dcs_date_brand ON daily_creator_stats(report_date, brand_id);
CREATE INDEX IF NOT EXISTS idx_dcs_username ON daily_creator_stats(tiktok_username);
CREATE INDEX IF NOT EXISTS idx_dcs_tenant ON daily_creator_stats(tenant_id);

-- Daily product stats
CREATE INDEX IF NOT EXISTS idx_dps_date_brand ON daily_product_stats(report_date, brand_id);
CREATE INDEX IF NOT EXISTS idx_dps_product_id ON daily_product_stats(product_id);
CREATE INDEX IF NOT EXISTS idx_dps_tenant ON daily_product_stats(tenant_id);

-- People tables
CREATE INDEX IF NOT EXISTS idx_cv2_tenant ON creators_v2(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cv2_discord ON creators_v2(discord_id);
CREATE INDEX IF NOT EXISTS idx_cv2_name ON creators_v2(real_name);
CREATE INDEX IF NOT EXISTS idx_cb_creator ON creator_brands(creator_id);
CREATE INDEX IF NOT EXISTS idx_cb_brand ON creator_brands(brand_id);
CREATE INDEX IF NOT EXISTS idx_cb_managed ON creator_brands(is_managed) WHERE is_managed = true;
CREATE INDEX IF NOT EXISTS idx_cb_tenant ON creator_brands(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ta_creator ON tiktok_accounts(creator_id);
CREATE INDEX IF NOT EXISTS idx_ta_username ON tiktok_accounts(tiktok_username);
CREATE INDEX IF NOT EXISTS idx_ta_tenant ON tiktok_accounts(tenant_id);

-- ============================================================
-- RLS Policies (enable but permissive for now)
-- ============================================================

ALTER TABLE brands_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE creators_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_video_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_video_product_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_creator_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_product_stats ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS, so these policies are for authenticated users
CREATE POLICY "tenant_isolation" ON brands_v2
  FOR ALL USING (tenant_id = (SELECT id FROM tenants LIMIT 1));
CREATE POLICY "tenant_isolation" ON creators_v2
  FOR ALL USING (tenant_id = (SELECT id FROM tenants LIMIT 1));
CREATE POLICY "tenant_isolation" ON creator_brands
  FOR ALL USING (tenant_id = (SELECT id FROM tenants LIMIT 1));
CREATE POLICY "tenant_isolation" ON tiktok_accounts
  FOR ALL USING (tenant_id = (SELECT id FROM tenants LIMIT 1));
CREATE POLICY "tenant_isolation" ON daily_video_stats
  FOR ALL USING (tenant_id = (SELECT id FROM tenants LIMIT 1));
CREATE POLICY "tenant_isolation" ON daily_video_product_stats
  FOR ALL USING (tenant_id = (SELECT id FROM tenants LIMIT 1));
CREATE POLICY "tenant_isolation" ON daily_creator_stats
  FOR ALL USING (tenant_id = (SELECT id FROM tenants LIMIT 1));
CREATE POLICY "tenant_isolation" ON daily_product_stats
  FOR ALL USING (tenant_id = (SELECT id FROM tenants LIMIT 1));

-- ============================================================
-- Done! Verify with:
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE '%_v2' OR tablename LIKE 'daily_%' OR tablename LIKE 'creator_brands' OR tablename LIKE 'tiktok_accounts' OR tablename LIKE '_migration%';
-- ============================================================
