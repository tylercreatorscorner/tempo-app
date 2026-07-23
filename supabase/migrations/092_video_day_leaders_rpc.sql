-- Daily Drop video sections (Top 5 Videos + One to Watch), in SQL.
--
-- The Content-overhaul rewrite correctly moved these off
-- daily_video_product_stats.video_id (a reused PRODUCT id - mis-grouped GMV,
-- dead tiktok.com links) onto video_performance, but did it as a raw
-- PostgREST select: 3-day window x all brands ORDER BY gmv - and the
-- authenticator role's 8s statement_timeout killed it (57014) on the
-- all-brands Daily Drop. Same lesson as migrations 043/076: brand-wide fact
-- reads belong in a SECURITY DEFINER RPC with its own timeout, returning the
-- aggregate, not the rows.
--
-- One call returns both sections:
--   section='day': GMV earned ON p_day, summed per real video (Top 5).
--   section='new': GMV over [p_window_start, p_day] for videos POSTED in the
--                  window with >= p_min_gmv earned (One to Watch candidates).
-- Dedup = mig 079: DISTINCT ON (video_id, product_id, report_date) keeping
-- the max-gmv row, so byte-identical cross-brand copies collapse while
-- genuinely different products still sum. Watch URL = videos.video_link when
-- it is a real tiktok.com URL, else the synthesized permalink (mig 079:
-- video_performance.video_link is ~0% usable).
CREATE OR REPLACE FUNCTION public.get_video_day_leaders(
  p_brand_slugs   text[],              -- NULL = all brands
  p_day           date,                -- the "yesterday" being reported
  p_window_start  date,                -- OTW lookback start (inclusive)
  p_limit         int DEFAULT 10,
  p_min_gmv       numeric DEFAULT 25
)
RETURNS TABLE(
  section text, video_id text, creator_handle text,
  gmv numeric, post_date date, video_url text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
SET statement_timeout = '30s'
AS $$
  WITH dd AS (
    SELECT DISTINCT ON (vp.video_id, vp.product_id, vp.report_date)
           vp.video_id, vp.report_date, vp.post_date, vp.gmv,
           lower(btrim(regexp_replace(vp.creator_name, '^@', ''))) AS handle
    FROM video_performance vp
    WHERE vp.period_type = 'daily'
      AND vp.report_date BETWEEN p_window_start AND p_day
      AND vp.gmv > 0
      AND vp.video_id IS NOT NULL AND vp.video_id <> ''
      AND (p_brand_slugs IS NULL OR vp.brand = ANY(p_brand_slugs))
    ORDER BY vp.video_id, vp.product_id, vp.report_date, vp.gmv DESC
  ),
  day_top AS (
    SELECT 'day'::text AS section,
           d.video_id,
           (array_agg(d.handle ORDER BY d.gmv DESC))[1] AS creator_handle,
           SUM(d.gmv)::numeric AS gmv,
           MAX(d.post_date) AS post_date
    FROM dd d
    WHERE d.report_date = p_day
    GROUP BY d.video_id
    ORDER BY SUM(d.gmv) DESC
    LIMIT GREATEST(p_limit, 0)
  ),
  new_top AS (
    SELECT 'new'::text AS section,
           d.video_id,
           (array_agg(d.handle ORDER BY d.gmv DESC))[1] AS creator_handle,
           SUM(d.gmv)::numeric AS gmv,
           MAX(d.post_date) AS post_date
    FROM dd d
    WHERE d.post_date IS NOT NULL AND d.post_date >= p_window_start
    GROUP BY d.video_id
    HAVING SUM(d.gmv) >= p_min_gmv
    ORDER BY SUM(d.gmv) DESC
    LIMIT GREATEST(p_limit, 0)
  ),
  both_sections AS (
    SELECT * FROM day_top
    UNION ALL
    SELECT * FROM new_top
  )
  SELECT
    b.section, b.video_id, b.creator_handle, b.gmv, b.post_date,
    COALESCE(
      (SELECT v.video_link FROM videos v
       WHERE v.video_id = b.video_id
         AND v.video_link ILIKE '%tiktok.com%'
       ORDER BY v.post_date DESC NULLS LAST
       LIMIT 1),
      'https://www.tiktok.com/@' || b.creator_handle || '/video/' || b.video_id
    ) AS video_url
  FROM both_sections b;
$$;

GRANT EXECUTE ON FUNCTION public.get_video_day_leaders(text[], date, date, int, numeric) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_video_day_leaders(text[], date, date, int, numeric) IS
  'Daily Drop video sections: section=day (top videos by GMV earned on p_day) + section=new (posted-in-window videos over p_min_gmv). Mig-079 dedup; real TikTok video ids; usable watch URLs.';
