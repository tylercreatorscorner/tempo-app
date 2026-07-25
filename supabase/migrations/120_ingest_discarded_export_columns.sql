-- Ingest the 27 export columns Tempo was discarding.
--
-- Ground truth for every header string and cell shape below: the real Bondie
-- exports dated 2026-07-22 (Creator Data 1,896 data rows / Video Data 1,041 /
-- Transaction Analysis 1), parsed 2026-07-25. Not inferred from docs.
--
-- WHAT LANDS HERE
--   creator_performance  +11  incl. the GMV ATTRIBUTION SPLIT. `gmv`
--                             ("Creator-attributed GMV") is the TOTAL; the
--                             three new columns are its components. Verified
--                             on the Bondie file: $6,438.91 total = $0.00
--                             live + $6,410.61 video + $28.30 product card,
--                             exact to the cent, 0 of 1,896 rows off. Tempo
--                             had NO live-vs-video attribution before this.
--   video_performance    +6   per-video funnel + quality metrics.
--   product_performance  +10  period totals that replaced the export's five
--                             `Avg. daily …` columns (see DEAD COLUMNS below).
--
-- NULL vs 0 (house rule, post fake-$0 incident)
--   Every column added here is nullable with NO DEFAULT, and every RPC below
--   inserts it WITHOUT a COALESCE. NULL means "this export didn't carry the
--   column" — all history until a re-upload, plus any shop still on an older
--   schema. A real 0 (a creator with zero LIVE GMV) must stay distinguishable
--   from that, so readers render NULL as "—", never as $0 / 0%.
--   The pre-existing columns keep their COALESCE(...,0) verbatim: changing
--   them would rewrite the meaning of years of stored rows.
--
-- RATES are stored as PERCENTAGE POINTS, not fractions: the export writes
--   "5.93%" as a TEXT cell, and the parser stores 5.93. Values above 100 are
--   legitimate (CTR maxes at 200 in the Bondie creator file) — do not add a
--   0-100 check constraint. See parsePercentOrNull() in column-maps.ts.
--
-- DEAD COLUMNS — NOT DROPPED. TikTok no longer sends the six headers behind
--   creator_performance.avg_daily_products_with_sales and
--   product_performance.avg_daily_{customers,creators_with_sales,
--   creators_posted,videos_with_sales,lives_with_sales}. Their column-map
--   entries are removed in this same change (every file was reporting as
--   partially unmatched), but the DB columns HOLD HISTORY and stay — e.g.
--   src/lib/data/products.ts still reads avg_daily_creators_with_sales. The
--   RPCs below still write them exactly as before (absent JSON key →
--   COALESCE → 0, which is what they already stored).
--
-- SECURITY — all three RPCs were found granting EXECUTE to PUBLIC, anon AND
--   authenticated (checked 2026-07-25: proacl {=X/postgres, postgres, anon,
--   authenticated, service_role}). They are SECURITY DEFINER and DELETE a
--   whole brand-day, so any anon PostgREST caller could have wiped one.
--   CREATE OR REPLACE preserves the existing ACL, so the explicit REVOKE at
--   the bottom is load-bearing, not ceremony — and a GRANT list that merely
--   omits anon revokes NOTHING under Supabase's default privileges.

-- ── 1) Columns ──────────────────────────────────────────────────────────────

alter table creator_performance
  -- GMV attribution split — components of the existing `gmv` total.
  add column if not exists video_gmv                  numeric,
  add column if not exists live_gmv                   numeric,
  add column if not exists product_card_gmv           numeric,
  -- Rates, percentage points.
  add column if not exists ctor                       numeric,
  add column if not exists ctr                        numeric,
  -- Counts.
  add column if not exists total_sample_content       integer,
  add column if not exists products_added_to_showcase integer,
  add column if not exists product_impressions        bigint,
  add column if not exists video_views                bigint,
  add column if not exists customers                  integer,
  add column if not exists products_sold              integer;

comment on column creator_performance.video_gmv is
  'TikTok "Creator video-attributed GMV". Component of gmv (the total). NULL = not in that day''s export.';
comment on column creator_performance.live_gmv is
  'TikTok "Creator LIVE-attributed GMV". Component of gmv (the total). NULL = not in that day''s export.';
comment on column creator_performance.product_card_gmv is
  'TikTok "Affiliate product card-attributed GMV" (showcase). Component of gmv (the total). NULL = not in that day''s export.';
comment on column creator_performance.ctor is
  'Click-to-order rate in PERCENTAGE POINTS (5.93 = 5.93%). May exceed 100.';
