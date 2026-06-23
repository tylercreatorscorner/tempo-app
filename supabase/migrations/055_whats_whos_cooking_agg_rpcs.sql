-- 055_whats_whos_cooking_agg_rpcs.sql
--
-- Permanent fix for the post-generator 504/500 timeouts. What's Cooking and
-- Who's Cooking previously paginated ENTIRE 14-30 day windows of rows into the
-- serverless function and aggregated in JS (JiYu ~140k rows/month; a multi-store
-- umbrella like LeeFar or "All Brands" is worse) -> the function exceeded its
-- time limit. These RPCs do the aggregation in Postgres (served by
-- idx_dvps_date_brand / idx_dcs_date_brand) and return only the dozens of rows
-- the posts display + the totals, so the function can never time out regardless
-- of brand volume. Date windows are still computed in the app (the anchoring
-- logic) and passed in. SECURITY DEFINER — posts are admin/manager-only and pass
-- the brand_ids resolved from brands_v2; p_brand_ids NULL = all brands.
--
-- Verified at apply time: RPC totals match the prior JS aggregation exactly for
-- LeeFar 7d (Who's $1,186,978.72 / 1895 creators; What's $1,458,927.54 / 5341
-- videos). Applied to production via Supabase MCP; this file is the record.
-- (min(brand_id::text)::uuid because Postgres has no min() aggregate for uuid.)

CREATE OR REPLACE FUNCTION public.whats_cooking_agg(
  p_brand_ids uuid[], p_full_start date, p_end date,
  p_hot_start date, p_rising_start date, p_rising_end date,
  p_hot_threshold numeric, p_rising_threshold numeric
) RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $function$
  WITH agg AS (
    SELECT
      video_id,
      min(brand_id::text)::uuid AS brand_id,
      max(video_url)      AS video_url,
      max(video_title)    AS video_title,
      max(tiktok_username) AS tiktok_username,
      max(post_date)      AS post_date,
      sum(gmv)            AS gmv,
      sum(orders)         AS orders
    FROM daily_video_product_stats
    WHERE report_date >= p_full_start AND report_date <= p_end
      AND (p_brand_ids IS NULL OR brand_id = ANY(p_brand_ids))
    GROUP BY video_id
  )
  SELECT json_build_object(
    'totalGmv',     COALESCE((SELECT sum(gmv) FROM agg), 0),
    'videoCount',   (SELECT count(*) FROM agg),
    'creatorCount', (SELECT count(DISTINCT lower(tiktok_username)) FROM agg),
    'hotVideos', COALESCE((SELECT json_agg(h) FROM (
      SELECT video_id, video_url, video_title, tiktok_username, gmv, orders, post_date, brand_id
      FROM agg
      WHERE post_date IS NOT NULL AND post_date::date >= p_hot_start AND gmv >= p_hot_threshold
      ORDER BY gmv DESC LIMIT 20) h), '[]'::json),
    'risingVideos', COALESCE((SELECT json_agg(r) FROM (
      SELECT video_id, video_url, video_title, tiktok_username, gmv, orders, post_date, brand_id
      FROM agg
      WHERE post_date IS NOT NULL AND post_date::date >= p_rising_start AND post_date::date < p_rising_end AND gmv >= p_rising_threshold
      ORDER BY gmv DESC LIMIT 20) r), '[]'::json),
    'topVideos', COALESCE((SELECT json_agg(t) FROM (
      SELECT video_id, video_url, video_title, tiktok_username, gmv, orders, post_date, brand_id
      FROM agg
      ORDER BY gmv DESC LIMIT 20) t), '[]'::json)
  );
