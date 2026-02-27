-- ============================================================
-- Pipeline Monitoring & Session Health
-- Tables for tracking scraper sessions, pipeline runs, and alerts
-- ============================================================

-- Brand session tracking (cookie/auth lifecycle)
CREATE TABLE IF NOT EXISTS brand_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  brand_slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expiring', 'expired', 'error')),
  cookie_set_at TIMESTAMPTZ, -- when cookies were last refreshed
  cookie_expires_at TIMESTAMPTZ, -- estimated expiry (cookie_set_at + ~120 days)
  last_health_check TIMESTAMPTZ,
  last_health_status TEXT CHECK (last_health_status IN ('healthy', 'degraded', 'expired', 'error')),
  last_successful_scrape TIMESTAMPTZ,
  consecutive_failures INT DEFAULT 0,
  alert_sent_14d BOOLEAN DEFAULT false,
  alert_sent_7d BOOLEAN DEFAULT false,
  alert_sent_3d BOOLEAN DEFAULT false,
  alert_sent_expired BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, brand_slug)
);

-- Pipeline run history (every scrape attempt)
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  brand_slug TEXT NOT NULL,
  run_date DATE NOT NULL, -- the data date being scraped
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed', 'skipped')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_seconds INT,
  
  -- Counts
  creators_scraped INT DEFAULT 0,
  products_scraped INT DEFAULT 0,
  videos_scraped INT DEFAULT 0,
  all_videos_exported INT DEFAULT 0,
  rows_pushed INT DEFAULT 0,
  
  -- Error tracking
  error_message TEXT,
  error_stage TEXT, -- 'login', 'navigation', 'scrape', 'export', 'push'
  retry_count INT DEFAULT 0,
  
  -- Metadata
  scrape_mode TEXT DEFAULT 'headed', -- headed, headless
  pipeline_version TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- System alerts log
CREATE TABLE IF NOT EXISTS system_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  alert_type TEXT NOT NULL, -- 'session_expiring', 'session_expired', 'scrape_failed', 'data_stale'
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  brand_slug TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  notified_telegram BOOLEAN DEFAULT false,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Data freshness view (latest successful scrape per brand)
CREATE OR REPLACE VIEW data_freshness AS
SELECT 
  bs.brand_slug,
  bs.status as session_status,
  bs.cookie_expires_at,
  bs.last_successful_scrape,
  bs.consecutive_failures,
  EXTRACT(EPOCH FROM (now() - bs.last_successful_scrape)) / 3600 as hours_since_last_scrape,
  EXTRACT(EPOCH FROM (bs.cookie_expires_at - now())) / 86400 as days_until_expiry,
  CASE 
    WHEN bs.last_successful_scrape IS NULL THEN 'no_data'
    WHEN now() - bs.last_successful_scrape < interval '6 hours' THEN 'fresh'
    WHEN now() - bs.last_successful_scrape < interval '24 hours' THEN 'recent'
    WHEN now() - bs.last_successful_scrape < interval '48 hours' THEN 'stale'
    ELSE 'critical'
  END as freshness,
  pr.run_date as last_data_date,
  pr.creators_scraped as last_creators,
  pr.videos_scraped as last_videos
FROM brand_sessions bs
LEFT JOIN LATERAL (
  SELECT run_date, creators_scraped, videos_scraped
  FROM pipeline_runs 
  WHERE pipeline_runs.brand_slug = bs.brand_slug 
    AND status = 'success'
  ORDER BY run_date DESC 
  LIMIT 1
) pr ON true;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_brand_date ON pipeline_runs(brand_slug, run_date DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_alerts_unack ON system_alerts(acknowledged, created_at DESC) WHERE NOT acknowledged;
CREATE INDEX IF NOT EXISTS idx_brand_sessions_status ON brand_sessions(status);

-- RLS
ALTER TABLE brand_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand_sessions_tenant" ON brand_sessions FOR ALL USING (tenant_id = auth.uid() OR current_setting('role') = 'service_role');
CREATE POLICY "pipeline_runs_tenant" ON pipeline_runs FOR ALL USING (tenant_id = auth.uid() OR current_setting('role') = 'service_role');
CREATE POLICY "system_alerts_tenant" ON system_alerts FOR ALL USING (tenant_id = auth.uid() OR current_setting('role') = 'service_role');
