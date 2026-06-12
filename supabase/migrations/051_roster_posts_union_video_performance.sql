-- 051_roster_posts_union_video_performance.sql
--
-- Make the roster Posts count self-heal the Video List report's lag.
--
-- Context: posts are counted from `videos`, which is loaded from TikTok's
-- "Video List" report — the only report with EVERY video, but it finalizes
-- ~2 days AFTER the Creator/Product/Video-Data reports. So the most recent
-- days' videos are missing from `videos` until that report catches up, and the
-- roster trails (e.g. Chian/Catakor showed 14 while TikTok showed 17).
--
-- The "Video Data" report (`video_performance`) lands those videos earlier, but
-- only for videos that generated sales. Counting DISTINCT video_id across BOTH
-- tables therefore surfaces sales videos immediately while still picking up the
-- full set once the Video List report arrives — and since both carry the real
-- 19-digit TikTok video_id, the union can't double-count. The only thing it
-- can't recover is a NON-sales video during the ~2-day Video List lag (it
-- exists in no uploadable report yet).
--
-- GMV is untouched (it comes from creator_performance). Only the posts/last-post
-- source changes; RPC signatures/columns are unchanged.

-- ── Managed roster perf ────────────────────────────────────────────────────
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
  -- All posts = videos (every video, lags) UNION video_performance (sales
  -- videos, fresh). Both keyed by the real TikTok video_id, so DISTINCT dedupes.
  all_posts AS (
    SELECT lower(trim(regexp_replace(v.creator_name, '^@', ''))) AS handle,
           v.video_id, v.post_date
    FROM public.videos v
    WHERE lower(trim(regexp_replace(v.creator_name, '^@', ''))) = ANY(handles)
      AND v.video_id IS NOT NULL AND v.video_id <> ''
      AND v.post_date >= (CURRENT_DATE - INTERVAL '365 days')::date
      AND (brand_ids IS NULL
           OR v.brand IN (SELECT b.slug FROM public.brands_v2 b WHERE b.id = ANY(brand_ids)))
    UNION
    SELECT lower(trim(regexp_replace(vp.creator_name, '^@', ''))) AS handle,
           vp.video_id, vp.post_date
    FROM public.video_performance vp
    WHERE lower(trim(regexp_replace(vp.creator_name, '^@', ''))) = ANY(handles)
      AND vp.video_id IS NOT NULL AND vp.video_id <> ''
      AND vp.post_date >= (CURRENT_DATE - INTERVAL '365 days')::date
      AND (brand_ids IS NULL
           OR vp.brand IN (SELECT b.slug FROM public.brands_v2 b WHERE b.id = ANY(brand_ids)))
  ),
  posts AS (
    SELECT ap.handle,
           COUNT(DISTINCT ap.video_id) FILTER (
             WHERE ap.post_date >= (CURRENT_DATE - (days_back || ' days')::interval)::date
           )::integer AS posts_period,
           MAX(ap.post_date) AS last_post_date
    FROM all_posts ap
    GROUP BY ap.handle
  )
  SELECT COALESCE(g.handle, p.handle) AS tiktok_username,
         COALESCE(g.gmv_period, 0)::numeric AS gmv_period,
         COALESCE(p.posts_period, 0)::integer AS posts_period,
         p.last_post_date
  FROM gmv g
  FULL OUTER JOIN posts p ON p.handle = g.handle;
$function$;

-- ── Unmanaged/All-Creators perf ────────────────────────────────────────────
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
  all_posts AS (
    SELECT lower(trim(regexp_replace(v.creator_name, '^@', ''))) AS handle,
           v.video_id, v.post_date
    FROM public.videos v
    WHERE v.video_id IS NOT NULL AND v.video_id <> '' AND v.creator_name IS NOT NULL
      AND v.post_date >= (CURRENT_DATE - INTERVAL '365 days')::date
      AND (brand_ids IS NULL
           OR v.brand IN (SELECT b.slug FROM public.brands_v2 b WHERE b.id = ANY(brand_ids)))
    UNION
    SELECT lower(trim(regexp_replace(vp.creator_name, '^@', ''))) AS handle,
           vp.video_id, vp.post_date
    FROM public.video_performance vp
    WHERE vp.video_id IS NOT NULL AND vp.video_id <> '' AND vp.creator_name IS NOT NULL
      AND vp.post_date >= (CURRENT_DATE - INTERVAL '365 days')::date
      AND (brand_ids IS NULL
           OR vp.brand IN (SELECT b.slug FROM public.brands_v2 b WHERE b.id = ANY(brand_ids)))
  ),
  post_stats AS (
    SELECT handle,
      COUNT(DISTINCT video_id) FILTER (
        WHERE post_date >= (CURRENT_DATE - (days_back || ' days')::interval)::date
      )::integer AS posts_period,
      MAX(post_date) AS last_post
    FROM all_posts
    GROUP BY handle
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