comment on column creator_performance.ctr is
  'Click-through rate in PERCENTAGE POINTS (0.56 = 0.56%). May exceed 100.';
comment on column creator_performance.video_views is
  'Views across the creator''s shoppable videos for the day. NULL = not in that day''s export; 0 is a real zero.';

alter table video_performance
  add column if not exists product_impressions bigint,
  add column if not exists product_clicks      bigint,
  -- Rates, percentage points.
  add column if not exists completion_rate     numeric,
  add column if not exists ctr                 numeric,
  add column if not exists engagement_rate     numeric,
  -- Money.
  add column if not exists gpm                 numeric;

comment on column video_performance.product_impressions is
  'TikTok "Video product impressions". VIDEO-level metric repeated across the video''s per-product rows — aggregate as MAX per (video, day) then SUM days, never SUM rows (same trap as views, mig 088).';
comment on column video_performance.product_clicks is
  'TikTok "Video product clicks". Video-level; see product_impressions for the aggregation rule.';
comment on column video_performance.completion_rate is
  'Share of viewers who watched the full video, in PERCENTAGE POINTS (3.65 = 3.65%).';
comment on column video_performance.ctr is
  'Click-through rate in PERCENTAGE POINTS (0.55 = 0.55%).';
comment on column video_performance.engagement_rate is
  'TikTok "Engagement": (likes + shares + comments) / views, in PERCENTAGE POINTS (0.29 = 0.29%). A rate despite the bare column name.';
comment on column video_performance.gpm is
  'TikTok "Video GPM": GMV per 1,000 video impressions, in dollars.';

alter table product_performance
  -- Period totals — these replaced the export's five `Avg. daily …` columns.
  add column if not exists videos_with_sales       integer,
  add column if not exists live_streams_with_sales integer,
  add column if not exists creators_posted_content integer,
  add column if not exists creators_with_sales     integer,
  add column if not exists customers               integer,
  add column if not exists total_sample_content    integer,
  add column if not exists product_impressions     bigint,
  add column if not exists product_clicks          bigint,
  -- Rates, percentage points.
  add column if not exists ctor                    numeric,
  add column if not exists ctr                     numeric;

comment on column product_performance.creators_with_sales is
  'Period total. Supersedes avg_daily_creators_with_sales, which TikTok stopped sending; that column is kept for history only.';
comment on column product_performance.videos_with_sales is
  'Period total. Supersedes avg_daily_videos_with_sales (kept for history only).';
comment on column product_performance.ctor is
  'Click-to-order rate in PERCENTAGE POINTS (1.71 = 1.71%).';
comment on column product_performance.ctr is
  'Click-through rate in PERCENTAGE POINTS (1.9 = 1.9%).';

-- ── 2) Upload RPCs ──────────────────────────────────────────────────────────
-- Each is the CURRENT production definition with new columns added and
-- NOTHING else changed: same signature and defaults, SECURITY DEFINER, the
-- 'public','pg_temp' search_path, SET LOCAL statement_timeout = '60s', the
-- md5-derived advisory lock, the overwrite DELETE (brand + report_date +
-- period_type = 'daily'), the ON CONFLICT target and its full update list,
-- and the {deleted, upserted} return shape.

