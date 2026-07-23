-- Reviews attach to the VIDEO, not to whichever brand won the window.
--
-- Adversarial review of mig 090 confirmed (against prod data): 131,132
-- video_ids exist under more than one brand in `videos`, 3,833 of them
-- survive the managed filter under 2+ brands, and the /posts dedup picks the
-- surviving brand by WINDOWED gmv - so the brand a row carries flips between
-- date windows (37 demonstrable June->July winner flips). Reviews were
-- aggregated per (video_id, brand) and looked up by the row's current brand,
-- so a review written in July under store A silently detached in August when
-- store B out-earned it: count 0, flag gone from the Flagged queue, post back
-- in Unreviewed. Since /posts renders exactly one row per video_id, reviews
-- aggregate per video_id across brands.
--
-- Also: the final DISTINCT ON (video_id) ordering had no deterministic
-- tiebreaker - two brand rows of the same video with $0 windowed GMV and
-- equal engagement could flip winners between refreshes of the SAME window.
-- brand_slug added as the final key.

-- ── 1. Review aggregates per video. Return type changes (brand dropped) →
--       drop + recreate. Window scope: the video was POSTED in-window under
--       any in-scope brand; the review row's own brand no longer matters
--       (reviews are team-internal, single tenant).
DROP FUNCTION IF EXISTS public.get_video_reviews_in_window(text[], date, date, uuid);

CREATE FUNCTION public.get_video_reviews_in_window(
  p_brand_slugs text[], p_start_date date, p_end_date date, p_user_id uuid DEFAULT NULL
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
      AND v.post_date BETWEEN p_start_date AND p_end_date
  )
  GROUP BY vr.video_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_video_reviews_in_window(text[], date, date, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_video_reviews_in_window(text[], date, date, uuid) IS
  'Review aggregates PER VIDEO (across brands - a video_id is one video) for videos posted in [start, end] under any in-scope brand. '
  'flagged matches the slug tags (off-brand, needs-rework); keep in sync with REVIEW_TAGS in src/lib/data/review-tags.ts.';

-- ── 2. Deterministic dedup winner. Same return type → CREATE OR REPLACE.
--       Identical to mig 090's body except the two final ORDER BYs gain
--       s.brand_slug as the last key.
CREATE OR REPLACE FUNCTION public.get_managed_posts_base(
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
