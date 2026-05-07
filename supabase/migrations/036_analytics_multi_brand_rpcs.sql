-- ============================================================
-- Multi-brand analytics RPCs
-- Collapse the per-brand fan-out on /analytics into single calls.
-- All four functions take a brand_ids uuid[] and join to brands_v2 for slug.
-- They read from the v2 stats tables (daily_creator_stats,
-- daily_video_product_stats), which are kept in sync with the legacy
-- creator_performance/video_performance views.
-- ============================================================

-- 1. Per-brand summary rows (one row per brand_id in the input).
--    Powers the brand riser/faller calc and the Brand Breakdown donut.
CREATE OR REPLACE FUNCTION analytics_brand_summaries(
  p_brand_ids uuid[],
  p_start_date date,
  p_end_date date
)
RETURNS TABLE(
  brand_id uuid,
  brand_slug text,
  total_gmv numeric,
  total_orders bigint,
  total_items_sold bigint,
  total_videos bigint,
  unique_creators bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    b.id AS brand_id,
    b.slug AS brand_slug,
    COALESCE(SUM(dcs.gmv), 0) AS total_gmv,
    COALESCE(SUM(dcs.orders), 0)::bigint AS total_orders,
    COALESCE(SUM(dcs.items_sold), 0)::bigint AS total_items_sold,
    COALESCE(SUM(dcs.videos), 0)::bigint AS total_videos,
    COUNT(DISTINCT dcs.tiktok_username)::bigint AS unique_creators
  FROM brands_v2 b
  LEFT JOIN daily_creator_stats dcs
    ON dcs.brand_id = b.id
   AND dcs.report_date BETWEEN p_start_date AND p_end_date
  WHERE b.id = ANY(p_brand_ids)
  GROUP BY b.id, b.slug;
$$;

-- 2. Creator rankings across all input brands, with brand slug attached.
CREATE OR REPLACE FUNCTION analytics_creator_rankings(
  p_brand_ids uuid[],
  p_start_date date,
  p_end_date date,
  p_limit int DEFAULT 500
)
RETURNS TABLE(
  brand_slug text,
  creator_name text,
  total_gmv numeric,
  total_orders bigint,
  total_items_sold bigint,
  total_videos bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    b.slug AS brand_slug,
    dcs.tiktok_username AS creator_name,
    COALESCE(SUM(dcs.gmv), 0) AS total_gmv,
    COALESCE(SUM(dcs.orders), 0)::bigint AS total_orders,
    COALESCE(SUM(dcs.items_sold), 0)::bigint AS total_items_sold,
    COALESCE(SUM(dcs.videos), 0)::bigint AS total_videos
  FROM daily_creator_stats dcs
  JOIN brands_v2 b ON b.id = dcs.brand_id
  WHERE dcs.brand_id = ANY(p_brand_ids)
    AND dcs.report_date BETWEEN p_start_date AND p_end_date
  GROUP BY b.slug, dcs.tiktok_username
  ORDER BY total_gmv DESC
  LIMIT p_limit;
$$;

-- 3. Video summary across all input brands, with brand slug attached.
--    Reads daily_video_product_stats (per video x product x day) and dedupes
--    by video_id -- same source the brand portal uses.
CREATE OR REPLACE FUNCTION analytics_videos(
  p_brand_ids uuid[],
  p_start_date date,
  p_end_date date,
  p_limit int DEFAULT 200
)
RETURNS TABLE(
  brand_slug text,
  video_id text,
  video_title text,
  creator_name text,
  total_gmv numeric,
  total_orders bigint,
  total_items_sold bigint,
  days_active bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    b.slug AS brand_slug,
    dvps.video_id,
    MAX(dvps.video_title) AS video_title,
    MAX(dvps.tiktok_username) AS creator_name,
    COALESCE(SUM(dvps.gmv), 0) AS total_gmv,
    COALESCE(SUM(dvps.orders), 0)::bigint AS total_orders,
    COALESCE(SUM(dvps.items_sold), 0)::bigint AS total_items_sold,
    COUNT(DISTINCT dvps.report_date)::bigint AS days_active
  FROM daily_video_product_stats dvps
  JOIN brands_v2 b ON b.id = dvps.brand_id
  WHERE dvps.brand_id = ANY(p_brand_ids)
    AND dvps.report_date BETWEEN p_start_date AND p_end_date
  GROUP BY b.slug, dvps.video_id
  ORDER BY total_gmv DESC
  LIMIT p_limit;
$$;

-- 4. Aggregated daily trend across all input brands.
--    Same shape as get_daily_trend (legacy), but takes brand_ids[] instead of a
--    single text slug -- collapses N RPCs into one per period.
CREATE OR REPLACE FUNCTION analytics_daily_trend(
  p_brand_ids uuid[],
  p_start_date date,
  p_end_date date
)
RETURNS TABLE(
  report_date date,
  daily_gmv numeric,
  daily_orders bigint,
  daily_items_sold bigint,
  daily_videos bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    dcs.report_date,
    COALESCE(SUM(dcs.gmv), 0) AS daily_gmv,
    COALESCE(SUM(dcs.orders), 0)::bigint AS daily_orders,
    COALESCE(SUM(dcs.items_sold), 0)::bigint AS daily_items_sold,
    COALESCE(SUM(dcs.videos), 0)::bigint AS daily_videos
  FROM daily_creator_stats dcs
  WHERE dcs.brand_id = ANY(p_brand_ids)
    AND dcs.report_date BETWEEN p_start_date AND p_end_date
  GROUP BY dcs.report_date
  ORDER BY dcs.report_date;
$$;

-- Grants -- match the existing RPC convention
GRANT EXECUTE ON FUNCTION analytics_brand_summaries(uuid[], date, date)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION analytics_creator_rankings(uuid[], date, date, int)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION analytics_videos(uuid[], date, date, int)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION analytics_daily_trend(uuid[], date, date)             TO authenticated, service_role;
