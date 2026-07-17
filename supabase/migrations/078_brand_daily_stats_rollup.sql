-- Brand-day rollup. The durable fix for the dashboard's timeouts.
--
-- THE DIAGNOSIS. On a 30-day load, Total GMV / the brand sparklines / Top Videos
-- all died with "canceling statement due to statement timeout" — yet every query
-- was fast on its own:
--     analytics_brand_totals            376 ms
--     get_managed_creator_brand_gmv     136 ms
--     get_managed_posts                 381 ms
-- Nothing was slow. The DB showed 24/90 connections, 1 active, zero lock waits.
-- It was ~20 concurrent aggregate scans on a small shared-CPU instance, each
-- ~400ms solo, contending until they crossed the `authenticated` role's 8s
-- statement_timeout (service_role gets 60s, which is why computeManagedGmv —
-- on the admin client — never failed and quietly hogged the CPU).
--
-- So the fix isn't a faster query. It's not doing the work at read time.
--
-- THE NUMBERS. daily_creator_stats is per (creator, brand, day):
--     1,815,328 source rows  ->  1,813 brand-days   (1001x compression)
-- 287 days of every brand's daily performance is 1,813 rows, and the dashboard
-- was scanning 1.8M of them THREE times per load (totals current + prior + the
-- sparkline series) for numbers that are per-brand-per-day.
--
--     analytics_brand_totals @30d:  376 ms / 15,839 buffers  ->  2.0 ms / 335
--                                   = 188x faster, ~47x less I/O
-- The I/O drop matters as much as the latency: it stops this page crowding
-- everything else off the instance.
--
-- ONLY ADDITIVE MEASURES LIVE HERE. unique_creators is deliberately absent — a
-- distinct count is not summable across days (summing per-day distincts
-- double-counts anyone who posts twice). Nothing has displayed it since #136
-- anyway; that column is what caused the original Total GMV $0 timeout.
--
-- DELETE+INSERT per window, not upsert: a brand-day whose source rows were
-- deleted must disappear here too. An upsert would leave a stale row asserting
-- GMV that no longer exists — a silent wrong number, which is the failure mode
-- this whole session has been about.
--
-- Cron mirrors refresh_roster_summaries (mig 059): a frequent trailing-14d pass
-- plus a nightly 40d pass to catch late-arriving backfill, offset 5 minutes from
-- the roster jobs so the two rollups don't contend.
--
-- VERIFIED against the source across all 287 days: 1,813 = 1,813 rows, 0 missing,
-- 0 mismatched on gmv/orders/items/videos, $69,870,263 = $69,870,263. Re-verified
-- after running the real cron payload (idempotent, no drift). Per-brand at 30d:
-- 28 brands, 0 mismatches, $13,570,722 — the exact figure on the dashboard.

CREATE TABLE IF NOT EXISTS public.brand_daily_stats (
  brand_id     uuid        NOT NULL,
  report_date  date        NOT NULL,
  gmv          numeric     NOT NULL DEFAULT 0,
  orders       bigint      NOT NULL DEFAULT 0,
  items_sold   bigint      NOT NULL DEFAULT 0,
  videos       bigint      NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, report_date)
);

COMMENT ON TABLE public.brand_daily_stats IS
  'Per-(brand, day) rollup of daily_creator_stats. 1.8M source rows -> ~1.8k (1000x). '
  'Powers analytics_brand_totals + analytics_brand_daily_series. Refreshed by pg_cron, '
  'mirroring refresh_roster_summaries (mig 059). ONLY ADDITIVE measures live here: '
  'unique_creators is deliberately absent because a distinct count is not summable '
  'across days — summing per-day distincts would double-count anyone posting twice.';

CREATE INDEX IF NOT EXISTS idx_brand_daily_stats_date ON public.brand_daily_stats (report_date);

CREATE OR REPLACE FUNCTION public.refresh_brand_daily_stats(p_days integer DEFAULT 40)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_from date := (CURRENT_DATE - GREATEST(p_days, 0));
  v_rows integer;
