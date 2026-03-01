-- V2 RPC Functions — server-side aggregation for dashboard performance
-- These replace client-side JS aggregation of paginated fetches

-- 1. Brand Summary
CREATE OR REPLACE FUNCTION get_brand_summary_v2(
  p_brand_ids uuid[],
  p_start_date date,
  p_end_date date
)
RETURNS TABLE(
  total_gmv numeric,
  total_orders bigint,
  total_items_sold bigint,
  total_refunds bigint,
  total_videos bigint,
  total_live_streams bigint,
  total_est_commission numeric,
  unique_creators bigint,
  avg_aov numeric
)
LANGUAGE sql STABLE AS $$
  SELECT
    COALESCE(SUM(gmv), 0) AS total_gmv,
    COALESCE(SUM(orders), 0)::bigint AS total_orders,
    COALESCE(SUM(items_sold), 0)::bigint AS total_items_sold,
    COALESCE(SUM(refunds), 0)::bigint AS total_refunds,
    COALESCE(SUM(videos), 0)::bigint AS total_videos,
    COALESCE(SUM(livestreams), 0)::bigint AS total_live_streams,
    COALESCE(SUM(est_commission), 0) AS total_est_commission,
    COUNT(DISTINCT tiktok_username)::bigint AS unique_creators,
    CASE WHEN COUNT(*) FILTER (WHERE aov > 0) > 0
      THEN AVG(aov) FILTER (WHERE aov > 0)
      ELSE 0
    END AS avg_aov
  FROM daily_creator_stats
  WHERE brand_id = ANY(p_brand_ids)
    AND report_date >= p_start_date
    AND report_date <= p_end_date;
$$;

-- 2. Creator Rankings
CREATE OR REPLACE FUNCTION get_creator_rankings_v2(
  p_brand_ids uuid[],
  p_start_date date,
  p_end_date date,
  p_limit int DEFAULT 20
)
RETURNS TABLE(
  creator_name text,
  total_gmv numeric,
  total_orders bigint,
  total_items_sold bigint,
  days_active bigint,
  total_videos bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    tiktok_username AS creator_name,
    COALESCE(SUM(gmv), 0) AS total_gmv,
    COALESCE(SUM(orders), 0)::bigint AS total_orders,
    COALESCE(SUM(items_sold), 0)::bigint AS total_items_sold,
    COUNT(DISTINCT report_date)::bigint AS days_active,
    COALESCE(SUM(videos), 0)::bigint AS total_videos
  FROM daily_creator_stats
  WHERE brand_id = ANY(p_brand_ids)
    AND report_date >= p_start_date
    AND report_date <= p_end_date
  GROUP BY tiktok_username
  ORDER BY total_gmv DESC
  LIMIT p_limit;
$$;

-- 3. Product Summary
CREATE OR REPLACE FUNCTION get_product_summary_v2(
  p_brand_ids uuid[],
  p_start_date date,
  p_end_date date,
  p_limit int DEFAULT 20
)
RETURNS TABLE(
  product_name text,
  total_gmv numeric,
  total_orders bigint,
  total_items_sold bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    product_name,
    COALESCE(SUM(gmv), 0) AS total_gmv,
    COALESCE(SUM(orders), 0)::bigint AS total_orders,
    COALESCE(SUM(items_sold), 0)::bigint AS total_items_sold
  FROM daily_product_stats
  WHERE brand_id = ANY(p_brand_ids)
    AND report_date >= p_start_date
    AND report_date <= p_end_date
  GROUP BY product_name
  ORDER BY total_gmv DESC
  LIMIT p_limit;
$$;

-- 4. Video Summary
CREATE OR REPLACE FUNCTION get_video_summary_v2(
  p_brand_ids uuid[],
  p_start_date date,
  p_end_date date,
  p_limit int DEFAULT 20
)
RETURNS TABLE(
  video_id text,
  video_title text,
  creator_name text,
  total_gmv numeric,
  total_orders bigint,
  total_items_sold bigint,
  total_est_commission numeric,
  days_active bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    video_id,
    MAX(video_title) AS video_title,
    MAX(tiktok_username) AS creator_name,
    COALESCE(SUM(gmv), 0) AS total_gmv,
    COALESCE(SUM(orders), 0)::bigint AS total_orders,
    COALESCE(SUM(items_sold), 0)::bigint AS total_items_sold,
    COALESCE(SUM(est_commission), 0) AS total_est_commission,
    COUNT(DISTINCT report_date)::bigint AS days_active
  FROM daily_video_product_stats
  WHERE brand_id = ANY(p_brand_ids)
    AND report_date >= p_start_date
    AND report_date <= p_end_date
  GROUP BY video_id
  ORDER BY total_gmv DESC
  LIMIT p_limit;
$$;

-- 5. Daily Trend
CREATE OR REPLACE FUNCTION get_daily_trend_v2(
  p_brand_ids uuid[],
  p_start_date date,
  p_end_date date
)
RETURNS TABLE(
  report_date date,
  daily_gmv numeric,
  daily_orders bigint,
  daily_items_sold bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    report_date,
    COALESCE(SUM(gmv), 0) AS daily_gmv,
    COALESCE(SUM(orders), 0)::bigint AS daily_orders,
    COALESCE(SUM(items_sold), 0)::bigint AS daily_items_sold
  FROM daily_creator_stats
  WHERE brand_id = ANY(p_brand_ids)
    AND report_date >= p_start_date
    AND report_date <= p_end_date
  GROUP BY report_date
  ORDER BY report_date;
$$;
