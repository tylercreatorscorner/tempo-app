-- Composite indexes for RPC queries that filter brand + date range + period_type
-- Covers: get_brand_summary, get_creator_rankings, get_daily_trend
CREATE INDEX IF NOT EXISTS idx_creator_perf_brand_date_period
  ON creator_performance(brand, report_date, period_type);

-- Covers: get_product_summary, get_video_summary
CREATE INDEX IF NOT EXISTS idx_video_perf_brand_date_period
  ON video_performance(brand, report_date, period_type);
