-- Fix 1: Recreate get_creator_rankings with total_videos added
DROP FUNCTION IF EXISTS get_creator_rankings(text, date, date, integer, boolean, uuid);

CREATE FUNCTION get_creator_rankings(
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
  total_videos BIGINT,
  days_active BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp.creator_name,
    COALESCE(SUM(cp.gmv), 0) AS total_gmv,
    COALESCE(SUM(cp.orders), 0)::BIGINT AS total_orders,
    COALESCE(SUM(cp.items_sold), 0)::BIGINT AS total_items_sold,
    COALESCE(SUM(cp.videos), 0)::BIGINT AS total_videos,
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

-- Fix 2: get_dashboard_videos — use p_end_date for recency windows instead of CURRENT_DATE
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
      MAX(dvs.video_url)           AS video_url,
      MAX(dvs.video_title)         AS video_title,
      MAX(dvs.tiktok_username)     AS tiktok_username,
      MAX(dvs.post_date)           AS post_date,
      SUM(dvs.gmv)                 AS total_gmv,
      SUM(dvs.orders)              AS total_orders
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
    WHERE a.post_date >= (p_end_date - 7)
      AND a.total_gmv >= 100
  ),
  rising AS (
    SELECT 'rising'::text AS section, a.*,
           ROW_NUMBER() OVER (ORDER BY a.total_gmv DESC) AS rn
    FROM aggregated a
    WHERE a.post_date >= (p_end_date - 14)
      AND a.post_date < (p_end_date - 7)
      AND a.total_gmv > 0
  ),
  top_performers AS (
    SELECT 'top_performers'::text AS section, a.*,
           ROW_NUMBER() OVER (ORDER BY a.total_gmv DESC) AS rn
    FROM aggregated a
  )
  SELECT section, video_id, video_url, video_title, tiktok_username, post_date, total_gmv, total_orders
  FROM hot_now        WHERE rn <= p_limit
  UNION ALL
  SELECT section, video_id, video_url, video_title, tiktok_username, post_date, total_gmv, total_orders
  FROM rising         WHERE rn <= p_limit
  UNION ALL
  SELECT section, video_id, video_url, video_title, tiktok_username, post_date, total_gmv, total_orders
  FROM top_performers WHERE rn <= p_limit;
$$;
