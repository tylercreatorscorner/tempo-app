-- Top Videos rendered "No managed videos in this period" on any window wider
-- than ~a week. There were videos. get_managed_posts was just timing out, and
-- the dashboard reads only `.data` (never `.error`), so a dead query arrived as
-- an empty array and the card stated, confidently, that you had no videos.
-- Same shape as the Total GMV $0 bug: an error wearing an empty state.
--
-- WHY IT DIED. The window scales brutally:
--     7d  ->  13,613 videos
--    30d  -> 199,564 videos   (videos is 1.73M rows / 1.08 GB)
-- ...of which only 6,390 (3.2%) are managed. The function sorted all 199k for
-- its DISTINCT ON (video_id), then sorted again by gmv to return TEN. The
-- LIMIT can't help — the dedup must see every row first.
--
--   30d, before:  12,460 ms   (79k buffers)
--   30d, after:      381 ms   (12.5k buffers)   = 33x
--
-- TWO changes were needed; neither alone is enough:
--
-- 1. THE INDEX. idx_videos_creator_norm covers ONLY the normalized handle, so
--    each lookup pulled a creator's entire history and filtered in memory —
--    "Rows Removed by Filter: 121" per loop, 2,443 loops. The new index carries
--    (handle, brand, post_date) so the range lands in the Index Cond and returns
--    ~3 rows per loop. Built CONCURRENTLY — videos is 1GB on a live app.
--
-- 2. THE JOIN. With the index but the old LEFT JOIN + `(NOT p_managed_only OR
--    mp.handle IS NOT NULL)` predicate, it was still 6,371 ms: the planner can't
--    drive off the small managed side through an outer join, so it kept scanning
--    all 199k. Splitting the managed-only path into a real INNER JOIN lets it
--    start from the 2,443 managed pairs and index straight to their videos.
--
-- Behaviour is UNCHANGED: same columns, same DISTINCT ON (video_id) dedup, same
-- ordering, same is_managed semantics. p_managed_only=false keeps the original
-- LEFT JOIN so /posts' unmanaged view is untouched.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_videos_creator_norm_brand_date
  ON public.videos (
    lower(btrim(regexp_replace(creator_name, '^@'::text, ''::text))),
    brand,
    post_date
  );

