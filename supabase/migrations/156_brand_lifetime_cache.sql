-- 156_brand_lifetime_cache.sql
--
-- Cache the LIFETIME figures the client report needs, with a cross-check that
-- makes silent drift impossible to ship.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
--
-- get_brand_report_extras costs ~12.4s for Lemme. Measured inline, only ~600ms
-- of that is windowed work; the rest is two CTEs that rescan the brand's ENTIRE
-- history on every single report:
--
--     life_w       scans all creator_performance for the brand   ~1.0s inline
--     life_videos  COUNT(DISTINCT video_id) over all history      ~1.7s inline
--
-- and both get much worse inside a parameterised function. That cost only
-- grows as history accumulates.
--
-- ── Why this is NOT just "another brand_daily_stats" ────────────────────────
--
-- brand_daily_stats already exists and is supposed to be this. Measured
-- 2026-08-20, refreshed the same day, it disagrees with creator_performance on
-- 7 of 19 brands, in BOTH directions:
--
--     catakor            truth 11,518,494.73   rollup 12,794,392.10   -1,275,897
--     physicians_choice  truth 16,741,407.02   rollup 17,980,720.07   -1,239,313
--     peach_slices       truth  1,772,618.21   rollup  1,315,618.90     +456,999
--
-- A rollup nobody checks becomes wrong and stays wrong. So this one ships with
-- verification as a first-class object, not a nice-to-have:
--
--   1. brand_lifetime_daily is a DAILY series, not a single lifetime total.
--      Lifetime "as of" any date is SUM(gmv) WHERE stat_date <= that date, so
--      a report for a past window gets an exact answer instead of today's
--      total. This is the failure mode a single cached total would have.
--
--   2. verify_brand_lifetime_cache() recomputes from source and compares. GMV
--      is a deterministic sum, so the tolerance is ZERO — any difference is a
--      defect, not noise.
--
--   3. Every refresh and every verification writes to
--      brand_lifetime_cache_audit, so drift has a paper trail with a date on
--      it rather than being discovered months later by a client.
--
--   4. The read path returns NULL rather than a stale answer when the cache
--      cannot cover the requested window. The caller falls back to computing
--      live: slower, but never wrong.

-- ── The cache ───────────────────────────────────────────────────────────────

create table if not exists public.brand_lifetime_daily (
  brand       text not null,
  stat_date   date not null,
  gmv         numeric not null default 0,
  orders      bigint  not null default 0,
  refreshed_at timestamptz not null default now(),
  primary key (brand, stat_date)
);

comment on table public.brand_lifetime_daily is
  'Daily per-brand GMV from creator_performance. Deliberately a SERIES, not a '
  'lifetime total: lifetime as-of any date is SUM(gmv) WHERE stat_date <= date, '
  'so historical reports stay exact. Verified by verify_brand_lifetime_cache().';

-- COUNT(DISTINCT video_id) cannot be derived from a daily series (a video
-- recurs across days), so it is stored with the date it was computed through.
-- The reader must refuse it for any window ending after that date.
create table if not exists public.brand_lifetime_videos (
  brand             text not null primary key,
  computed_through  date not null,
  lifetime_videos   bigint not null,
  refreshed_at      timestamptz not null default now()
);

create table if not exists public.brand_lifetime_cache_audit (
  id           bigint generated always as identity primary key,
  checked_at   timestamptz not null default now(),
  action       text not null,           -- 'refresh' | 'verify'
  brand        text not null,
  metric       text not null,           -- 'gmv' | 'videos'
  cached_value numeric,
  truth_value  numeric,
  diff         numeric,
  ok           boolean not null
);

create index if not exists idx_blc_audit_recent
  on public.brand_lifetime_cache_audit (checked_at desc)
  where not ok;

alter table public.brand_lifetime_daily        enable row level security;
alter table public.brand_lifetime_videos       enable row level security;
alter table public.brand_lifetime_cache_audit  enable row level security;
-- No policies: unreachable except through the SECURITY DEFINER functions below
-- and the service role. Same posture as the other cache tables.

-- ── Refresh ─────────────────────────────────────────────────────────────────