BEGIN
  DELETE FROM brand_daily_stats WHERE report_date >= v_from;

  INSERT INTO brand_daily_stats (brand_id, report_date, gmv, orders, items_sold, videos, refreshed_at)
  SELECT
    dcs.brand_id,
    dcs.report_date,
    COALESCE(SUM(dcs.gmv), 0)::numeric,
    COALESCE(SUM(dcs.orders), 0)::bigint,
    COALESCE(SUM(dcs.items_sold), 0)::bigint,
    COALESCE(SUM(dcs.videos), 0)::bigint,
    now()
  FROM daily_creator_stats dcs
  WHERE dcs.report_date >= v_from
    AND dcs.brand_id IS NOT NULL
  GROUP BY dcs.brand_id, dcs.report_date;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$function$;

-- Full backfill (ignores p_days). Run once on deploy; re-runnable any time.
CREATE OR REPLACE FUNCTION public.rebuild_brand_daily_stats()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_rows integer;
BEGIN
  DELETE FROM brand_daily_stats;
  INSERT INTO brand_daily_stats (brand_id, report_date, gmv, orders, items_sold, videos, refreshed_at)
  SELECT dcs.brand_id, dcs.report_date,
         COALESCE(SUM(dcs.gmv),0)::numeric,
         COALESCE(SUM(dcs.orders),0)::bigint,
         COALESCE(SUM(dcs.items_sold),0)::bigint,
         COALESCE(SUM(dcs.videos),0)::bigint,
         now()
  FROM daily_creator_stats dcs
  WHERE dcs.brand_id IS NOT NULL
  GROUP BY dcs.brand_id, dcs.report_date;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$function$;

-- Read only via the SECURITY DEFINER RPCs below; no direct client access.
ALTER TABLE public.brand_daily_stats ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.brand_daily_stats TO service_role;

SELECT public.rebuild_brand_daily_stats();

-- ── Repoint the two analytics RPCs. Arguments, columns and semantics unchanged.
CREATE OR REPLACE FUNCTION public.analytics_brand_totals(
  p_brand_ids UUID[], p_start_date DATE, p_end_date DATE
)
RETURNS TABLE (
  brand_id UUID, brand_slug TEXT, total_gmv NUMERIC,
  total_orders BIGINT, total_items_sold BIGINT, total_videos BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
  SELECT
    b.id, b.slug,
    COALESCE(s.total_gmv, 0),
    COALESCE(s.total_orders, 0)::bigint,
    COALESCE(s.total_items_sold, 0)::bigint,
    COALESCE(s.total_videos, 0)::bigint
  FROM brands_v2 b
  LEFT JOIN (
    SELECT bds.brand_id,
           SUM(bds.gmv)        AS total_gmv,
           SUM(bds.orders)     AS total_orders,
           SUM(bds.items_sold) AS total_items_sold,
           SUM(bds.videos)     AS total_videos
    FROM brand_daily_stats bds
    WHERE bds.report_date BETWEEN p_start_date AND p_end_date
    GROUP BY bds.brand_id
  ) s ON s.brand_id = b.id
  WHERE b.id = ANY(p_brand_ids);
$function$;

CREATE OR REPLACE FUNCTION public.analytics_brand_daily_series(
  p_brand_ids UUID[], p_start_date DATE, p_end_date DATE
)
RETURNS TABLE (brand_id UUID, report_date DATE, gmv NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
  SELECT bds.brand_id, bds.report_date, bds.gmv
  FROM brand_daily_stats bds
  WHERE bds.brand_id = ANY(p_brand_ids)
    AND bds.report_date BETWEEN p_start_date AND p_end_date
  ORDER BY bds.brand_id, bds.report_date;
$function$;

GRANT EXECUTE ON FUNCTION public.analytics_brand_totals(UUID[], DATE, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_brand_daily_series(UUID[], DATE, DATE) TO authenticated, service_role;

-- ── Cron. Offset 5 min from the roster jobs (jobid 1/2) so they don't contend.
SELECT cron.schedule('refresh-brand-daily-stats',         '5,25,45 * * * *', 'select public.refresh_brand_daily_stats(14)');
SELECT cron.schedule('refresh-brand-daily-stats-nightly', '25 4 * * *',      'select public.refresh_brand_daily_stats(40)');
