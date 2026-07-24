-- Who's Cooking v3 "So close" section needs leaderboard rows 11+ ("$412 from
-- the top 10. One post."), but mig 055's whos_cooking_agg stops at rn <= 10.
--
-- Bumping it IN PLACE was applied briefly and immediately reverted: the
-- DEPLOYED formatter renders every leaderboard row it receives (no slice),
-- so prod's scheduled posts would have widened to 15 rows mid-flight - the
-- mig-095 lesson again (never change what prod is actively calling, even
-- compatibly-shaped). Instead:
--   1) whos_cooking_agg is restored byte-identical to mig 055 (rn <= 10).
--   2) whos_cooking_agg_v2 is the same function with rn <= 15; only the v3
--      formatter calls it (renders top 10, reads 11+ for the nudge).
-- v2 drops the mig-055 anon grant on purpose - posts are admin/manager-only.
--
-- (whos_cooking_agg restore omitted here for brevity in the repo record: the
-- applied migration re-ran the exact mig-055 body. See 055 for the text.)

CREATE OR REPLACE FUNCTION public.whos_cooking_agg_v2(
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
      FROM ranked WHERE rn <= 15 ORDER BY rn) l), '[]'::json),
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

GRANT EXECUTE ON FUNCTION public.whos_cooking_agg_v2(uuid[],date,date,date,date,int) TO authenticated, service_role;
