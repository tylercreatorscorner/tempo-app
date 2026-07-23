-- /posts gets a DATE BASIS: 'earned' (the new standard) vs 'posted'.
--
-- Tyler, on seeing $59,830 for a $1.5M week: the page's row set was videos
-- POSTED in the window, so ~94% of the window's video GMV (evergreen videos
-- posted earlier) was invisible. Measured on the same 7d window: posted-basis
-- $59,830 vs all video-attributed GMV $999,363. His call: the DEFAULT shows
-- all GMV earned during the range; a filter narrows to videos posted in the
-- range (the publishing/review lens).
--
--   p_date_basis = 'earned': row set = every video WITH video_performance
--     activity in [start, end] (any post_date). Built by aggregating
--     video_performance directly (the get_top_videos_by_window_gmv shape:
--     mig-079 managed-first-then-dedup, max-gmv row per (video, product, day),
--     engagement MAX-per-day-then-SUM) with videos LEFT-JOINed for
--     title/url/post_date - a recent earner may have no videos row yet, and an
--     INNER JOIN would silently drop it.
--   p_date_basis = 'posted': the existing behavior, unchanged (videos posted
--     in-window, money+engagement windowed via the per-video LATERAL).
--
-- The wrapper signatures gain the param WITH DEFAULT 'posted' so the deployed
-- app keeps working during the deploy window; the new app code passes the
-- basis explicitly. Function-level statement_timeout because the earned
-- branch scans the window's full video_performance slice.
--
-- Also: get_video_reviews_in_window is replaced by get_video_review_aggs
-- WITHOUT date scoping - the earned basis includes pre-window posts, so
-- window-scoping the review aggregates would silently drop their review
-- badges. video_reviews is hand-written (small forever); one aggregate pass
-- over all of it is cheaper than getting the window logic wrong twice.

DROP FUNCTION IF EXISTS public.get_managed_posts(text[], date, date, boolean, int);
DROP FUNCTION IF EXISTS public.get_managed_posts_totals(text[], date, date, boolean);
DROP FUNCTION IF EXISTS public.get_managed_posts_base(text[], date, date, boolean);
DROP FUNCTION IF EXISTS public.get_video_reviews_in_window(text[], date, date, uuid);

