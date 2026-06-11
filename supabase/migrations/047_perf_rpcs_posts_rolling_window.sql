-- Switch "posts" from a calendar-month count to a rolling days_back window so
-- the simplified My Creators page can show "Posts (last 30 days)" that follows
-- the period selector. Renames posts_this_month → posts_period in both RPCs.
-- Applied to production via Supabase MCP; this file documents state.

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
    SELECT s.tiktok_username AS handle,
           COUNT(DISTINCT s.video_id) FILTER (
             WHERE s.post_date >= (CURRENT_DATE - (days_back || ' days')::interval)::date
           )::integer AS posts_period,
           MAX(s.post_date) AS last_post_date
    FROM public.daily_video_product_stats s
    WHERE s.tiktok_username = ANY(handles)
      AND s.report_date >= (CURRENT_DATE - INTERVAL '365 days')::date
      AND (brand_ids IS NULL OR s.brand_id = ANY(brand_ids))
    GROUP BY s.tiktok_username
  )
  SELECT COALESCE(g.handle, p.handle) AS tiktok_username,
         COALESCE(g.gmv_period, 0)::numeric AS gmv_period,
         COALESCE(p.posts_period, 0)::integer AS posts_period,
         p.last_post_date
  FROM gmv g
  FULL OUTER JOIN posts p ON p.handle = g.handle;
$function$;

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
  WITH handle_stats AS (
    SELECT lower(s.tiktok_username) AS handle,
      SUM(s.gmv) FILTER (
        WHERE s.report_date >= (CURRENT_DATE - (days_back || ' days')::interval)::date
      ) AS gmv_period,
      COUNT(DISTINCT s.video_id) FILTER (
        WHERE s.post_date >= (CURRENT_DATE - (days_back || ' days')::interval)::date
      )::integer AS posts_period,
      MAX(s.post_date) AS last_post
    FROM public.daily_video_product_stats s
    WHERE s.report_date >= (CURRENT_DATE - INTERVAL '365 days')::date
      AND (brand_ids IS NULL OR s.brand_id = ANY(brand_ids))
      AND s.tiktok_username IS NOT NULL
    GROUP BY lower(s.tiktok_username)
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
