-- 042_roster_gmv_from_creator_performance.sql
--
-- Reconciliation fix (#1): the My Creators (/roster) GMV totals were read from
-- the v2 video-level table `daily_video_product_stats`, which
--   (a) only captures GMV attributed to a tracked video — a ~17-22% SUBSET of
--       total creator GMV every month, and
--   (b) is fed by a lossy legacy->v2 sync trigger whose hardcoded brand CASE
--       silently drops whole brands (e.g. cosrx — $780k/mo missing).
-- Earnings reads the CSV-fed creator-level table `creator_performance` (the
-- true source of truth), so the two screens disagreed by ~17-22%.
--
-- This repoints the GMV side of the two roster RPCs at `creator_performance`,
-- while keeping post counts / last-post-date from the video table (those are
-- inherently video-level). Only /api/roster calls these RPCs.
--
-- Bridging: creator_performance is keyed by (brand TEXT slug, creator_name);
-- the roster passes brand_ids (uuid[]) + handles (tiktok usernames). We bridge
-- slug<->uuid via brands_v2 — verified 2026-05-29 that every cp brand slug
-- exists in brands_v2, and cp.creator_name == the lowercased tiktok handle.
--
-- Applied via Supabase MCP on 2026-05-29.

-- ── get_creator_handle_perf: GMV from creator_performance; posts/last_post from dvps
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
  WITH gmv AS (
    SELECT lower(cp.creator_name) AS handle,
           COALESCE(SUM(cp.gmv) FILTER (
             WHERE cp.report_date >= (CURRENT_DATE - (days_back || ' days')::interval)::date
           ), 0)::numeric AS gmv_period
    FROM public.creator_performance cp
    WHERE cp.period_type = 'daily'
      AND lower(cp.creator_name) = ANY(handles)
      AND cp.report_date >= (CURRENT_DATE - INTERVAL '365 days')::date
      AND (brand_ids IS NULL
           OR cp.brand IN (SELECT b.slug FROM public.brands_v2 b WHERE b.id = ANY(brand_ids)))
    GROUP BY lower(cp.creator_name)
  ),
  posts AS (
    SELECT s.tiktok_username AS handle,
           COUNT(DISTINCT s.video_id) FILTER (
             WHERE s.post_date >= date_trunc('month', CURRENT_DATE)::date
           )::integer AS posts_this_month,
           MAX(s.post_date) AS last_post_date
    FROM public.daily_video_product_stats s
    WHERE s.tiktok_username = ANY(handles)
      AND s.report_date >= (CURRENT_DATE - INTERVAL '365 days')::date
      AND (brand_ids IS NULL OR s.brand_id = ANY(brand_ids))
    GROUP BY s.tiktok_username
  )
  SELECT COALESCE(g.handle, p.handle) AS tiktok_username,
         COALESCE(g.gmv_period, 0)::numeric AS gmv_period,
         COALESCE(p.posts_this_month, 0)::integer AS posts_this_month,
         p.last_post_date
  FROM gmv g
  FULL OUTER JOIN posts p ON p.handle = g.handle;
$$;

GRANT EXECUTE ON FUNCTION public.get_creator_handle_perf(text[], uuid[], integer) TO authenticated, service_role;

-- ── get_creator_handle_brand_gmv: per-brand GMV from creator_performance; posts from dvps
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
  WITH gmv AS (
    SELECT lower(cp.creator_name) AS handle,
           b.id AS brand_id,
           SUM(cp.gmv)::numeric AS gmv_period
    FROM public.creator_performance cp
    JOIN public.brands_v2 b ON b.slug = cp.brand
    WHERE cp.period_type = 'daily'
      AND lower(cp.creator_name) = ANY(handles)
      AND cp.report_date >= (CURRENT_DATE - (days_back || ' days')::interval)::date
      AND (brand_ids IS NULL OR b.id = ANY(brand_ids))
    GROUP BY lower(cp.creator_name), b.id
  ),
  posts AS (
    SELECT s.tiktok_username AS handle,
           s.brand_id,
           COUNT(DISTINCT s.video_id)::integer AS posts_period
    FROM public.daily_video_product_stats s
    WHERE s.tiktok_username = ANY(handles)
      AND s.report_date >= (CURRENT_DATE - (days_back || ' days')::interval)::date
      AND (brand_ids IS NULL OR s.brand_id = ANY(brand_ids))
    GROUP BY s.tiktok_username, s.brand_id
  )
  SELECT COALESCE(g.handle, p.handle) AS tiktok_username,
         COALESCE(g.brand_id, p.brand_id) AS brand_id,
         COALESCE(g.gmv_period, 0)::numeric AS gmv_period,
         COALESCE(p.posts_period, 0)::integer AS posts_period
  FROM gmv g
  FULL OUTER JOIN posts p ON p.handle = g.handle AND p.brand_id = g.brand_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_creator_handle_brand_gmv(text[], uuid[], integer) TO authenticated, service_role;
