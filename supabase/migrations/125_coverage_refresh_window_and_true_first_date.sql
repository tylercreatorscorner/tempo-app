-- 125_coverage_refresh_window_and_true_first_date.sql
--
-- Two coverage-ledger defects found by adversarial review of migration 123.
--
-- ── 1. The frequent refresh covered less than the page renders ──────────────
--
-- The 10-minute pg_cron tick ran refresh_upload_coverage(14) while the ledger's
-- default window is 30 days (MAX_DAYS 90). Everything older than 14 days was
-- therefore refreshed once a day, at 04:35 UTC, which breaks in both directions:
--
--   false all-clear  rows removed from a day in that band (a corrected
--                    re-upload rolled back, a bad file cleaned up) leave the
--                    old count standing for up to 24h — exactly the
--                    "append-only memory" failure the delete-then-insert in
--                    refresh_upload_coverage was written to prevent.
--   false alarm      the ledger's whole purpose is surfacing OLD gaps, so old
--                    gaps are what operators repair. They upload the missing
--                    day, the grid refetches immediately, and the cell they
--                    just filled still reads MISSING for up to 24 hours.
--
-- 31 rather than 30 so the boundary column is never the one that rots.
--
-- ── 2. first_date was a rollup artifact, and it is about to matter more ─────
--
-- get_upload_coverage_bounds derived first_date from upload_coverage_daily,
-- whose earliest row is 2026-05-27 (the rollup's own horizon). The fact tables
-- reach back to 2025-10-01. Measured today: 42 of 45 (brand, target_table)
-- pairs have a true first day EARLIER than the rollup's.
--
-- classifyCell treats `date < first_date` as not_expected with the sentence
-- "This brand's first data for this report is <date>" — so at ?days=90 (which
-- MAX_DAYS permits) the page tells the operator that a brand with eight months
-- of history did not exist before 2026-05-27, and greys out every cell before
-- it. A wrong not_expected is the most expensive state on this page: it is the
-- one that says "nothing is owed here".
--
-- Fixed by reading the minimum from the fact tables directly. That is three
-- index-only min() scans on (brand, report_date) rather than a rollup lookup —
-- once per page load, not per cell.
--
-- median_rows deliberately still comes from the rollup and is still anchored on
-- current_date. It is NOT an input to any detector (the detectors read the
-- 7-day neighbour medians from get_upload_coverage_matrix); it is displayed in
-- the drawer, now labelled "Median, last 28d" so the window is visible rather
-- than implied.

-- ── 1 ───────────────────────────────────────────────────────────────────────
do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where command = 'select public.refresh_upload_coverage(14)';

  if v_jobid is not null then
    perform cron.alter_job(v_jobid, command => 'select public.refresh_upload_coverage(31)');
  end if;
end $$;

-- ── 2 ───────────────────────────────────────────────────────────────────────
create or replace function public.get_upload_coverage_bounds(p_brands text[] default null::text[])
returns table(
  brand_slug text,
  target_table text,
  first_date date,
  last_date date,
  median_rows integer,
  days_present integer
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with rollup as (
    SELECT u.brand_slug,
           u.target_table,
           max(u.report_date) AS last_date,
           public.upload_coverage_median(
             array_agg(u.row_count ORDER BY u.report_date DESC)
               FILTER (WHERE u.report_date >= current_date - 28)
           ) AS median_rows,
           count(*)::int AS days_present
    FROM public.upload_coverage_daily u
    WHERE u.row_count > 0
      AND (p_brands IS NULL OR u.brand_slug = ANY(p_brands))
    GROUP BY u.brand_slug, u.target_table
  ),
  -- The TRUE first day, from the fact tables. The rollup only reaches back to
  -- its own refresh horizon and would claim a brand did not exist before it.
  truth as (
    SELECT c.brand AS brand_slug, 'creator_performance'::text AS target_table,
           min(c.report_date) AS first_date
    FROM public.creator_performance c
    WHERE c.period_type = 'daily'
      AND (p_brands IS NULL OR c.brand = ANY(p_brands))
    GROUP BY c.brand
    UNION ALL
    SELECT v.brand, 'video_performance'::text, min(v.report_date)
    FROM public.video_performance v
    WHERE v.period_type = 'daily'
      AND (p_brands IS NULL OR v.brand = ANY(p_brands))
    GROUP BY v.brand
    UNION ALL
    SELECT p.brand, 'product_performance'::text, min(p.report_date)
    FROM public.product_performance p
    WHERE p.period_type = 'daily'
      AND (p_brands IS NULL OR p.brand = ANY(p_brands))
    GROUP BY p.brand
  )
  SELECT r.brand_slug,
         r.target_table,
         t.first_date,
         r.last_date,
         r.median_rows,
         r.days_present
  FROM rollup r
  LEFT JOIN truth t
    ON t.brand_slug = r.brand_slug
   AND t.target_table = r.target_table;
$function$;

-- A GRANT list that merely omits anon revokes NOTHING — the default is EXECUTE
-- to PUBLIC. State the revoke explicitly, then grant only what should call it.
revoke all on function public.get_upload_coverage_bounds(text[]) from public, anon, authenticated;
grant execute on function public.get_upload_coverage_bounds(text[]) to service_role;
