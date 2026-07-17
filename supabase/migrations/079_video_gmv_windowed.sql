-- Video GMV means "earned in the selected window" — like every other number.
--
-- Tyler: "top videos gmv is off. when you pull a top video from the last 30 days
-- the daily gmv over those last 30 days should be summed up just like how when
-- you pull up a creator their gmv should be summed over whatever time period you
-- selected." He's right, and the root cause is worse than a grain mismatch.
--
-- WHAT WAS WRONG. get_managed_posts_base read GMV off a STATIC column:
--     CASE WHEN COALESCE(v.affiliate_gmv,0) > 0 THEN v.affiliate_gmv
--          ELSE COALESCE(v.total_gmv,0) END
-- That column is not lifetime GMV. upload_videos_atomic upserts it
-- (ON CONFLICT (video_id,brand) DO UPDATE SET total_gmv = EXCLUDED.total_gmv), so
-- it holds whatever the most recent Video List CSV happened to carry — roughly ONE
-- arbitrary day, a different day per brand (leefar_us 07-16, catakor 07-15,
-- dr_dent/m3/neurogum 07-10, kitsch 07-06). Consequences, measured on the live
-- 2026-06-17..07-16 window:
--   * 97.2% of the card's own rows read $0.00 (5,965 of 6,138 managed videos).
--     The "top 10" was ranked from the 173 with a nonzero snapshot.
--   * /posts Total GMV showed $27,452.21 for a post set worth $492,540.46 — an
--     18x understatement on a live client screen.
--   * The error is non-uniform (1.0x-41.1x), so it REORDERS rather than rescales:
--     card #8 (@minablovestea $778.15) was the true #1 at $31,978.04; card #2
--     (@slavicnursingbabe $2,404.94) had zero daily rows and earned $0.
--
-- SOURCE: video_performance (period_type='daily'), SUM(gmv) over report_date.
-- It is the CSV-fed legacy table — the direct sibling of creator_performance,
-- which is what the creator numbers sum — so the two tie by construction.
-- NOT daily_video_product_stats: its sync trigger is AFTER INSERT OR UPDATE with
-- no DELETE branch, while upload_video_performance_atomic delete-then-reinserts.
-- A mis-tagged LeeFar upload on 2026-07-02 therefore left v2 holding 909 rows /
-- $109,660.07 where legacy holds the correct 447 / $68,950.36 (+59%), with 461
-- videos under two LeeFar shops at once. Legacy stayed clean.
--
-- ORDER OF OPERATIONS IS LOAD-BEARING: filter to MANAGED first, THEN dedup.
-- kitsch/m3 and catakor/forchics carry byte-identical duplicate rows. Dedup-first
-- picks one brand per cell arbitrarily; catakor has 40 managed creators and
-- forchics has 0, so whenever forchics won the tiebreak a genuinely managed row
-- VANISHED — $5,864.47 / 14 videos silently deleted. Managed-first, dedup-second
-- is exact ($1,877,794.39, dedup a verified no-op in managed scope today) and
-- stays correct the day forchics gets a roster.
--
-- The dedup key is (video_id, product_id, report_date), NOT (video_id, brand):
-- byte-identical cross-brand copies collapse, while the 35 videos that genuinely
-- sell DIFFERENT products under two shops ($2,634.94 of real revenue) still sum.
-- A blanket MAX() would destroy that money.

-- ── The join driver. get_top_videos_by_window_gmv joins per managed (brand,
-- handle) pair; without this, the planner drives on the handle-only index
-- idx_video_perf_creator_norm and filters ~203 rows/loop by brand+date — 419k
-- buffers, 936ms. This composite lets the Index Cond carry brand+date too: 163ms.
-- Partial on period_type='daily' because that is the only period the RPCs read.
CREATE INDEX IF NOT EXISTS idx_video_perf_norm_brand_date
  ON video_performance (lower(btrim(regexp_replace(creator_name, '^@', ''))), brand, report_date)
  WHERE period_type = 'daily';

-- ── Shared managed definition. Mirrors the CTE it replaces (account_1..10).
-- NOTE: this is the SQL-side managed rule. computeManagedGmv (managed-gmv.ts)
-- remains THE authority for managed GMV totals and reads tiktok_accounts with
-- account_1..5 as fallback. The two already differ (5 vs 10 columns) — a
-- pre-existing drift, not introduced here. Do not add a third definition.
CREATE OR REPLACE VIEW public.managed_brand_handles AS
  SELECT DISTINCT
    mc.brand AS brand_slug,
    lower(btrim(regexp_replace(h.handle, '^@', ''))) AS handle
  FROM managed_creators mc
  CROSS JOIN LATERAL (VALUES
    (mc.account_1),(mc.account_2),(mc.account_3),(mc.account_4),(mc.account_5),
    (mc.account_6),(mc.account_7),(mc.account_8),(mc.account_9),(mc.account_10)
  ) AS h(handle)
  WHERE h.handle IS NOT NULL AND btrim(h.handle) <> '';

COMMENT ON VIEW public.managed_brand_handles IS
  'SQL-side (brand, handle) managed membership from managed_creators.account_1..10. '
  'Shared by get_top_videos_by_window_gmv + get_managed_posts_base so they cannot drift.';