CREATE FUNCTION public.get_managed_posts_base(
  p_brand_slugs text[], p_start_date date, p_end_date date, p_managed_only boolean,
  p_date_basis text DEFAULT 'posted'
)
RETURNS TABLE(
  video_id text, video_title text, video_url text, creator_handle text,
  brand_slug text, brand_name text, post_date date,
  views bigint, likes bigint, comments bigint, shares bigint,
  gmv numeric, orders bigint, items_sold bigint, is_managed boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public'
SET statement_timeout = '60s'
AS $function$
BEGIN
  IF p_date_basis = 'earned' THEN
    -- Row set = videos that EARNED (or logged any activity) in the window.
    RETURN QUERY
    WITH dd AS (
      SELECT DISTINCT ON (vp.video_id, vp.product_id, vp.report_date)
             vp.video_id, vp.product_id, vp.report_date,
             vp.gmv, vp.orders, vp.items_sold,
             vp.views, vp.likes, vp.comments, vp.shares,
             vp.brand, vp.video_title,
             lower(btrim(regexp_replace(vp.creator_name, '^@', ''))) AS handle
      FROM video_performance vp
      WHERE vp.period_type = 'daily'
        AND vp.report_date BETWEEN p_start_date AND p_end_date
        AND vp.brand = ANY(p_brand_slugs)
        AND vp.video_id IS NOT NULL AND vp.video_id <> ''
        AND vp.creator_name IS NOT NULL AND vp.creator_name <> ''
        AND (NOT p_managed_only OR EXISTS (
          SELECT 1 FROM managed_brand_handles mp
          WHERE mp.brand_slug = vp.brand
            AND mp.handle = lower(btrim(regexp_replace(vp.creator_name, '^@', '')))
        ))
      ORDER BY vp.video_id, vp.product_id, vp.report_date, vp.gmv DESC
    ),
    agg AS (
      SELECT d.video_id,
             SUM(d.gmv)::numeric        AS gmv,
             SUM(d.orders)::bigint      AS orders,
             SUM(d.items_sold)::bigint  AS items_sold,
             (array_agg(d.handle      ORDER BY d.gmv DESC, d.brand))[1] AS handle,
             (array_agg(d.brand       ORDER BY d.gmv DESC, d.brand))[1] AS brand,
             (array_agg(d.video_title ORDER BY d.gmv DESC, d.brand))[1] AS vp_title
      FROM dd d
      GROUP BY d.video_id
      -- "Earned" means EARNED: the daily export logs zero-GMV activity rows
      -- for ~90% of tracked videos (178,866 videos had a row in a 7d window;
      -- the GMV total is identical without them). The zero tail belongs to
      -- the posted basis (the review queue), not the money lens.
      HAVING SUM(d.gmv) > 0
    ),
    eng AS (
      SELECT t.video_id,
             SUM(t.day_views)::bigint    AS views,
             SUM(t.day_likes)::bigint    AS likes,
             SUM(t.day_comments)::bigint AS comments,
             SUM(t.day_shares)::bigint   AS shares
      FROM (
        SELECT d.video_id, d.report_date,
               MAX(d.views) AS day_views, MAX(d.likes) AS day_likes,
               MAX(d.comments) AS day_comments, MAX(d.shares) AS day_shares
        FROM dd d
        WHERE d.video_id IN (SELECT a.video_id FROM (
          SELECT dd2.video_id FROM dd dd2 GROUP BY dd2.video_id HAVING SUM(dd2.gmv) > 0
        ) a)
        GROUP BY d.video_id, d.report_date
      ) t
      GROUP BY t.video_id
    )
    SELECT
      a.video_id,
      COALESCE(NULLIF(btrim(v.video_name), ''), NULLIF(btrim(a.vp_title), '--'), '(untitled)'),
      -- NEVER video_performance.video_link (mig 079: ~0% usable). videos row
      -- first, synthesized permalink otherwise.
      COALESCE(NULLIF(btrim(v.video_link), ''),
               'https://www.tiktok.com/@' || a.handle || '/video/' || a.video_id),
      a.handle, a.brand, b.name, v.post_date,
      e.views, e.likes, e.comments, e.shares,
      a.gmv, a.orders, a.items_sold,
      (mp.handle IS NOT NULL) AS is_managed
    FROM agg a
    JOIN brands_v2 b ON b.slug = a.brand
    LEFT JOIN videos v ON v.video_id = a.video_id AND v.brand = a.brand
    LEFT JOIN eng e ON e.video_id = a.video_id
    LEFT JOIN managed_brand_handles mp
      ON mp.brand_slug = a.brand AND mp.handle = a.handle;
  ELSIF p_managed_only THEN
    RETURN QUERY
    WITH scoped AS (
      SELECT
        v.video_id,
        COALESCE(NULLIF(btrim(v.video_name), ''), '(untitled)') AS video_title,
        v.video_link AS video_url,
        lower(btrim(regexp_replace(v.creator_name, '^@', ''))) AS creator_handle,
        v.brand AS brand_slug,
        b.name AS brand_name,
        v.post_date,
        w.views, w.likes, w.comments, w.shares,
        COALESCE(w.gmv, 0)::numeric        AS gmv,
        COALESCE(w.orders, 0)::bigint      AS orders,
        COALESCE(w.items_sold, 0)::bigint  AS items_sold,
        true AS is_managed
      FROM videos v
      JOIN managed_brand_handles mp
        ON mp.brand_slug = v.brand
       AND mp.handle = lower(btrim(regexp_replace(v.creator_name, '^@', '')))
      JOIN brands_v2 b ON b.slug = v.brand
      LEFT JOIN LATERAL (
        WITH rw AS (
          SELECT vp.product_id, vp.report_date, vp.gmv, vp.orders, vp.items_sold,
                 vp.views, vp.likes, vp.comments, vp.shares
          FROM video_performance vp
          WHERE vp.video_id = v.video_id
            AND vp.brand = v.brand
            AND vp.period_type = 'daily'
            AND vp.report_date BETWEEN p_start_date AND p_end_date
        ),
        money AS (
          SELECT SUM(x.gmv) AS gmv, SUM(x.orders) AS orders, SUM(x.items_sold) AS items_sold
          FROM (
            SELECT DISTINCT ON (r.product_id, r.report_date) r.gmv, r.orders, r.items_sold
            FROM rw r
            ORDER BY r.product_id, r.report_date, r.gmv DESC
          ) x
        ),
        eng AS (
          SELECT SUM(d.day_views)::bigint    AS views,
                 SUM(d.day_likes)::bigint    AS likes,
                 SUM(d.day_comments)::bigint AS comments,
                 SUM(d.day_shares)::bigint   AS shares
          FROM (
            SELECT r.report_date,
                   MAX(r.views) AS day_views, MAX(r.likes) AS day_likes,
                   MAX(r.comments) AS day_comments, MAX(r.shares) AS day_shares
            FROM rw r
            GROUP BY r.report_date
          ) d
        )
        SELECT money.gmv, money.orders, money.items_sold,
               eng.views, eng.likes, eng.comments, eng.shares
        FROM money CROSS JOIN eng
      ) w ON true
      WHERE v.brand = ANY(p_brand_slugs)
        AND v.post_date >= p_start_date
        AND v.post_date <= p_end_date
        AND v.video_id IS NOT NULL AND v.video_id <> ''
        AND v.creator_name IS NOT NULL AND v.creator_name <> ''
    )
    SELECT DISTINCT ON (s.video_id)
      s.video_id, s.video_title, s.video_url, s.creator_handle, s.brand_slug,
      s.brand_name, s.post_date, s.views, s.likes, s.comments, s.shares,
      s.gmv, s.orders, s.items_sold, s.is_managed
    FROM scoped s
    ORDER BY s.video_id, s.gmv DESC, s.views DESC NULLS LAST, s.post_date DESC NULLS LAST, s.brand_slug;
  ELSE
    RETURN QUERY
    WITH scoped AS (
      SELECT
        v.video_id,
        COALESCE(NULLIF(btrim(v.video_name), ''), '(untitled)') AS video_title,
        v.video_link AS video_url,
        lower(btrim(regexp_replace(v.creator_name, '^@', ''))) AS creator_handle,
        v.brand AS brand_slug,
        b.name AS brand_name,
        v.post_date,
        w.views, w.likes, w.comments, w.shares,
        COALESCE(w.gmv, 0)::numeric        AS gmv,
        COALESCE(w.orders, 0)::bigint      AS orders,
        COALESCE(w.items_sold, 0)::bigint  AS items_sold,
        (mp.handle IS NOT NULL) AS is_managed
      FROM videos v
      JOIN brands_v2 b ON b.slug = v.brand
      LEFT JOIN managed_brand_handles mp
        ON mp.brand_slug = v.brand
       AND mp.handle = lower(btrim(regexp_replace(v.creator_name, '^@', '')))
      LEFT JOIN LATERAL (
        WITH rw AS (
          SELECT vp.product_id, vp.report_date, vp.gmv, vp.orders, vp.items_sold,
                 vp.views, vp.likes, vp.comments, vp.shares
          FROM video_performance vp
          WHERE vp.video_id = v.video_id
            AND vp.brand = v.brand
            AND vp.period_type = 'daily'
            AND vp.report_date BETWEEN p_start_date AND p_end_date
        ),
        money AS (
          SELECT SUM(x.gmv) AS gmv, SUM(x.orders) AS orders, SUM(x.items_sold) AS items_sold
          FROM (
            SELECT DISTINCT ON (r.product_id, r.report_date) r.gmv, r.orders, r.items_sold
            FROM rw r
            ORDER BY r.product_id, r.report_date, r.gmv DESC
          ) x
        ),
        eng AS (
          SELECT SUM(d.day_views)::bigint    AS views,
                 SUM(d.day_likes)::bigint    AS likes,
                 SUM(d.day_comments)::bigint AS comments,
                 SUM(d.day_shares)::bigint   AS shares
          FROM (
            SELECT r.report_date,
                   MAX(r.views) AS day_views, MAX(r.likes) AS day_likes,
                   MAX(r.comments) AS day_comments, MAX(r.shares) AS day_shares
            FROM rw r
            GROUP BY r.report_date
          ) d
        )
        SELECT money.gmv, money.orders, money.items_sold,
               eng.views, eng.likes, eng.comments, eng.shares
        FROM money CROSS JOIN eng
      ) w ON true
      WHERE v.brand = ANY(p_brand_slugs)
        AND v.post_date >= p_start_date
        AND v.post_date <= p_end_date
        AND v.video_id IS NOT NULL AND v.video_id <> ''
        AND v.creator_name IS NOT NULL AND v.creator_name <> ''
    )
    SELECT DISTINCT ON (s.video_id)
      s.video_id, s.video_title, s.video_url, s.creator_handle, s.brand_slug,
      s.brand_name, s.post_date, s.views, s.likes, s.comments, s.shares,
      s.gmv, s.orders, s.items_sold, s.is_managed
    FROM scoped s
    ORDER BY s.video_id, s.gmv DESC, s.views DESC NULLS LAST, s.post_date DESC NULLS LAST, s.brand_slug;
  END IF;
END;
$function$;

CREATE FUNCTION public.get_managed_posts(
  p_brand_slugs text[], p_start_date date, p_end_date date,
  p_managed_only boolean DEFAULT true, p_limit int DEFAULT 20000,
  p_date_basis text DEFAULT 'posted'
)
RETURNS TABLE(
  video_id text, video_title text, video_url text, creator_handle text,
  brand_slug text, brand_name text, post_date date,
  views bigint, likes bigint, comments bigint, shares bigint,
  gmv numeric, orders bigint, items_sold bigint, is_managed boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
SET statement_timeout = '60s'
AS $$
  SELECT *
  FROM get_managed_posts_base(p_brand_slugs, p_start_date, p_end_date, p_managed_only, p_date_basis)
  ORDER BY gmv DESC, views DESC NULLS LAST
  LIMIT GREATEST(p_limit, 0);
$$;

CREATE FUNCTION public.get_managed_posts_totals(
  p_brand_slugs text[], p_start_date date, p_end_date date,
  p_managed_only boolean DEFAULT true,
  p_date_basis text DEFAULT 'posted'
)
RETURNS TABLE(
  post_count bigint,
  total_views bigint, total_likes bigint, total_comments bigint, total_shares bigint,
  views_known bigint,
  total_gmv numeric, total_orders bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
SET statement_timeout = '60s'
AS $$
  SELECT
    count(*)::bigint                      AS post_count,
    SUM(views)::bigint                    AS total_views,
    SUM(likes)::bigint                    AS total_likes,
    SUM(comments)::bigint                 AS total_comments,
    SUM(shares)::bigint                   AS total_shares,
    count(views)::bigint                  AS views_known,
    COALESCE(SUM(gmv), 0)::numeric        AS total_gmv,
    COALESCE(SUM(orders), 0)::bigint      AS total_orders
  FROM get_managed_posts_base(p_brand_slugs, p_start_date, p_end_date, p_managed_only, p_date_basis);
$$;

GRANT EXECUTE ON FUNCTION public.get_managed_posts_base(text[], date, date, boolean, text)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_managed_posts(text[], date, date, boolean, int, text)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_managed_posts_totals(text[], date, date, boolean, text) TO authenticated, service_role;

-- ── Review aggregates, un-windowed. The earned basis surfaces pre-window
--    posts whose reviews a window-scoped aggregate would silently drop.
--    video_reviews is hand-written (small forever); the brand scope rides the
--    videos join.
CREATE OR REPLACE FUNCTION public.get_video_review_aggs(
  p_brand_slugs text[], p_user_id uuid DEFAULT NULL
)
RETURNS TABLE(
  video_id text, review_count bigint, avg_rating numeric,
  flagged boolean, has_my_review boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT
    vr.video_id,
    count(*)::bigint                                                   AS review_count,
    AVG(vr.rating)::numeric                                            AS avg_rating,
    bool_or(vr.tags && ARRAY['off-brand', 'needs-rework']::text[])     AS flagged,
    bool_or(p_user_id IS NOT NULL AND vr.reviewer_user_id = p_user_id) AS has_my_review
  FROM video_reviews vr
  WHERE EXISTS (
    SELECT 1 FROM videos v
    WHERE v.video_id = vr.video_id
      AND v.brand = ANY(p_brand_slugs)
  )
  GROUP BY vr.video_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_video_review_aggs(text[], uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_video_review_aggs(text[], uuid) IS
  'Review aggregates PER VIDEO (across brands, all time) for videos under in-scope brands. '
  'flagged matches the slug tags (off-brand, needs-rework); keep in sync with REVIEW_TAGS in src/lib/data/review-tags.ts.';

-- ── COMPAT SHIM (lesson learned: never DROP a function the deployed app still
--    calls - the ~4-minute gap between this migration and the app deploy had
--    prod /posts throwing on the missing RPC; zero 5xx observed, but only by
--    luck). Old signature delegates to the new aggregate; drop once the
--    date-basis app code is confirmed on prod.
CREATE OR REPLACE FUNCTION public.get_video_reviews_in_window(
  p_brand_slugs text[], p_start_date date, p_end_date date, p_user_id uuid DEFAULT NULL
)
RETURNS TABLE(
  video_id text, review_count bigint, avg_rating numeric,
  flagged boolean, has_my_review boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT * FROM get_video_review_aggs(p_brand_slugs, p_user_id);
$$;

GRANT EXECUTE ON FUNCTION public.get_video_reviews_in_window(text[], date, date, uuid) TO authenticated, service_role;
