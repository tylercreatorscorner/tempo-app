-- Make the two brand-portal RPCs umbrella-aware: accept an array of
-- data-level brand UUIDs instead of a single UUID.
--
-- Why: umbrella brands (leefar) map to multiple per-store brand_ids in the
-- stats tables (leefar_nutrition, leefar_supplements). The umbrella's own
-- UUID exists in NO stats row, so the single-UUID RPCs returned ZERO for a
-- LeeFar brand-portal client. Mirrors the PR #14 fix for the admin roster
-- RPCs (brand_id uuid → brand_ids uuid[]).
--
-- Applied to production via Supabase MCP on 2026-05-XX; this file documents
-- state for reproducibility. The TS data layer (brand-portal-overview.ts,
-- brand-portal-creator.ts) was updated in the same PR to pass the expanded
-- UUID array via resolveBrandDataUuids().

-- ── brand_portal_videos: p_brand_id uuid → p_brand_ids uuid[] ────────────
DROP FUNCTION IF EXISTS public.brand_portal_videos(uuid, text[], date, date, date, date);

CREATE OR REPLACE FUNCTION public.brand_portal_videos(
  p_brand_ids  uuid[],
  p_handles    text[],
  p_start_date date,
  p_end_date   date,
  p_prior_start date DEFAULT NULL,
  p_prior_end   date DEFAULT NULL
)
RETURNS TABLE(
  video_id text, video_title text, video_url text, tiktok_username text,
  post_date timestamp with time zone,
  total_gmv numeric, total_orders bigint,
  period_gmv numeric, period_orders bigint,
  prior_gmv numeric, prior_orders bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  WITH active AS (
    SELECT DISTINCT video_id
    FROM public.daily_video_product_stats
    WHERE brand_id = ANY(p_brand_ids)
      AND lower(replace(tiktok_username, '@', '')) = ANY(p_handles)
      AND report_date BETWEEN p_start_date AND p_end_date
      AND video_id IS NOT NULL
  )
  SELECT
    dvps.video_id,
    (array_agg(dvps.video_title ORDER BY dvps.report_date DESC) FILTER (WHERE dvps.video_title IS NOT NULL))[1] AS video_title,
    (array_agg(dvps.video_url   ORDER BY dvps.report_date DESC) FILTER (WHERE dvps.video_url   IS NOT NULL))[1] AS video_url,
    (array_agg(dvps.tiktok_username ORDER BY dvps.report_date DESC))[1] AS tiktok_username,
    MIN(dvps.post_date) AS post_date,
    COALESCE(SUM(dvps.gmv), 0) AS total_gmv,
    COALESCE(SUM(dvps.orders), 0)::bigint AS total_orders,
    COALESCE(SUM(dvps.gmv) FILTER (
      WHERE dvps.report_date BETWEEN p_start_date AND p_end_date
    ), 0) AS period_gmv,
    COALESCE(SUM(dvps.orders) FILTER (
      WHERE dvps.report_date BETWEEN p_start_date AND p_end_date
    ), 0)::bigint AS period_orders,
    COALESCE(SUM(dvps.gmv) FILTER (
      WHERE p_prior_start IS NOT NULL
        AND dvps.report_date BETWEEN p_prior_start AND p_prior_end
    ), 0) AS prior_gmv,
    COALESCE(SUM(dvps.orders) FILTER (
      WHERE p_prior_start IS NOT NULL
        AND dvps.report_date BETWEEN p_prior_start AND p_prior_end
    ), 0)::bigint AS prior_orders
  FROM public.daily_video_product_stats dvps
  JOIN active a ON a.video_id = dvps.video_id
  WHERE dvps.brand_id = ANY(p_brand_ids)
  GROUP BY dvps.video_id;
$function$;

-- ── brand_total_period_gmv: p_brand_id uuid → p_brand_ids uuid[] ─────────
DROP FUNCTION IF EXISTS public.brand_total_period_gmv(uuid, date, date);

CREATE OR REPLACE FUNCTION public.brand_total_period_gmv(
  p_brand_ids  uuid[],
  p_start_date date,
  p_end_date   date
)
RETURNS TABLE(total_gmv numeric, total_orders bigint, total_posts bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT
    COALESCE(SUM(gmv), 0)::numeric AS total_gmv,
    COALESCE(SUM(orders), 0)::bigint AS total_orders,
    COALESCE(SUM(videos), 0)::bigint AS total_posts
  FROM public.daily_creator_stats
  WHERE brand_id = ANY(p_brand_ids)
    AND report_date BETWEEN p_start_date AND p_end_date;
$function$;