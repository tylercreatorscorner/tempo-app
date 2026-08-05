-- 142_coverage_bounds_expect_from_fact_tables.sql
--
-- The coverage ledger cannot see a brand that stops shipping one of its three
-- reports. Found 2026-08-04 on peach_slices.
--
-- ── What happened ──────────────────────────────────────────────────────────
--
-- peach_slices shipped all three reports from 2025-11-01 to 2026-01-21, went
-- quiet, then resumed on 2026-08-04 with a 33-day backfill of creator_performance
-- ONLY. No product file, no video file, 7/01 through 8/02. ingestion_runs holds
-- 33 complete creator runs for that session and nothing else.
--
-- The ledger showed the brand as fully covered, because:
--
--   get_upload_coverage_bounds drove its row set from a CTE over
--   upload_coverage_daily, which pg_cron refreshes 31 days back (migration 125).
--   peach_slices last wrote video/product on 2026-01-21, far outside that
--   window, so the rollup had no row for those pairs and bounds returned none.
--
--   coverage/route.ts then does
--     expectedTypes = COVERAGE_TABLES.filter(t => bounds.has(`${slug}|${t.table}`))
--   so the brand was expected to ship creator data and nothing else. It rendered
--   with creator cells, all green, and no product or video cells at all. It has a
--   pipeline, so it missed the noPipelineBrands warning too.
--
-- The intent in that filter is right: "a report is expected once the brand has
-- actually produced it". peach_slices HAS produced it (20,686 video rows, 1,481
-- product rows). The implementation just asked a 31-day rollup a question about
-- eight months of history. Migration 125 fixed exactly this class of bug for
-- first_date and left the row set itself rollup-bound.
--
-- ── The fix ────────────────────────────────────────────────────────────────
--
-- Drive the row set from the fact tables and FULL JOIN the rollup onto it, so a
-- pair the rollup has forgotten still counts as expected. A brand dark for more
-- than 31 days now stays loudly red instead of silently leaving the grid, which
-- is the ledger's whole purpose (the six brands that went dark on 2026-07-09
-- would have aged out the same way had nobody caught them inside a month).
--
-- Retirement is expressed by archiving the brand in brands_v2, which classifyCell
-- already honours, NOT by letting a rollup window forget it. That is the only
-- control that should be able to say "nothing is owed here".
--
-- Measured blast radius on prod before applying: exactly two new (brand, table)
-- pairs, both peach_slices, both correct. No other brand gains a cell.
--
-- ── Performance ────────────────────────────────────────────────────────────
--
-- Migration 125 described its truth CTE as "three index-only min() scans", which
-- undersold it: min(report_date) GROUP BY brand has no loose-index-scan in
-- Postgres, so it aggregated 4.9M + 4.7M rows on every /upload load. Measured on
-- prod 2026-08-04: the shipped function is 1,054 ms, and adding max() to it for
-- the last_date below took it to 1,361 ms.
--
-- Replaced with per-brand LATERAL probes (ORDER BY report_date LIMIT 1, forward
-- and backward) against idx_creator_perf_brand_date_period and
-- idx_video_perf_brand_date_period. Each probe is one index-only row, ~30 brands
-- x 2 ends, and both tables drop to ~1.5 ms.
--
-- product_performance deliberately keeps the plain GROUP BY: it has no (brand, *)
-- index, so a lateral probe falls back to idx_product_perf_date and filters ~43k
-- rows per brand (561 ms measured). At 80,581 rows the seq scan is 37 ms. Not
-- worth an index to save 35 ms.
--
-- Net: 1,054 ms to 54 ms, and it now returns a true last_date as well.

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
  with brand_list as (
    select b.slug
    from public.brands_v2 b
    where p_brands is null or b.slug = any(p_brands)
  ),
  -- What each brand has EVER produced, from the fact tables. This is the row
  -- set: the rollup only annotates it.
  truth as (
    select bl.slug as brand_slug,
           'creator_performance'::text as target_table,
           mn.d as first_date,
           mx.d as last_date
    from brand_list bl
    join lateral (
      select c.report_date as d
      from public.creator_performance c
      where c.brand = bl.slug and c.period_type = 'daily'
      order by c.report_date asc
      limit 1
    ) mn on true
    join lateral (
      select c.report_date as d
      from public.creator_performance c
      where c.brand = bl.slug and c.period_type = 'daily'
      order by c.report_date desc
      limit 1
    ) mx on true

    union all

    select bl.slug,
           'video_performance'::text,
           mn.d,
           mx.d
    from brand_list bl
    join lateral (
      select v.report_date as d
      from public.video_performance v
      where v.brand = bl.slug and v.period_type = 'daily'
      order by v.report_date asc
      limit 1
    ) mn on true
    join lateral (
      select v.report_date as d
      from public.video_performance v
      where v.brand = bl.slug and v.period_type = 'daily'
      order by v.report_date desc
      limit 1
    ) mx on true

    union all

    -- Seq scan on purpose. See the performance note above.
    select bl.slug,
           'product_performance'::text,
           pp.first_date,
           pp.last_date
    from (
      select p.brand,
             min(p.report_date) as first_date,
             max(p.report_date) as last_date
      from public.product_performance p
      where p.period_type = 'daily'
      group by p.brand
    ) pp
    join brand_list bl on bl.slug = pp.brand
  ),
  rollup as (
    select u.brand_slug,
           u.target_table,
           max(u.report_date) as last_date,
           public.upload_coverage_median(
             array_agg(u.row_count order by u.report_date desc)
               filter (where u.report_date >= current_date - 28)
           ) as median_rows,
           count(*)::int as days_present
    from public.upload_coverage_daily u
    where u.row_count > 0
      and (p_brands is null or u.brand_slug = any(p_brands))
    group by u.brand_slug, u.target_table
  )
  -- FULL, not LEFT. A pair the rollup has aged out is still expected; a rollup
  -- row with no fact rows should never exist, but if one does we would rather
  -- see it than drop it.
  select coalesce(t.brand_slug, r.brand_slug) as brand_slug,
         coalesce(t.target_table, r.target_table) as target_table,
         t.first_date,
         -- True last day, so this is no longer capped at the rollup horizon.
         coalesce(t.last_date, r.last_date) as last_date,
         -- Stays rollup-derived and stays nullable. It is a 28-day display
         -- median, not a detector input, and the cell drawer already falls back
         -- to the neighbour median when it is null.
         r.median_rows,
         coalesce(r.days_present, 0) as days_present
  from truth t
  full join rollup r
    on r.brand_slug = t.brand_slug
   and r.target_table = t.target_table;
$function$;

-- create or replace preserves the existing ACL, but state it anyway: a GRANT
-- list that merely omits anon revokes NOTHING, and this function is one
-- copy-paste away from being readable by every authenticated session.
revoke all on function public.get_upload_coverage_bounds(text[]) from public, anon, authenticated;
grant execute on function public.get_upload_coverage_bounds(text[]) to service_role;
