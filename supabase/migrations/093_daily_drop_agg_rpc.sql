-- Daily Drop core numbers in ONE call.
--
-- The Daily Drop's remaining table pulls (yesterday creators, day-before sum,
-- top products) ran as raw PostgREST selects through RLS. Measured under the
-- authenticated role: ONE page of the yesterday-creators pull = 5,128ms,
-- because the policy expression (get_tenant_id() / get_user_role() /
-- auth_user_allowed_brand_uuids() / is_platform_admin()) is evaluated per
-- scanned row - the report_date index visits ~40k rows to find the day's
-- ~1.7k gmv>0 rows. Three such statements in parallel blew the authenticator
-- role's 8s statement_timeout (57014) and the Daily Drop 500'd.
--
-- SECURITY DEFINER bypasses RLS (route is auth-gated; scope enforcement is
-- the brand-uuid param, same trust model as dcs_gmv_sum / whats_cooking_agg).
CREATE OR REPLACE FUNCTION public.get_daily_drop_agg(
  p_brand_ids     uuid[],              -- NULL = all brands
  p_yesterday     date,                -- creator-anchor "yesterday"
  p_day_before    date,
  p_product_day   date                 -- product-anchor "yesterday"
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
SET statement_timeout = '30s'
AS $$
  WITH yc AS (
    SELECT tiktok_username, SUM(gmv) AS gmv
    FROM daily_creator_stats
    WHERE report_date = p_yesterday
      AND gmv > 0
      AND (p_brand_ids IS NULL OR brand_id = ANY(p_brand_ids))
    GROUP BY tiktok_username
  ),
  db AS (
    SELECT COALESCE(SUM(gmv), 0) AS gmv
    FROM daily_creator_stats
    WHERE report_date = p_day_before
      AND gmv > 0
      AND (p_brand_ids IS NULL OR brand_id = ANY(p_brand_ids))
  ),
  tp AS (
    SELECT COALESCE(product_name, 'Unknown Product') AS name, SUM(gmv) AS gmv
    FROM daily_video_product_stats
    WHERE report_date = p_product_day
      AND gmv > 0
      AND (p_brand_ids IS NULL OR brand_id = ANY(p_brand_ids))
    GROUP BY COALESCE(product_name, 'Unknown Product')
    ORDER BY SUM(gmv) DESC
    LIMIT 5
  )
  SELECT jsonb_build_object(
    'yesterday_gmv', (SELECT COALESCE(SUM(gmv), 0) FROM yc),
    'day_before_gmv', (SELECT gmv FROM db),
    'top_creators', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('handle', t.tiktok_username, 'gmv', t.gmv))
       FROM (SELECT * FROM yc ORDER BY gmv DESC LIMIT 5) t),
      '[]'::jsonb
    ),
    'top_products', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('name', tp.name, 'gmv', tp.gmv)) FROM tp),
      '[]'::jsonb
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_drop_agg(uuid[], date, date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_daily_drop_agg(uuid[], date, date, date) IS
  'Daily Drop headline numbers: yesterday total + top-5 creators (daily_creator_stats), day-before total, top-5 products (daily_video_product_stats). Replaces three per-row-RLS paginated reads that broke the 8s timeout.';