CREATE OR REPLACE FUNCTION public.upload_creator_performance_atomic(p_brand text, p_report_date date, p_records jsonb, p_overwrite boolean DEFAULT true)
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
  -- Serialize same-(brand,date) uploads via advisory lock
  lock_key := ('x' || substr(md5('upload:creator_performance:'||p_brand||':'||p_report_date::text), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(lock_key);

  IF p_overwrite THEN
    DELETE FROM creator_performance
    WHERE brand = p_brand AND report_date = p_report_date AND period_type = 'daily';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
  END IF;

  INSERT INTO creator_performance (
    report_date, period_type, brand, creator_name,
    gmv, refunds, orders, items_sold, items_refunded, aov,
    avg_daily_products_with_sales, videos, live_streams,
    est_commission, samples_shipped, est_flat_fee,
    video_gmv, live_gmv, product_card_gmv, ctor, ctr,
    total_sample_content, products_added_to_showcase, product_impressions,
    video_views, customers, products_sold
  )
  SELECT
    (r->>'report_date')::date, 'daily', r->>'brand', r->>'creator_name',
    COALESCE((r->>'gmv')::numeric, 0),
    COALESCE((r->>'refunds')::numeric, 0),
    COALESCE((r->>'orders')::int, 0),
    COALESCE((r->>'items_sold')::int, 0),
    COALESCE((r->>'items_refunded')::int, 0),
    COALESCE((r->>'aov')::numeric, 0),
    COALESCE((r->>'avg_daily_products_with_sales')::numeric, 0),
    COALESCE((r->>'videos')::int, 0),
    COALESCE((r->>'live_streams')::int, 0),
    COALESCE((r->>'est_commission')::numeric, 0),
    COALESCE((r->>'samples_shipped')::int, 0),
    COALESCE((r->>'est_flat_fee')::numeric, 0),
    -- mig 120: NO coalesce-to-0. Absent key / JSON null = NULL = "not in
    -- this file", which must never read as a real 0.
    (r->>'video_gmv')::numeric,
    (r->>'live_gmv')::numeric,
    (r->>'product_card_gmv')::numeric,
    (r->>'ctor')::numeric,
    (r->>'ctr')::numeric,
    (r->>'total_sample_content')::int,
    (r->>'products_added_to_showcase')::int,
    (r->>'product_impressions')::bigint,
    (r->>'video_views')::bigint,
    (r->>'customers')::int,
    (r->>'products_sold')::int
  FROM jsonb_array_elements(p_records) AS r
  ON CONFLICT (creator_name, brand, report_date) DO UPDATE SET
    gmv = EXCLUDED.gmv, refunds = EXCLUDED.refunds, orders = EXCLUDED.orders,
    items_sold = EXCLUDED.items_sold, items_refunded = EXCLUDED.items_refunded,
    aov = EXCLUDED.aov,
    avg_daily_products_with_sales = EXCLUDED.avg_daily_products_with_sales,
    videos = EXCLUDED.videos, live_streams = EXCLUDED.live_streams,
    est_commission = EXCLUDED.est_commission,
    samples_shipped = EXCLUDED.samples_shipped,
    est_flat_fee = EXCLUDED.est_flat_fee,
    video_gmv = EXCLUDED.video_gmv,
    live_gmv = EXCLUDED.live_gmv,
    product_card_gmv = EXCLUDED.product_card_gmv,
    ctor = EXCLUDED.ctor,
    ctr = EXCLUDED.ctr,
    total_sample_content = EXCLUDED.total_sample_content,
    products_added_to_showcase = EXCLUDED.products_added_to_showcase,
    product_impressions = EXCLUDED.product_impressions,
    video_views = EXCLUDED.video_views,
    customers = EXCLUDED.customers,
    products_sold = EXCLUDED.products_sold;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  RETURN jsonb_build_object('deleted', deleted_count, 'upserted', inserted_count);
END;
$function$;

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
    views, likes, comments, shares,
    product_impressions, product_clicks, completion_rate, ctr,
    engagement_rate, gpm
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
    (r->>'shares')::bigint,
    -- mig 120 — same contract.
    (r->>'product_impressions')::bigint,
    (r->>'product_clicks')::bigint,
    (r->>'completion_rate')::numeric,
    (r->>'ctr')::numeric,
    (r->>'engagement_rate')::numeric,
    (r->>'gpm')::numeric
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
    comments = EXCLUDED.comments, shares = EXCLUDED.shares,
    product_impressions = EXCLUDED.product_impressions,
    product_clicks = EXCLUDED.product_clicks,
    completion_rate = EXCLUDED.completion_rate,
    ctr = EXCLUDED.ctr,
    engagement_rate = EXCLUDED.engagement_rate,
    gpm = EXCLUDED.gpm;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  RETURN jsonb_build_object('deleted', deleted_count, 'upserted', inserted_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.upload_product_performance_atomic(p_brand text, p_report_date date, p_records jsonb, p_overwrite boolean DEFAULT true)
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
  lock_key := ('x' || substr(md5('upload:product_performance:'||p_brand||':'||p_report_date::text), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(lock_key);

  IF p_overwrite THEN
    DELETE FROM product_performance
    WHERE brand = p_brand AND report_date = p_report_date AND period_type = 'daily';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
  END IF;

  INSERT INTO product_performance (
    report_date, period_type, brand, product_id, product_name, product_category,
    gmv, refunds, items_sold, items_refunded, orders,
    avg_daily_customers, avg_daily_creators_with_sales, avg_daily_creators_posted,
    avg_daily_videos_with_sales, avg_daily_lives_with_sales,
    videos, live_streams, est_commission, samples_shipped, est_flat_fee,
    videos_with_sales, live_streams_with_sales, creators_posted_content,
    creators_with_sales, customers, total_sample_content,
    product_impressions, product_clicks, ctor, ctr
  )
  SELECT
    (r->>'report_date')::date, 'daily', r->>'brand', r->>'product_id',
    r->>'product_name', r->>'product_category',
    COALESCE((r->>'gmv')::numeric, 0),
    COALESCE((r->>'refunds')::numeric, 0),
    COALESCE((r->>'items_sold')::int, 0),
    COALESCE((r->>'items_refunded')::int, 0),
    COALESCE((r->>'orders')::int, 0),
    COALESCE((r->>'avg_daily_customers')::numeric, 0),
    COALESCE((r->>'avg_daily_creators_with_sales')::numeric, 0),
    COALESCE((r->>'avg_daily_creators_posted')::numeric, 0),
    COALESCE((r->>'avg_daily_videos_with_sales')::numeric, 0),
    COALESCE((r->>'avg_daily_lives_with_sales')::numeric, 0),
    COALESCE((r->>'videos')::int, 0),
    COALESCE((r->>'live_streams')::int, 0),
    COALESCE((r->>'est_commission')::numeric, 0),
    COALESCE((r->>'samples_shipped')::int, 0),
    COALESCE((r->>'est_flat_fee')::numeric, 0),
    -- mig 120: NO coalesce-to-0. Absent key / JSON null = NULL.
    (r->>'videos_with_sales')::int,
    (r->>'live_streams_with_sales')::int,
    (r->>'creators_posted_content')::int,
    (r->>'creators_with_sales')::int,
    (r->>'customers')::int,
    (r->>'total_sample_content')::int,
    (r->>'product_impressions')::bigint,
    (r->>'product_clicks')::bigint,
    (r->>'ctor')::numeric,
    (r->>'ctr')::numeric
  FROM jsonb_array_elements(p_records) AS r
  ON CONFLICT (product_id, brand, report_date) DO UPDATE SET
    product_name = EXCLUDED.product_name, product_category = EXCLUDED.product_category,
    gmv = EXCLUDED.gmv, refunds = EXCLUDED.refunds,
    items_sold = EXCLUDED.items_sold, items_refunded = EXCLUDED.items_refunded,
    orders = EXCLUDED.orders,
    avg_daily_customers = EXCLUDED.avg_daily_customers,
    avg_daily_creators_with_sales = EXCLUDED.avg_daily_creators_with_sales,
    avg_daily_creators_posted = EXCLUDED.avg_daily_creators_posted,
    avg_daily_videos_with_sales = EXCLUDED.avg_daily_videos_with_sales,
    avg_daily_lives_with_sales = EXCLUDED.avg_daily_lives_with_sales,
    videos = EXCLUDED.videos, live_streams = EXCLUDED.live_streams,
    est_commission = EXCLUDED.est_commission,
    samples_shipped = EXCLUDED.samples_shipped, est_flat_fee = EXCLUDED.est_flat_fee,
    videos_with_sales = EXCLUDED.videos_with_sales,
    live_streams_with_sales = EXCLUDED.live_streams_with_sales,
    creators_posted_content = EXCLUDED.creators_posted_content,
    creators_with_sales = EXCLUDED.creators_with_sales,
    customers = EXCLUDED.customers,
    total_sample_content = EXCLUDED.total_sample_content,
    product_impressions = EXCLUDED.product_impressions,
    product_clicks = EXCLUDED.product_clicks,
    ctor = EXCLUDED.ctor,
    ctr = EXCLUDED.ctr;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  RETURN jsonb_build_object('deleted', deleted_count, 'upserted', inserted_count);
END;
$function$;

-- ── 3) Lock the RPCs down ───────────────────────────────────────────────────
-- All three were reachable by anon AND authenticated over PostgREST (verified
-- 2026-07-25). They are SECURITY DEFINER and their first act on p_overwrite is
-- to DELETE an entire brand-day of facts. Only the service-role key — which
-- only /api/upload/run holds, behind requireAdmin() — may execute them.
--
-- REVOKE FROM PUBLIC is the one that actually matters: Supabase's default
-- privileges grant EXECUTE to PUBLIC, and anon/authenticated inherit it, so a
-- GRANT list that simply omits them revokes nothing. CREATE OR REPLACE above
-- preserves the pre-existing ACL, so this must run after it.

REVOKE ALL ON FUNCTION public.upload_creator_performance_atomic(text, date, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upload_video_performance_atomic(text, date, jsonb, boolean)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upload_product_performance_atomic(text, date, jsonb, boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.upload_creator_performance_atomic(text, date, jsonb, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.upload_video_performance_atomic(text, date, jsonb, boolean)   TO service_role;
GRANT EXECUTE ON FUNCTION public.upload_product_performance_atomic(text, date, jsonb, boolean) TO service_role;