CREATE OR REPLACE FUNCTION public.get_managed_posts_base(
  p_brand_slugs text[],
  p_start_date date,
  p_end_date date,
  p_managed_only boolean
)
RETURNS TABLE(
  video_id text, video_title text, video_url text, creator_handle text,
  brand_slug text, brand_name text, post_date date, views bigint, likes bigint,
  comments bigint, gmv numeric, orders bigint, items_sold bigint, is_managed boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF p_managed_only THEN
    -- INNER JOIN: lets the planner drive off managed_pairs (~2.4k) and index
    -- straight into each handle's videos for the window. This is the whole fix.
    RETURN QUERY
    WITH managed_pairs AS (
      SELECT DISTINCT
        mc.brand AS brand_slug,
        lower(btrim(regexp_replace(h.handle, '^@', ''))) AS handle
      FROM managed_creators mc
      CROSS JOIN LATERAL (VALUES
        (mc.account_1),(mc.account_2),(mc.account_3),(mc.account_4),(mc.account_5),
        (mc.account_6),(mc.account_7),(mc.account_8),(mc.account_9),(mc.account_10)
      ) AS h(handle)
      WHERE h.handle IS NOT NULL AND btrim(h.handle) <> ''
    ),
    scoped AS (
      SELECT
        v.video_id,
        COALESCE(v.video_name, '(untitled)') AS video_title,
        v.video_link AS video_url,
        lower(btrim(regexp_replace(v.creator_name, '^@', ''))) AS creator_handle,
        v.brand AS brand_slug,
        b.name AS brand_name,
        v.post_date,
        COALESCE(v.impressions, 0)::bigint AS views,
        COALESCE(v.likes, 0)::bigint AS likes,
        COALESCE(v.comments, 0)::bigint AS comments,
        CASE WHEN COALESCE(v.affiliate_gmv, 0) > 0
             THEN v.affiliate_gmv
             ELSE COALESCE(v.total_gmv, 0) END AS gmv,
        COALESCE(v.orders, 0)::bigint AS orders,
        COALESCE(v.items_sold, 0)::bigint AS items_sold,
        true AS is_managed
      FROM videos v
      JOIN managed_pairs mp
        ON mp.brand_slug = v.brand
       AND mp.handle = lower(btrim(regexp_replace(v.creator_name, '^@', '')))
      JOIN brands_v2 b ON b.slug = v.brand
      WHERE v.brand = ANY(p_brand_slugs)
        AND v.post_date >= p_start_date
        AND v.post_date <= p_end_date
        AND v.video_id IS NOT NULL AND v.video_id <> ''
        AND v.creator_name IS NOT NULL AND v.creator_name <> ''
    )
    SELECT DISTINCT ON (s.video_id)
      s.video_id, s.video_title, s.video_url, s.creator_handle, s.brand_slug,
      s.brand_name, s.post_date, s.views, s.likes, s.comments, s.gmv,
      s.orders, s.items_sold, s.is_managed
    FROM scoped s
    ORDER BY s.video_id, s.gmv DESC, s.views DESC, s.post_date DESC NULLS LAST;
  ELSE
    -- Unmanaged/all view (/posts): unchanged from the original. The LEFT JOIN is
    -- required here — the point is to return non-managed videos too.
    RETURN QUERY
    WITH managed_pairs AS (
      SELECT DISTINCT
        mc.brand AS brand_slug,
        lower(btrim(regexp_replace(h.handle, '^@', ''))) AS handle
      FROM managed_creators mc
      CROSS JOIN LATERAL (VALUES
        (mc.account_1),(mc.account_2),(mc.account_3),(mc.account_4),(mc.account_5),
        (mc.account_6),(mc.account_7),(mc.account_8),(mc.account_9),(mc.account_10)
      ) AS h(handle)
      WHERE h.handle IS NOT NULL AND btrim(h.handle) <> ''
    ),
    scoped AS (
      SELECT
        v.video_id,
        COALESCE(v.video_name, '(untitled)') AS video_title,
        v.video_link AS video_url,
        lower(btrim(regexp_replace(v.creator_name, '^@', ''))) AS creator_handle,
        v.brand AS brand_slug,
        b.name AS brand_name,
        v.post_date,
        COALESCE(v.impressions, 0)::bigint AS views,
        COALESCE(v.likes, 0)::bigint AS likes,
        COALESCE(v.comments, 0)::bigint AS comments,
        CASE WHEN COALESCE(v.affiliate_gmv, 0) > 0
             THEN v.affiliate_gmv
             ELSE COALESCE(v.total_gmv, 0) END AS gmv,
        COALESCE(v.orders, 0)::bigint AS orders,
        COALESCE(v.items_sold, 0)::bigint AS items_sold,
        (mp.handle IS NOT NULL) AS is_managed
      FROM videos v
      JOIN brands_v2 b ON b.slug = v.brand
      LEFT JOIN managed_pairs mp
        ON mp.brand_slug = v.brand
       AND mp.handle = lower(btrim(regexp_replace(v.creator_name, '^@', '')))
      WHERE v.brand = ANY(p_brand_slugs)
        AND v.post_date >= p_start_date
        AND v.post_date <= p_end_date
        AND v.video_id IS NOT NULL AND v.video_id <> ''
        AND v.creator_name IS NOT NULL AND v.creator_name <> ''
    )
    SELECT DISTINCT ON (s.video_id)
      s.video_id, s.video_title, s.video_url, s.creator_handle, s.brand_slug,
      s.brand_name, s.post_date, s.views, s.likes, s.comments, s.gmv,
      s.orders, s.items_sold, s.is_managed
    FROM scoped s
    ORDER BY s.video_id, s.gmv DESC, s.views DESC, s.post_date DESC NULLS LAST;
  END IF;
END;
$function$;
