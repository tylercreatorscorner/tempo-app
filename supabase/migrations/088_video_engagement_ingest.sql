-- Ingest per-day video engagement (views/likes/comments/shares) from the Video
-- Data upload. TikTok's daily export has carried these columns all along; the
-- app was discarding them, which is why Top Videos could never show views
-- ("engagement lives only on `videos` as a lifetime snapshot"). Now:
--
--   1) video_performance gains nullable engagement columns. NULL means "that
--      day's upload didn't carry engagement" (all history until re-upload) —
--      deliberately distinct from a true 0. Readers render views only when
--      non-null; never a fake 0.
--   2) upload_video_performance_atomic writes them (absent JSON keys → NULL).
--   3) get_top_videos_by_window_gmv (admin) + get_inspiration_videos (portal)
--      return windowed views. AGGREGATION CAUTION: video_performance rows are
--      per video × product × day, and views are a VIDEO-level metric repeated
--      across product rows — summing rows double-counts. Correct: MAX per
--      (video, day), then SUM days. SUM skips NULL days; all-NULL → NULL.

alter table video_performance
  add column if not exists views bigint,
  add column if not exists likes bigint,
  add column if not exists comments bigint,
  add column if not exists shares bigint;

-- 2) Upload RPC — same shape, plus the four engagement fields.
CREATE OR REPLACE FUNCTION public.upload_video_performance_atomic(p_brand text, p_report_date date, p_records jsonb, p_overwrite boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  deleted_count int := 0;
  inserted_count int := 0;
  lock_key bigint;
BEGIN
  SET LOCAL statement_timeout = '60s';
  lock_key := ('x' || substr(md5('upload:video_performance:'||p_brand||':'||p_report_date::text), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(lock_key);

  IF p_overwrite THEN
    DELETE FROM video_performance
    WHERE brand = p_brand AND report_date = p_report_date AND period_type = 'daily';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
  END IF;

  INSERT INTO video_performance (
    report_date, period_type, brand, video_id, video_title, post_date,
    video_link, creator_name, product_name, product_id,
    gmv, orders, aov, avg_gmv_per_customer, items_sold,
    refunds, items_refunded, est_commission, est_flat_fee,
    views, likes, comments, shares
  )
  SELECT
    (r->>'report_date')::date, 'daily', r->>'brand', r->>'video_id',
    r->>'video_title', NULLIF(r->>'post_date','')::date,
    r->>'video_link', r->>'creator_name', r->>'product_name', r->>'product_id',
    COALESCE((r->>'gmv')::numeric, 0),
    COALESCE((r->>'orders')::int, 0),
    COALESCE((r->>'aov')::numeric, 0),
    COALESCE((r->>'avg_gmv_per_customer')::numeric, 0),
    COALESCE((r->>'items_sold')::int, 0),
    COALESCE((r->>'refunds')::numeric, 0),
    COALESCE((r->>'items_refunded')::int, 0),
    COALESCE((r->>'est_commission')::numeric, 0),
    COALESCE((r->>'est_flat_fee')::numeric, 0),
    -- Engagement: NO coalesce-to-0. Absent column = NULL = "not in this file".
    (r->>'views')::bigint,
    (r->>'likes')::bigint,
    (r->>'comments')::bigint,
    (r->>'shares')::bigint
  FROM jsonb_array_elements(p_records) AS r
  ON CONFLICT (video_id, product_id, brand, report_date) DO UPDATE SET
    video_title = EXCLUDED.video_title, post_date = EXCLUDED.post_date,
    video_link = EXCLUDED.video_link, creator_name = EXCLUDED.creator_name,
    product_name = EXCLUDED.product_name,
    gmv = EXCLUDED.gmv, orders = EXCLUDED.orders, aov = EXCLUDED.aov,
    avg_gmv_per_customer = EXCLUDED.avg_gmv_per_customer,
    items_sold = EXCLUDED.items_sold, refunds = EXCLUDED.refunds,
    items_refunded = EXCLUDED.items_refunded,
    est_commission = EXCLUDED.est_commission, est_flat_fee = EXCLUDED.est_flat_fee,
    views = EXCLUDED.views, likes = EXCLUDED.likes,
    comments = EXCLUDED.comments, shares = EXCLUDED.shares;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  RETURN jsonb_build_object('deleted', deleted_count, 'upserted', inserted_count);
END;
$function$;

-- 3) Admin Top Videos — return type gains `views`, so drop + recreate.
DROP FUNCTION IF EXISTS public.get_top_videos_by_window_gmv(text[], date, date, integer);

CREATE FUNCTION public.get_top_videos_by_window_gmv(p_brand_slugs text[], p_start_date date, p_end_date date, p_limit integer DEFAULT 10)
 RETURNS TABLE(video_id text, video_title text, video_url text, creator_handle text, brand_slug text, brand_name text, post_date date, gmv numeric, orders bigint, items_sold bigint, views bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH mgd AS (
    SELECT vp.video_id, vp.product_id, vp.report_date,
           vp.gmv, vp.orders, vp.items_sold, vp.views, vp.brand, vp.video_title,
           lower(btrim(regexp_replace(vp.creator_name, '^@', ''))) AS handle
    FROM video_performance vp
    JOIN managed_brand_handles mp
      ON mp.brand_slug = vp.brand
     AND mp.handle = lower(btrim(regexp_replace(vp.creator_name, '^@', '')))
    WHERE vp.period_type = 'daily'
      AND vp.report_date BETWEEN p_start_date AND p_end_date
      AND vp.brand = ANY(p_brand_slugs)
      AND vp.video_id IS NOT NULL AND vp.video_id <> ''
  ),
  dd AS (
    SELECT DISTINCT ON (video_id, product_id, report_date) *
    FROM mgd
    ORDER BY video_id, product_id, report_date, gmv DESC
  ),
  agg AS (
    SELECT d.video_id,
           SUM(d.gmv)::numeric        AS gmv,
           SUM(d.orders)::bigint      AS orders,
           SUM(d.items_sold)::bigint  AS items_sold,
           (array_agg(d.handle      ORDER BY d.gmv DESC))[1] AS handle,
           (array_agg(d.brand       ORDER BY d.gmv DESC))[1] AS brand,
           (array_agg(d.video_title ORDER BY d.gmv DESC))[1] AS vp_title
    FROM dd d
    GROUP BY d.video_id
    ORDER BY SUM(d.gmv) DESC
    LIMIT GREATEST(p_limit, 0)
  ),
  -- Views are video-level, repeated per product row: MAX per (video, day),
  -- then SUM across days. All-NULL window → NULL (rendered as absent).
  vagg AS (
    SELECT t.video_id, SUM(t.day_views)::bigint AS views
    FROM (
      SELECT d.video_id, d.report_date, MAX(d.views) AS day_views
      FROM dd d
      WHERE d.video_id IN (SELECT a.video_id FROM agg a)
      GROUP BY d.video_id, d.report_date
    ) t
    GROUP BY t.video_id
  )
  SELECT
    a.video_id,
    COALESCE(NULLIF(btrim(v.video_name), ''), NULLIF(btrim(a.vp_title), '--'), '(untitled)'),
    COALESCE(NULLIF(btrim(v.video_link), ''),
             'https://www.tiktok.com/@' || a.handle || '/video/' || a.video_id),
    a.handle, a.brand, b.name, v.post_date,
    a.gmv, a.orders, a.items_sold, va.views
  FROM agg a
  JOIN brands_v2 b ON b.slug = a.brand
  LEFT JOIN videos v ON v.video_id = a.video_id AND v.brand = a.brand
  LEFT JOIN vagg va ON va.video_id = a.video_id
  ORDER BY a.gmv DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_top_videos_by_window_gmv(text[], date, date, integer) TO authenticated, service_role;

-- 4) Portal inspiration — return type gains `views`, so drop + recreate.
--    Views come from video_performance (keyed by slug via brands_v2, since the
--    dvps filter uses brand UUIDs).
DROP FUNCTION IF EXISTS public.get_inspiration_videos(uuid[], date, date, int, date);

CREATE FUNCTION public.get_inspiration_videos(
  p_brand_ids uuid[],
  p_start date,
  p_end date,
  p_limit int default 24,
  p_posted_since date default null
)
returns table(
  video_id text,
  video_title text,
  video_url text,
  post_date text,
  tiktok_username text,
  brand_id text,
  gmv numeric,
  orders numeric,
  items_sold numeric,
  commission numeric,
  days_active bigint,
  top_product text,
  views bigint
)
language sql
stable
as $function$
  with agg as (
    select
      d.video_id,
      max(d.video_title) as video_title,
      max(d.post_date::text) as post_date,
      max(d.tiktok_username) as tiktok_username,
      max(d.brand_id::text) as brand_id,
      sum(d.gmv) as gmv,
      sum(d.orders) as orders,
      sum(d.items_sold) as items_sold,
      sum(d.est_commission) as commission,
      count(distinct d.report_date) as days_active
    from daily_video_product_stats d
    where d.report_date between p_start and p_end
      and (p_brand_ids is null or d.brand_id = any(p_brand_ids))
      and d.video_id is not null
      and (p_posted_since is null or d.post_date >= p_posted_since)
    group by d.video_id
    order by sum(d.gmv) desc
    limit p_limit
  ),
  watch as (
    select v.video_id, max(v.video_link) as video_link
    from videos v
    where v.video_id in (select a.video_id from agg a)
      and v.video_link ilike '%tiktok.com%'
    group by v.video_id
  ),
  prod as (
    select video_id, product_name, row_number() over (
      partition by video_id order by sum(gmv) desc
    ) as rn
    from daily_video_product_stats d
    where d.report_date between p_start and p_end
      and (p_brand_ids is null or d.brand_id = any(p_brand_ids))
      and d.video_id in (select a.video_id from agg a)
      and d.product_name is not null
    group by video_id, product_name
  ),
  vagg as (
    select t.video_id, sum(t.day_views)::bigint as views
    from (
      select vp.video_id, vp.report_date, max(vp.views) as day_views
      from video_performance vp
      where vp.period_type = 'daily'
        and vp.report_date between p_start and p_end
        and vp.video_id in (select a.video_id from agg a)
        and (p_brand_ids is null
             or vp.brand in (select b.slug from brands_v2 b where b.id = any(p_brand_ids)))
      group by vp.video_id, vp.report_date
    ) t
    group by t.video_id
  )
  select
    a.video_id, a.video_title, w.video_link, a.post_date, a.tiktok_username,
    a.brand_id, a.gmv, a.orders, a.items_sold, a.commission, a.days_active,
    p.product_name, va.views
  from agg a
  left join watch w on w.video_id = a.video_id
  left join prod p on p.video_id = a.video_id and p.rn = 1
  left join vagg va on va.video_id = a.video_id
  order by a.gmv desc;
$function$;

grant execute on function public.get_inspiration_videos(uuid[], date, date, int, date) to authenticated, service_role;