-- ── Dashboard "Top Videos · <period>": top managed videos by GMV EARNED in the window.
--
-- Video SET is earned-in-window (Tyler's call), not posted-in-window: it is what
-- the label says, it matches the creator card (get_managed_creator_brand_gmv has
-- no "started in window" restriction), and it is the only basis on which an
-- evergreen video earning $89,149.60 doesn't vanish for being posted 8 days early.
--
-- Returns NO views/likes. Engagement lives only on `videos` and is a lifetime
-- snapshot (median impressions = 1; one top-10 video reads views=0 beside
-- $24,666.32 of GMV). Rendering it beside windowed GMV invites a GMV-per-view
-- reading that means nothing. Tyler's call: drop it.
CREATE OR REPLACE FUNCTION public.get_top_videos_by_window_gmv(
  p_brand_slugs text[],
  p_start_date  date,
  p_end_date    date,
  p_limit       integer DEFAULT 10
)
RETURNS TABLE(
  video_id text, video_title text, video_url text, creator_handle text,
  brand_slug text, brand_name text, post_date date,
  gmv numeric, orders bigint, items_sold bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
  WITH mgd AS (                       -- managed FIRST (see header)
    SELECT vp.video_id, vp.product_id, vp.report_date,
           vp.gmv, vp.orders, vp.items_sold, vp.brand, vp.video_title,
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
  dd AS (                             -- THEN dedup byte-identical cross-brand cells
    SELECT DISTINCT ON (video_id, product_id, report_date) *
    FROM mgd
    ORDER BY video_id, product_id, report_date, gmv DESC
  ),
  agg AS (                            -- one row per REAL video; LIMIT before the joins
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
  )
  SELECT
    a.video_id,
    -- videos.video_name first; video_performance.video_title is 6.1% the literal '--'.
    COALESCE(NULLIF(btrim(v.video_name), ''), NULLIF(btrim(a.vp_title), '--'), '(untitled)'),
    -- NEVER fall back to video_performance.video_link: 0.00% usable on the rows
    -- that need it (93.9% expired tiktokcdn blobs, 6.1% the literal '--').
    -- The synthesized permalink matches 1,730,300/1,730,300 real videos rows.
    COALESCE(NULLIF(btrim(v.video_link), ''),
             'https://www.tiktok.com/@' || a.handle || '/video/' || a.video_id),
    a.handle, a.brand, b.name, v.post_date,
    a.gmv, a.orders, a.items_sold
  FROM agg a
  JOIN brands_v2 b ON b.slug = a.brand
  -- LEFT: `videos` (Video List report) finalizes ~2 days after Video Data, so a
  -- recent earner may have no videos row yet. An INNER JOIN would silently drop it.
  LEFT JOIN videos v ON v.video_id = a.video_id AND v.brand = a.brand
  ORDER BY a.gmv DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_top_videos_by_window_gmv(text[], date, date, integer)
  TO authenticated, service_role;

-- ── /posts keeps its post_date row filter; only the MONEY changes.
--
-- /posts is a PUBLISHING view. Switching its row filter to earned-in-window would
-- take it from 6,138 to 4,077 videos: 4,944 published posts (the whole brand-new
-- $0 review queue) would vanish and 2,878 pre-window videos would appear with
-- out-of-range "Posted" dates. So the SET stays posted-in-window; the GMV becomes
-- earned-in-window, which is what the period selector already claims to mean.
CREATE OR REPLACE FUNCTION public.get_managed_posts_base(
  p_brand_slugs text[], p_start_date date, p_end_date date, p_managed_only boolean
)
RETURNS TABLE(
  video_id text, video_title text, video_url text, creator_handle text,
  brand_slug text, brand_name text, post_date date, views bigint, likes bigint,
  comments bigint, gmv numeric, orders bigint, items_sold bigint, is_managed boolean
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
        COALESCE(v.impressions, 0)::bigint AS views,
        COALESCE(v.likes, 0)::bigint AS likes,
        COALESCE(v.comments, 0)::bigint AS comments,
        COALESCE(w.gmv, 0)::numeric        AS gmv,
        COALESCE(w.orders, 0)::bigint      AS orders,
        COALESCE(w.items_sold, 0)::bigint  AS items_sold,
        true AS is_managed
      FROM videos v
      JOIN managed_brand_handles mp
        ON mp.brand_slug = v.brand
       AND mp.handle = lower(btrim(regexp_replace(v.creator_name, '^@', '')))
      JOIN brands_v2 b ON b.slug = v.brand
      -- GMV earned in the window, deduped per (product, day) within this video+brand.
      LEFT JOIN LATERAL (
        SELECT SUM(x.gmv) AS gmv, SUM(x.orders) AS orders, SUM(x.items_sold) AS items_sold
        FROM (
          SELECT DISTINCT ON (vp.product_id, vp.report_date)
                 vp.gmv, vp.orders, vp.items_sold
          FROM video_performance vp
          WHERE vp.video_id = v.video_id
            AND vp.brand = v.brand
            AND vp.period_type = 'daily'
            AND vp.report_date BETWEEN p_start_date AND p_end_date
          ORDER BY vp.product_id, vp.report_date, vp.gmv DESC
        ) x
      ) w ON true
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
        COALESCE(v.impressions, 0)::bigint AS views,
        COALESCE(v.likes, 0)::bigint AS likes,
        COALESCE(v.comments, 0)::bigint AS comments,
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
        SELECT SUM(x.gmv) AS gmv, SUM(x.orders) AS orders, SUM(x.items_sold) AS items_sold
        FROM (
          SELECT DISTINCT ON (vp.product_id, vp.report_date)
                 vp.gmv, vp.orders, vp.items_sold
          FROM video_performance vp
          WHERE vp.video_id = v.video_id
            AND vp.brand = v.brand
            AND vp.period_type = 'daily'
            AND vp.report_date BETWEEN p_start_date AND p_end_date
          ORDER BY vp.product_id, vp.report_date, vp.gmv DESC
        ) x
      ) w ON true
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