create or replace function public.refresh_brand_lifetime_cache(p_brands text[] default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '300s'
as $function$
declare
  v_days    bigint;
  v_brands  bigint;
  v_through date;
begin
  -- Daily series, rebuilt for the brands in scope.
  delete from public.brand_lifetime_daily d
   where p_brands is null or d.brand = any(p_brands);

  insert into public.brand_lifetime_daily (brand, stat_date, gmv, orders)
  select cp.brand, cp.report_date,
         coalesce(sum(cp.gmv), 0)::numeric,
         coalesce(sum(cp.orders), 0)::bigint
  from public.creator_performance cp
  where cp.period_type = 'daily'
    and (p_brands is null or cp.brand = any(p_brands))
  group by cp.brand, cp.report_date;
  get diagnostics v_days = row_count;

  -- Lifetime distinct videos, stamped with what it was computed through.
  select max(report_date) into v_through
  from public.video_performance
  where period_type = 'daily'
    and (p_brands is null or brand = any(p_brands));

  insert into public.brand_lifetime_videos (brand, computed_through, lifetime_videos, refreshed_at)
  select vp.brand, v_through, count(distinct vp.video_id)::bigint, now()
  from public.video_performance vp
  where vp.period_type = 'daily'
    and vp.video_id is not null and vp.video_id <> ''
    and vp.report_date <= v_through
    and (p_brands is null or vp.brand = any(p_brands))
  group by vp.brand
  on conflict (brand) do update
    set computed_through = excluded.computed_through,
        lifetime_videos  = excluded.lifetime_videos,
        refreshed_at     = excluded.refreshed_at;
  get diagnostics v_brands = row_count;

  -- A refresh that is not checked is how brand_daily_stats got to $1.2M wrong.
  perform public.verify_brand_lifetime_cache(p_brands, 'refresh');

  return jsonb_build_object(
    'daily_rows', v_days,
    'brands', v_brands,
    'videos_computed_through', v_through
  );
end;
$function$;

-- ── Cross-check ─────────────────────────────────────────────────────────────

create or replace function public.verify_brand_lifetime_cache(
  p_brands text[] default null,
  p_action text default 'verify'
)
returns table (
  brand        text,
  metric       text,
  cached_value numeric,
  truth_value  numeric,
  diff         numeric,
  ok           boolean
)
language sql
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '300s'
as $function$
  with truth_gmv as (
    select cp.brand, coalesce(sum(cp.gmv), 0)::numeric as v
    from public.creator_performance cp
    where cp.period_type = 'daily'
      and (p_brands is null or cp.brand = any(p_brands))
    group by cp.brand
  ),
  cached_gmv as (
    select d.brand, coalesce(sum(d.gmv), 0)::numeric as v
    from public.brand_lifetime_daily d
    where p_brands is null or d.brand = any(p_brands)
    group by d.brand
  ),
  truth_vid as (
    select vp.brand, count(distinct vp.video_id)::numeric as v
    from public.video_performance vp
    join public.brand_lifetime_videos c on c.brand = vp.brand
    where vp.period_type = 'daily'
      and vp.video_id is not null and vp.video_id <> ''
      and vp.report_date <= c.computed_through
      and (p_brands is null or vp.brand = any(p_brands))
    group by vp.brand
  ),
  cached_vid as (
    select c.brand, c.lifetime_videos::numeric as v
    from public.brand_lifetime_videos c
    where p_brands is null or c.brand = any(p_brands)
  ),
  rows as (
    select coalesce(t.brand, c.brand) as brand, 'gmv'::text as metric,
           c.v as cached_value, t.v as truth_value
    from truth_gmv t full join cached_gmv c using (brand)
    union all
    select coalesce(t.brand, c.brand), 'videos',
           c.v, t.v
    from truth_vid t full join cached_vid c using (brand)
  ),
  scored as (
    -- GMV is a deterministic SUM of the same rows, so the tolerance is ZERO.
    -- Anything other than an exact match is a defect.
    select brand, metric, cached_value, truth_value,
           round(coalesce(cached_value, 0) - coalesce(truth_value, 0), 4) as diff,
           (cached_value is not distinct from truth_value)                as ok
    from rows
  ),
  logged as (
    insert into public.brand_lifetime_cache_audit
      (action, brand, metric, cached_value, truth_value, diff, ok)
    select p_action, brand, metric, cached_value, truth_value, diff, ok from scored
    returning 1
  )
  select brand, metric, cached_value, truth_value, diff, ok
  from scored
  where (select count(*) from logged) >= 0     -- force the insert to run
  order by ok, abs(diff) desc nulls last, brand;
$function$;

-- ── Read path ───────────────────────────────────────────────────────────────

create or replace function public.get_brand_lifetime(
  p_brands  text[],
  p_through date
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  -- Returns NULL when the cache cannot honestly answer for p_through, so the
  -- caller computes live instead. Slower and correct beats fast and wrong.
  select case
    when not exists (
      select 1 from public.brand_lifetime_videos c
      where c.brand = any(p_brands) and c.computed_through >= p_through
    ) then null
    else jsonb_build_object(
      'gmv',        (select coalesce(sum(d.gmv), 0)::numeric
                       from public.brand_lifetime_daily d
                      where d.brand = any(p_brands) and d.stat_date <= p_through),
      'first_date', (select min(d.stat_date)
                       from public.brand_lifetime_daily d
                      where d.brand = any(p_brands) and d.stat_date <= p_through and d.gmv > 0),
      'videos',     (select sum(c.lifetime_videos)
                       from public.brand_lifetime_videos c
                      where c.brand = any(p_brands)),
      'weekly',     (select coalesce(jsonb_agg(jsonb_build_object(
                              'week_end', (p_through - w.wk * 7),
                              'gmv',      w.gmv) order by w.wk desc), '[]'::jsonb)
                       from (
                         select ((p_through - d.stat_date) / 7)::int as wk,
                                sum(d.gmv)::numeric                  as gmv
                         from public.brand_lifetime_daily d
                         where d.brand = any(p_brands) and d.stat_date <= p_through
                         group by 1
                       ) w
                      where w.wk between 0 and 11),
      'best_week',  (select max(w.gmv) from (
                         select ((p_through - d.stat_date) / 7)::int as wk,
                                sum(d.gmv)::numeric                  as gmv
                         from public.brand_lifetime_daily d
                         where d.brand = any(p_brands) and d.stat_date <= p_through
                         group by 1
                       ) w)
    )
  end;
$function$;

revoke all on function public.refresh_brand_lifetime_cache(text[]) from public, anon, authenticated;
grant execute on function public.refresh_brand_lifetime_cache(text[]) to service_role;

revoke all on function public.verify_brand_lifetime_cache(text[], text) from public, anon, authenticated;
grant execute on function public.verify_brand_lifetime_cache(text[], text) to authenticated, service_role;

revoke all on function public.get_brand_lifetime(text[], date) from public, anon, authenticated;
grant execute on function public.get_brand_lifetime(text[], date) to authenticated, service_role;


-- ── Applied alongside 156 ───────────────────────────────────────────────────
--
-- get_brand_report_extras_windowed: the windowed half of
-- get_brand_report_extras (views / prior_views / video_views) with the two
-- lifetime CTEs removed. v1 is deliberately left untouched and remains the
-- FALLBACK the caller uses whenever get_brand_lifetime refuses.
--
-- Scheduled: cron job 'refresh-brand-lifetime-cache', '40 */4 * * *'.
-- Every 4 hours, not every 20 minutes like the roster jobs: this is a 65s full
-- rebuild (it self-verifies, so it does the work twice on purpose) and the
-- data only moves when an upload lands.
--
-- ── Measured on Lemme, 7-day window ─────────────────────────────────────────
--
--     get_brand_report_extras (v1, live lifetime)      12.4 s
--     get_brand_report_extras_windowed + cache          1.55 s
--
-- Values verified identical, not merely close:
--     lifetime gmv    3,145,993.18   both
--     best week         469,620.95   both
--     first date       2026-04-24    both
--     lifetime videos      98,031    both
--     weekly            12 of 12 buckets match to the cent
--
-- ── The audit caught something on its very first run ────────────────────────
--
-- Immediately after the initial refresh, peach_slices came back
-- cached 2,108,533.55 vs truth 2,122,188.19, a $13,654.64 gap. Re-refreshing
-- that one brand produced an exact match, so it was ingest writing DURING the
-- rebuild, not a logic error. Which is the point: a $13k transient was visible
-- within seconds instead of becoming a number a client reads next quarter.