$function$;
GRANT EXECUTE ON FUNCTION public.whats_cooking_agg(uuid[],date,date,date,date,date,numeric,numeric) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.whos_cooking_agg(
  p_brand_ids uuid[], p_current_start date, p_end date,
  p_prior_start date, p_prior_end date, p_iron_chef_min int
) RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $function$
  WITH cur AS (
    SELECT
      lower(replace(tiktok_username, '@', '')) AS handle,
      max(tiktok_username)     AS tiktok_username,
      min(brand_id::text)::uuid AS brand_id,
      sum(gmv)                 AS gmv,
      sum(orders)              AS orders,
      sum(items_sold)          AS items_sold,
      sum(videos)              AS videos,
      count(DISTINCT report_date) AS days_posted
    FROM daily_creator_stats
    WHERE report_date >= p_current_start AND report_date <= p_end
      AND (p_brand_ids IS NULL OR brand_id = ANY(p_brand_ids))
    GROUP BY 1
  ),
  pri AS (
    SELECT lower(replace(tiktok_username, '@', '')) AS handle, sum(gmv) AS prior_gmv
    FROM daily_creator_stats
    WHERE report_date >= p_prior_start AND report_date < p_prior_end
      AND (p_brand_ids IS NULL OR brand_id = ANY(p_brand_ids))
    GROUP BY 1
  ),
  creators AS (
    SELECT c.handle, c.tiktok_username, c.brand_id, c.gmv, c.orders, c.items_sold, c.videos, c.days_posted,
      COALESCE(p.prior_gmv, 0) AS prior_gmv,
      CASE WHEN COALESCE(p.prior_gmv, 0) > 0 THEN ((c.gmv - p.prior_gmv) / p.prior_gmv * 100)
           WHEN c.gmv > 0 THEN 999 ELSE 0 END AS breakout_pct
    FROM cur c LEFT JOIN pri p ON p.handle = c.handle
    WHERE c.gmv > 0
  ),
  ranked AS (SELECT *, row_number() OVER (ORDER BY gmv DESC, handle) AS rn FROM creators),
  eligible AS (SELECT * FROM ranked WHERE rn > 3)
  SELECT json_build_object(
    'totalGmv',     COALESCE((SELECT sum(gmv) FROM creators), 0),
    'creatorCount', (SELECT count(*) FROM creators),
    'videoCount',   COALESCE((SELECT sum(videos) FROM creators), 0),
    'leaderboard', COALESCE((SELECT json_agg(l) FROM (
      SELECT tiktok_username, gmv, orders, items_sold, videos, brand_id,
             days_posted AS "daysPosted", prior_gmv AS "priorGmv", breakout_pct AS "breakoutPct"
      FROM ranked WHERE rn <= 10 ORDER BY rn) l), '[]'::json),
    'mostProlific', (SELECT row_to_json(m) FROM (
      SELECT tiktok_username, gmv, orders, items_sold, videos, brand_id,
             days_posted AS "daysPosted", prior_gmv AS "priorGmv", breakout_pct AS "breakoutPct"
      FROM eligible WHERE videos >= 3 ORDER BY videos DESC LIMIT 1) m),
    'ironChef', (SELECT row_to_json(i) FROM (
      SELECT tiktok_username, gmv, orders, items_sold, videos, brand_id,
             days_posted AS "daysPosted", prior_gmv AS "priorGmv", breakout_pct AS "breakoutPct"
      FROM eligible WHERE days_posted >= p_iron_chef_min ORDER BY days_posted DESC LIMIT 1) i),
    'breakoutStar', (SELECT row_to_json(b) FROM (
      SELECT tiktok_username, gmv, orders, items_sold, videos, brand_id,
             days_posted AS "daysPosted", prior_gmv AS "priorGmv", breakout_pct AS "breakoutPct"
      FROM eligible WHERE prior_gmv > 50 AND breakout_pct >= 50 AND breakout_pct < 999 ORDER BY breakout_pct DESC LIMIT 1) b)
  );
$function$;
GRANT EXECUTE ON FUNCTION public.whos_cooking_agg(uuid[],date,date,date,date,int) TO authenticated, anon, service_role;
