-- Dashboard Video Sections RPC
-- Returns pre-aggregated, pre-categorized videos for dashboard sections
-- Replaces client-side pagination + aggregation with a single fast query

CREATE OR REPLACE FUNCTION get_dashboard_videos(
  p_brand_ids uuid[],
  p_start_date date,
  p_end_date date,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  section text,
  video_id text,
  video_url text,
  video_title text,
  tiktok_username text,
  post_date date,
  total_gmv numeric,
  total_orders bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH aggregated AS (
    SELECT
      dvs.video_id,
      MAX(dvs.video_url) AS video_url,
      MAX(dvs.video_title) AS video_title,
      MAX(dvs.tiktok_username) AS tiktok_username,
      MAX(dvs.post_date) AS post_date,
      SUM(dvs.gmv) AS total_gmv,
      SUM(dvs.orders) AS total_orders
    FROM daily_video_stats dvs
    WHERE dvs.brand_id = ANY(p_brand_ids)
      AND dvs.report_date >= p_start_date
      AND dvs.report_date <= p_end_date
    GROUP BY dvs.video_id
  ),
  hot_now AS (
    SELECT 'hot_now'::text AS section, a.*,
           ROW_NUMBER() OVER (ORDER BY a.total_gmv DESC) AS rn
    FROM aggregated a
    WHERE a.post_date >= (CURRENT_DATE - 7)
      AND a.total_gmv >= 100
  ),
  rising AS (
    SELECT 'rising'::text AS section, a.*,
           ROW_NUMBER() OVER (ORDER BY a.total_gmv DESC) AS rn
    FROM aggregated a
    WHERE a.post_date >= (CURRENT_DATE - 14)
      AND a.post_date < (CURRENT_DATE - 7)
      AND a.total_gmv > 0
  ),
  top_performers AS (
    SELECT 'top_performers'::text AS section, a.*,
           ROW_NUMBER() OVER (ORDER BY a.total_gmv DESC) AS rn
    FROM aggregated a
  )
  SELECT section, video_id, video_url, video_title, tiktok_username, post_date, total_gmv, total_orders
  FROM hot_now WHERE rn <= p_limit
  UNION ALL
  SELECT section, video_id, video_url, video_title, tiktok_username, post_date, total_gmv, total_orders
  FROM rising WHERE rn <= p_limit
  UNION ALL
  SELECT section, video_id, video_url, video_title, tiktok_username, post_date, total_gmv, total_orders
  FROM top_performers WHERE rn <= p_limit;
$$;
