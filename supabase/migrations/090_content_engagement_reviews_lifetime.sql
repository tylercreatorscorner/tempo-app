-- Content section data layer (the /posts + /posts/[videoId] rebuild).
--
-- 1) /posts engagement becomes REAL. get_managed_posts_base read views/likes/
--    comments off the `videos` lifetime snapshot — the same source mig 079's
--    header documents as garbage (median impressions = 1; a $24,666 video reads
--    views=0) — and COALESCEd missing data to fake 0s, all rendered beside
--    correctly-windowed GMV in the same row. Mig 088 ingests per-day
--    views/likes/comments/shares into video_performance; this migration windows
--    them into the posts RPCs. NULL = "no engagement data in this window",
--    rendered as absent — never a fake 0.
--
--    AGGREGATION RULE (mig 088): video_performance rows are per
--    video × product × day and engagement is VIDEO-level, repeated across the
--    product rows — summing rows double-counts. Correct: MAX per (video, day),
--    then SUM days. SUM skips NULL days; an all-NULL window → NULL.
--    Within one (video, brand), (product_id, report_date) is unique
--    (video_performance_unique), so both passes ride the same index probe.
--
-- 2) get_video_reviews_in_window replaces an un-paginated, all-time
--    video_reviews .select() in getPosts that would silently truncate at the
--    PostgREST 1000-row cap as reviews accumulate (review counts, flags, and
--    the Flagged queue would silently corrupt). Scoped to videos POSTED in the
--    window — exactly the set /posts renders. Flag matching uses the new slug
--    tags ('off-brand', 'needs-rework'); the table is empty as of this
--    migration (feature unused yet), so no data migration is needed.
--
-- 3) get_video_lifetime_stats gives /posts/[videoId] its header numbers in
--    SQL. The page previously did an un-paginated .select() on
--    video_performance (rows are per product × day, so an evergreen
--    multi-product video silently truncates at 1000 rows → understated
--    lifetime GMV) and discarded the query error (a timeout rendered fake $0).
--    Same max-gmv-per-(product, day) dedup as mig 079, plus the per-day series
--    for the review page's trend chart.

-- ── 1. Posts family: return types change (new `shares` etc.) → drop + recreate.
DROP FUNCTION IF EXISTS public.get_managed_posts(text[], date, date, boolean, int);
DROP FUNCTION IF EXISTS public.get_managed_posts_totals(text[], date, date, boolean);
DROP FUNCTION IF EXISTS public.get_managed_posts_base(text[], date, date, boolean);

