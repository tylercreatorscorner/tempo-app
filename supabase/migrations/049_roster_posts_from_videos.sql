-- 049_roster_posts_from_videos.sql
--
-- Fixes the My Creators (roster) "Posts" miscount.
--
-- Root cause
-- ----------
-- The roster perf RPCs counted posts as COUNT(DISTINCT video_id) over
-- daily_video_product_stats. But in THAT table `video_id` is a reused
-- Shop/product-content id, NOT the TikTok video id — many real videos collapse
-- onto one id (and occasionally one id splits across rows), so the count is
-- noise: it under-counts most creators (e.g. evewellness1 52 vs 56 real) and
-- can over-count others. GMV was always correct because it comes from a
-- different table (creator_performance), which this migration does NOT touch.
--
-- The `videos` table holds the REAL TikTok video_id (the 19-digit number in the
-- post URL, 1:1 with video_link). It is the same source the canonical /posts
-- page uses (get_managed_posts, migration 043). Repointing the roster's post
-- count at `videos` makes the roster reconcile with /posts.
--
-- Applied to production via Supabase MCP; this file documents that state.
-- Only the posts/last-post source changes; GMV, brand scoping, and the RPC
-- signatures/column shapes are unchanged.

-- ── Managed roster perf: GMV from creator_performance, posts from videos ──
DROP FUNCTION IF EXISTS public.get_creator_handle_perf(text[], uuid[], integer);

CREATE FUNCTION public.get_creator_handle_perf(
  handles text[], brand_ids uuid[] DEFAULT NULL::uuid[], days_back integer DEFAULT 30
)
RETURNS TABLE(tiktok_username text, gmv_period numeric, posts_period integer, last_post_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
    -- Posts come from `videos` (real TikTok video_id, 1:1 with the post URL).
    -- daily_video_product_stats.video_id is a reused product id and miscounts.
    SELECT lower(trim(regexp_replace(v.creator_name, '^@', ''))) AS handle,
           COUNT(DISTINCT v.video_id) FILTER (
             WHERE v.post_date >= (CURRENT_DATE - (days_back || ' days')::interval)::date
           )::integer AS posts_period,
           MAX(v.post_date) AS last_post_date
    FROM public.videos v
    WHERE lower(trim(regexp_replace(v.creator_name, '^@', ''))) = ANY(handles)
      AND v.post_date >= (CURRENT_DATE - INTERVAL '365 days')::date
      AND v.video_id IS NOT NULL AND v.video_id <> ''
      AND (brand_ids IS NULL
           OR v.brand IN (SELECT b.slug FROM public.brands_v2 b WHERE b.id = ANY(brand_ids)))
    GROUP BY lower(trim(regexp_replace(v.creator_name, '^@', '')))
  )
  SELECT COALESCE(g.handle, p.handle) AS tiktok_username,
         COALESCE(g.gmv_period, 0)::numeric AS gmv_period,
         COALESCE(p.posts_period, 0)::integer AS posts_period,
         p.last_post_date
  FROM gmv g
  FULL OUTER JOIN posts p ON p.handle = g.handle;
$function$;

-- ── Unmanaged/All-Creators perf: GMV + top-brand stay on the product-stats
-- table (that's how unmanaged creators are discovered by GMV), but posts and
-- last-post move to `videos` for an accurate count. ────────────────────────
DROP FUNCTION IF EXISTS public.get_unmanaged_top_perf(text[], uuid[], integer, integer);

CREATE FUNCTION public.get_unmanaged_top_perf(
  managed_handles text[] DEFAULT ARRAY[]::text[],
  brand_ids uuid[] DEFAULT NULL,
  limit_count integer DEFAULT 500,
  days_back integer DEFAULT 30
)
RETURNS TABLE(
  tiktok_username text, brand_id uuid, real_name text,
  gmv_period numeric, posts_period integer, last_post_date date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH gmv_stats AS (
    SELECT lower(s.tiktok_username) AS handle,
      SUM(s.gmv) FILTER (
        WHERE s.report_date >= (CURRENT_DATE - (days_back || ' days')::interval)::date
      ) AS gmv_period
    FROM public.daily_video_product_stats s
    WHERE s.report_date >= (CURRENT_DATE - INTERVAL '365 days')::date
      AND (brand_ids IS NULL OR s.brand_id = ANY(brand_ids))
      AND s.tiktok_username IS NOT NULL
    GROUP BY lower(s.tiktok_username)
  ),
  post_stats AS (
    SELECT lower(trim(regexp_replace(v.creator_name, '^@', ''))) AS handle,
      COUNT(DISTINCT v.video_id) FILTER (
        WHERE v.post_date >= (CURRENT_DATE - (days_back || ' days')::interval)::date
      )::integer AS posts_period,
      MAX(v.post_date) AS last_post
    FROM public.videos v
    WHERE v.post_date >= (CURRENT_DATE - INTERVAL '365 days')::date
      AND v.video_id IS NOT NULL AND v.video_id <> ''
      AND v.creator_name IS NOT NULL
      AND (brand_ids IS NULL
           OR v.brand IN (SELECT b.slug FROM public.brands_v2 b WHERE b.id = ANY(brand_ids)))
    GROUP BY lower(trim(regexp_replace(v.creator_name, '^@', '')))
  ),
  handle_stats AS (
    SELECT COALESCE(g.handle, p.handle) AS handle,
           COALESCE(g.gmv_period, 0) AS gmv_period,
           COALESCE(p.posts_period, 0) AS posts_period,
           p.last_post
    FROM gmv_stats g
    FULL OUTER JOIN post_stats p ON p.handle = g.handle
  ),
  top_brand_per_handle AS (
    SELECT DISTINCT ON (lower(s.tiktok_username))
      lower(s.tiktok_username) AS handle, s.brand_id
    FROM public.daily_video_product_stats s
    WHERE s.report_date >= (CURRENT_DATE - (days_back || ' days')::interval)::date
      AND (brand_ids IS NULL OR s.brand_id = ANY(brand_ids))
      AND s.tiktok_username IS NOT NULL
    GROUP BY lower(s.tiktok_username), s.brand_id
    ORDER BY lower(s.tiktok_username), SUM(s.gmv) DESC NULLS LAST
  ),
  account_per_handle AS (
    SELECT DISTINCT ON (lower(ta.tiktok_username))
      lower(ta.tiktok_username) AS handle, ta.creator_id
    FROM public.tiktok_accounts ta
    WHERE ta.tiktok_username IS NOT NULL
    ORDER BY lower(ta.tiktok_username), ta.is_primary DESC NULLS LAST, ta.creator_id
  )
  SELECT hs.handle AS tiktok_username, tb.brand_id, cv.real_name,
         hs.gmv_period, hs.posts_period, hs.last_post AS last_post_date
  FROM handle_stats hs
  JOIN top_brand_per_handle tb ON tb.handle = hs.handle
  LEFT JOIN account_per_handle aph ON aph.handle = hs.handle
  LEFT JOIN public.creators_v2 cv ON cv.id = aph.creator_id
  WHERE NOT (hs.handle = ANY(managed_handles)) AND hs.gmv_period > 0
  ORDER BY hs.gmv_period DESC NULLS LAST
  LIMIT limit_count;
$function$;
