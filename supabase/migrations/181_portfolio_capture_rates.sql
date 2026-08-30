-- The whole portfolio's capture rate in ONE call.
--
-- get_brand_capture_rate is correct (it ties to the client report to the cent)
-- but calling it once per brand rebuilt the roster membership set every time:
-- 16.9s across 16 brands, which is the same per-call rebuild that
-- managed-gmv.ts hoists in TypeScript for exactly this reason. The scorecard
-- wants every brand at once, so membership is built once here and reused.
--
-- Same membership rule as get_brand_client_report_managed_split, so all three
-- surfaces agree by construction. Verified against the Director's hand-built
-- scorecard for July 2026: all 14 brands within 0.16 percentage points, and 9
-- of 14 identical to the dollar. The small differences are mid-window
-- departures, which this counts for the days they were actually on the roster
-- and the spreadsheet did not.
--
-- Umbrella handling: GMV is keyed by STORE slug (leefar_nutrition) while roster
-- rows sit at the UMBRELLA (leefar). Both sides are normalised to the top-level
-- slug before joining, so a store-grain fact row matches an umbrella-grain
-- roster row. Getting this wrong silently reports an umbrella brand at 0%.
--
-- PERFORMANCE, measured, so nobody re-litigates it later:
--   one week, whole portfolio   ~5.0s
--   one month, whole portfolio  ~19s
-- The cost is inherent: July spans 3.77M creator-brand-days in the rollup, and
-- the scan is the work (the membership set builds in 75ms). An index leading
-- with stat_date was tried and REMOVED: the planner used it but the gain was
-- within noise (19.0s -> 18.9s) and it added write overhead to a refresh cron
-- with a history of timing out. If a month-grain board needs to be
-- interactive, the answer is a cached brand-day rollup, not another index.
--
-- WARNING: managed GMV for a PAST period changes when creators are added to the
-- roster later, because nothing gates on added_at (see migration 180 for why it
-- must not). Recomputing July today versus what July would have said at the
-- time: Forchics $0 -> $112,490, Neurogum $0 -> $23,807, Peach Slices +151%.
-- That is a data-entry artifact, not a business event, but it means a scorecard
-- grade is NOT stable over time. Each weekly submission must therefore SNAPSHOT
-- the capture rate it was graded on; a divergence between the snapshot and the
-- live figure is itself the signal that a roster backfill happened.

create or replace function public.get_portfolio_capture_rates(
  p_start date,
  p_end   date
) returns table (
  brand_slug  text,
  brand_name  text,
  brand_gmv   numeric,
  managed_gmv numeric,
  capture_pct numeric
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  with brand_map as (
    -- data slug -> its top-level brand. Archived brands are excluded: COSRX and
    -- Earth Breeze still show GMV but are no longer CC clients.
    select b.slug                        as data_slug,
           coalesce(par.slug, b.slug)    as top_slug,
           coalesce(par.name, b.name)    as top_name
    from public.brands_v2 b
    left join public.brands_v2 par on par.id = b.parent_brand_id
    where coalesce(b.is_archived, false) = false
      and coalesce(par.is_archived, false) = false
  ),
  src as (
    select mc.brand as roster_brand, mc.archived_at,
           lower(btrim(regexp_replace(h.handle, '^@', ''))) as handle
    from public.managed_creators mc
      cross join lateral (values
        (mc.account_1), (mc.account_2), (mc.account_3), (mc.account_4), (mc.account_5),
        (mc.account_6), (mc.account_7), (mc.account_8), (mc.account_9), (mc.account_10)
      ) h(handle)
    where h.handle is not null and btrim(h.handle) <> ''
    union all
    select mc.brand, mc.archived_at,
           lower(btrim(regexp_replace(t.tiktok_username, '^@', '')))
    from public.managed_creators mc
    join public.tiktok_accounts t on t.creator_id = mc.creator_id
    where mc.creator_id is not null
      and t.tiktok_username is not null and btrim(t.tiktok_username) <> ''
  ),
  mem as materialized (
    -- Roster brand normalised to top-level, so umbrella and store grain meet.
    select coalesce(bm.top_slug, s.roster_brand) as top_slug,
           s.handle,
           bool_or(s.archived_at is null) as ever_active,
           max(s.archived_at)::date       as archived_on
    from src s
    left join brand_map bm on bm.data_slug = s.roster_brand
    group by 1, 2
  ),
  rows_ as (
    select bm.top_slug, bm.top_name, d.gmv,
           (m.handle is not null
             and (m.ever_active or m.archived_on > d.stat_date)) as is_managed
    from public.roster_creator_daily d
    join brand_map bm on bm.data_slug = d.brand_slug
    left join mem m on m.handle = d.handle and m.top_slug = bm.top_slug
    where d.stat_date between p_start and p_end
  )
  select top_slug,
         top_name,
         round(sum(gmv), 2),
         round(coalesce(sum(gmv) filter (where is_managed), 0), 2),
         -- NULL, never 0, when there is no denominator.
         case when sum(gmv) > 0
              then round(100 * coalesce(sum(gmv) filter (where is_managed), 0) / sum(gmv), 2)
              else null end
  from rows_
  group by 1, 2
  having sum(gmv) > 0
  order by 3 desc;
$fn$;

revoke all on function public.get_portfolio_capture_rates(date, date) from public;
grant execute on function public.get_portfolio_capture_rates(date, date)
  to authenticated, service_role;

comment on function public.get_portfolio_capture_rates(date, date) is
  'Capture rate for every active brand in one call, for the portfolio scorecard. Builds roster '
  'membership once rather than per brand. Same membership rule as '
  'get_brand_client_report_managed_split and get_brand_capture_rate, so all three agree. Archived '
  'brands are excluded even when they still show GMV. ~5s for a week, ~19s for a month.';
