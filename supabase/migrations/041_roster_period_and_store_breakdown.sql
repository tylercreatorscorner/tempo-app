-- Period-aware roster RPCs + per-store GMV breakdown.
--
-- Adds a `days_back integer DEFAULT 30` parameter to all three roster RPCs
-- so the My Creators page can re-scope GMV / ROI / total GMV to Yesterday,
-- 7d, 30d, 90d, or YTD. posts_this_month stays calendar-month and
-- last_post_date now uses a 365-day window so creators silent for months
-- still show "Xd ago" instead of "—".
--
-- Adds a NEW RPC `get_creator_handle_brand_gmv` returning per-handle,
-- per-brand GMV for the same period, which powers:
--   • The side panel "Revenue by store" section
--   • The row's store-mix indicator (e.g. LeeFar "N+S")
--   • The LeeFar Nutrition / Supplements sub-pill filter
--
-- This file documents what was applied via Supabase MCP on 2026-05-13.

-- ── 1. get_creator_handle_perf: add days_back ────────────────────────────
DROP FUNCTION IF EXISTS public.get_creator_handle_perf(text[], uuid[]);

CREATE OR REPLACE FUNCTION public.get_creator_handle_perf(
  handles    text[],
  brand_ids  uuid[]  DEFAULT NULL,
  days_back  integer DEFAULT 30
)
RETURNS TABLE (
  tiktok_username  text,
  gmv_period       numeric,
  posts_this_month integer,
  last_post_date   date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.tiktok_username,
    COALESCE(
      SUM(s.gmv) FILTER (
        WHERE s.report_date >= (CURRENT_DATE - (days_back || ' days')::interval)::date
      ),
      0
    )::numeric AS gmv_period,
    COUNT(DISTINCT s.video_id) FILTER (
      WHERE s.post_date >= date_trunc('month', CURRENT_DATE)::date
    )::integer AS posts_this_month,
    MAX(s.post_date) AS last_post_date
  FROM public.daily_video_product_stats s
  WHERE s.tiktok_username = ANY(handles)
    AND s.report_date >= (CURRENT_DATE - INTERVAL '365 days')::date
    AND (brand_ids IS NULL OR s.brand_id = ANY(brand_ids))
  GROUP BY s.tiktok_username;
$$;

-- ── 2. get_creator_handle_brand_gmv: new RPC for per-store breakdown ────
CREATE OR REPLACE FUNCTION public.get_creator_handle_brand_gmv(
  handles    text[],
  brand_ids  uuid[]  DEFAULT NULL,
  days_back  integer DEFAULT 30
)
RETURNS TABLE (
  tiktok_username text,
  brand_id        uuid,
  gmv_period      numeric,
  posts_period    integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.tiktok_username,
    s.brand_id,
    COALESCE(SUM(s.gmv), 0)::numeric AS gmv_period,
    COUNT(DISTINCT s.video_id)::integer AS posts_period
  FROM public.daily_video_product_stats s
  WHERE s.tiktok_username = ANY(handles)
    AND s.report_date >= (CURRENT_DATE - (days_back || ' days')::interval)::date
    AND (brand_ids IS NULL OR s.brand_id = ANY(brand_ids))
  GROUP BY s.tiktok_username, s.brand_id;
$$;

-- ── 3. get_unmanaged_top_perf: add days_back + rename gmv field ─────────
DROP FUNCTION IF EXISTS public.get_unmanaged_top_perf(text[], uuid[], integer);

CREATE OR REPLACE FUNCTION public.get_unmanaged_top_perf(
  managed_handles  text[]  DEFAULT ARRAY[]::text[],
  brand_ids        uuid[]  DEFAULT NULL,
  limit_count      integer DEFAULT 500,
  days_back        integer DEFAULT 30
)
RETURNS TABLE (
  tiktok_username  text,
  brand_id         uuid,
  real_name        text,
  gmv_period       numeric,
  posts_this_month integer,
  last_post_date   date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH handle_stats AS (
    SELECT
      lower(s.tiktok_username) AS handle,
      SUM(s.gmv) FILTER (
        WHERE s.report_date >= (CURRENT_DATE - (days_back || ' days')::interval)::date
      ) AS gmv_period,
      COUNT(DISTINCT s.video_id) FILTER (
        WHERE s.post_date >= date_trunc('month', CURRENT_DATE)::date
      )::integer AS posts_month,
      MAX(s.post_date) AS last_post
    FROM public.daily_video_product_stats s
    WHERE s.report_date >= (CURRENT_DATE - INTERVAL '365 days')::date
      AND (brand_ids IS NULL OR s.brand_id = ANY(brand_ids))
      AND s.tiktok_username IS NOT NULL
    GROUP BY lower(s.tiktok_username)
  ),
  top_brand_per_handle AS (
    SELECT DISTINCT ON (lower(s.tiktok_username))
      lower(s.tiktok_username) AS handle,
      s.brand_id
    FROM public.daily_video_product_stats s
    WHERE s.report_date >= (CURRENT_DATE - (days_back || ' days')::interval)::date
      AND (brand_ids IS NULL OR s.brand_id = ANY(brand_ids))
      AND s.tiktok_username IS NOT NULL
    GROUP BY lower(s.tiktok_username), s.brand_id
    ORDER BY lower(s.tiktok_username), SUM(s.gmv) DESC NULLS LAST
  ),
  account_per_handle AS (
    SELECT DISTINCT ON (lower(ta.tiktok_username))
      lower(ta.tiktok_username) AS handle,
      ta.creator_id
    FROM public.tiktok_accounts ta
    WHERE ta.tiktok_username IS NOT NULL
    ORDER BY lower(ta.tiktok_username), ta.is_primary DESC NULLS LAST, ta.creator_id
  )
  SELECT
    hs.handle AS tiktok_username,
    tb.brand_id,
    cv.real_name,
    hs.gmv_period,
    hs.posts_month AS posts_this_month,
    hs.last_post AS last_post_date
  FROM handle_stats hs
  JOIN top_brand_per_handle tb ON tb.handle = hs.handle
  LEFT JOIN account_per_handle aph ON aph.handle = hs.handle
  LEFT JOIN public.creators_v2 cv ON cv.id = aph.creator_id
  WHERE NOT (hs.handle = ANY(managed_handles))
    AND hs.gmv_period > 0
  ORDER BY hs.gmv_period DESC NULLS LAST
  LIMIT limit_count;
$$;