CREATE FUNCTION public.get_managed_posts_base(
  p_brand_slugs text[], p_start_date date, p_end_date date, p_managed_only boolean
)
RETURNS TABLE(
  video_id text, video_title text, video_url text, creator_handle text,
  brand_slug text, brand_name text, post_date date,
  views bigint, likes bigint, comments bigint, shares bigint,
  gmv numeric, orders bigint, items_sold bigint, is_managed boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public'
AS $function$
BEGIN
  IF p_managed_only THEN
    -- INNER JOIN drives off the ~2.4k managed pairs (mig 076 perf fix).
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
      -- One probe per video: money (windowed, deduped per product+day, max-gmv
      -- row wins) and engagement (MAX per day then SUM) from the same row set.
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
    ORDER BY s.video_id, s.gmv DESC, s.views DESC NULLS LAST, s.post_date DESC NULLS LAST;
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
    ORDER BY s.video_id, s.gmv DESC, s.views DESC NULLS LAST, s.post_date DESC NULLS LAST;
  END IF;
END;
$function$;

CREATE FUNCTION public.get_managed_posts(
  p_brand_slugs text[], p_start_date date, p_end_date date,
  p_managed_only boolean DEFAULT true, p_limit int DEFAULT 20000
)
RETURNS TABLE(
  video_id text, video_title text, video_url text, creator_handle text,
  brand_slug text, brand_name text, post_date date,
  views bigint, likes bigint, comments bigint, shares bigint,
  gmv numeric, orders bigint, items_sold bigint, is_managed boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT *
  FROM get_managed_posts_base(p_brand_slugs, p_start_date, p_end_date, p_managed_only)
  ORDER BY gmv DESC, views DESC NULLS LAST
  LIMIT GREATEST(p_limit, 0);
$$;

-- Totals: money stays 0-defaulted (a window that earned nothing genuinely
-- earned $0). Engagement totals are NULL when NO post has data, and
-- views_known reports coverage so the KPI can say "across N of M posts".
CREATE FUNCTION public.get_managed_posts_totals(
  p_brand_slugs text[], p_start_date date, p_end_date date,
  p_managed_only boolean DEFAULT true
)
RETURNS TABLE(
  post_count bigint,
  total_views bigint, total_likes bigint, total_comments bigint, total_shares bigint,
  views_known bigint,
  total_gmv numeric, total_orders bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
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
  FROM get_managed_posts_base(p_brand_slugs, p_start_date, p_end_date, p_managed_only);
$$;

GRANT EXECUTE ON FUNCTION public.get_managed_posts_base(text[], date, date, boolean)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_managed_posts(text[], date, date, boolean, int)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_managed_posts_totals(text[], date, date, boolean) TO authenticated, service_role;

-- ── 2. Review aggregates for the posts window.
CREATE OR REPLACE FUNCTION public.get_video_reviews_in_window(
  p_brand_slugs text[], p_start_date date, p_end_date date, p_user_id uuid DEFAULT NULL
)
RETURNS TABLE(
  video_id text, brand text, review_count bigint, avg_rating numeric,
  flagged boolean, has_my_review boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT
    vr.video_id,
    vr.brand,
    count(*)::bigint                                                   AS review_count,
    AVG(vr.rating)::numeric                                            AS avg_rating,
    bool_or(vr.tags && ARRAY['off-brand', 'needs-rework']::text[])     AS flagged,
    bool_or(p_user_id IS NOT NULL AND vr.reviewer_user_id = p_user_id) AS has_my_review
  FROM video_reviews vr
  JOIN videos v ON v.video_id = vr.video_id AND v.brand = vr.brand
  WHERE vr.brand = ANY(p_brand_slugs)
    AND v.post_date BETWEEN p_start_date AND p_end_date
  GROUP BY vr.video_id, vr.brand;
$$;

GRANT EXECUTE ON FUNCTION public.get_video_reviews_in_window(text[], date, date, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_video_reviews_in_window(text[], date, date, uuid) IS
  'Review aggregates for videos POSTED in [start, end] — the exact set /posts renders. '
  'flagged matches the slug tags (off-brand, needs-rework); keep in sync with REVIEW_TAGS in src/lib/data/review-tags.ts.';

-- ── 3. /posts/[videoId] header numbers + per-day series, in one call.
CREATE OR REPLACE FUNCTION public.get_video_lifetime_stats(p_video_id text, p_brand text)
RETURNS TABLE(
  gmv numeric, orders bigint, items_sold bigint,
  views bigint, likes bigint, comments bigint, shares bigint,
  first_earn_date date, last_earn_date date, days_active bigint,
  daily jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  WITH rw AS (
    SELECT vp.product_id, vp.report_date, vp.gmv, vp.orders, vp.items_sold,
           vp.views, vp.likes, vp.comments, vp.shares
    FROM video_performance vp
    WHERE vp.video_id = p_video_id
      AND vp.brand = p_brand
      AND vp.period_type = 'daily'
  ),
  day_money AS (
    SELECT x.report_date, SUM(x.gmv) AS gmv, SUM(x.orders) AS orders, SUM(x.items_sold) AS items_sold
    FROM (
      SELECT DISTINCT ON (r.product_id, r.report_date) r.report_date, r.gmv, r.orders, r.items_sold
      FROM rw r
      ORDER BY r.product_id, r.report_date, r.gmv DESC
    ) x
    GROUP BY x.report_date
  ),
  day_eng AS (
    SELECT r.report_date,
           MAX(r.views) AS views, MAX(r.likes) AS likes,
           MAX(r.comments) AS comments, MAX(r.shares) AS shares
    FROM rw r
    GROUP BY r.report_date
  ),
  days AS (
    SELECT m.report_date, m.gmv, m.orders, m.items_sold, e.views, e.likes, e.comments, e.shares
    FROM day_money m
    JOIN day_eng e USING (report_date)
  )
  SELECT
    COALESCE(SUM(d.gmv), 0)::numeric       AS gmv,
    COALESCE(SUM(d.orders), 0)::bigint     AS orders,
    COALESCE(SUM(d.items_sold), 0)::bigint AS items_sold,
    SUM(d.views)::bigint                   AS views,
    SUM(d.likes)::bigint                   AS likes,
    SUM(d.comments)::bigint                AS comments,
    SUM(d.shares)::bigint                  AS shares,
    MIN(d.report_date)                     AS first_earn_date,
    MAX(d.report_date)                     AS last_earn_date,
    COUNT(*)::bigint                       AS days_active,
    COALESCE(
      jsonb_agg(
        jsonb_build_object('d', d.report_date, 'gmv', d.gmv, 'views', d.views)
        ORDER BY d.report_date
      ),
      '[]'::jsonb
    ) AS daily
  FROM days d;
$$;

GRANT EXECUTE ON FUNCTION public.get_video_lifetime_stats(text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_video_lifetime_stats(text, text) IS
  'Lifetime (all report_dates) money for one video+brand with the mig-079 max-gmv-per-(product, day) dedup, '
  'plus daily-tracked engagement (MAX per day then SUM; NULL when never carried) and the per-day series. '
  'Zero rows returns money=0 / engagement NULL / daily=[] — an RPC error must surface as an error, never $0.';
