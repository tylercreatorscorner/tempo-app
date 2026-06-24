-- Roster page performance: precomputed summary tables.
--
-- /api/roster recomputed period GMV / posts / last-post for ALL ~1,184 managed
-- handles on every load by scanning creator_performance (1.1M), videos (1.5M),
-- video_performance (500K) and daily_video_product_stats (520K). With a
-- ~1,184-element `= ANY(array)` the planner abandons indexes and seq-scans, so
-- get_creator_handle_perf / get_creator_handle_brand_gmv took ~35-38s and
-- get_unmanaged_top_perf timed out (>60s) — slow regardless of filter.
--
-- Fix: materialize the exact aggregations into small, indexed summary tables and
-- have the RPCs read those. Measured: perf RPC 35s -> ~0.25s; unmanaged >60s ->
-- ~2.6s. Validated byte-identical to the old fact-table scans (GMV, posts and
-- last-post: 0 mismatches across all-brands and brand-filtered samples).
--
-- Applied to PROD via the Supabase MCP (tables created + backfilled in date
-- chunks, RPCs swapped, pg_cron scheduled). This file mirrors it for the repo
-- and fresh environments. The bulk backfill is NOT inlined (it would exceed the
-- statement timeout on a populated DB); fresh envs are seeded by the bounded
-- refresh at the bottom + the pg_cron jobs, and prod was backfilled out-of-band.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Summary tables
-- ─────────────────────────────────────────────────────────────────────────────

-- Daily per-(handle, brand_slug) GMV (from creator_performance). Summable over
-- any window. Keyed by brand SLUG (not uuid) so brands absent from brands_v2 are
-- preserved — matching get_creator_handle_perf's unfiltered GMV.
create table if not exists public.roster_creator_daily (
  handle      text not null,
  brand_slug  text not null,
  stat_date   date not null,
  gmv         numeric not null default 0,
  posts       integer not null default 0,   -- unused (posts live in their own table); kept for back-compat
  primary key (handle, brand_slug, stat_date)
);
create index if not exists idx_rcd_handle_date on public.roster_creator_daily (handle, stat_date);
create index if not exists idx_rcd_brand_date  on public.roster_creator_daily (brand_slug, stat_date);

-- One row per (handle, video_id, brand_slug) from videos ∪ video_performance.
-- posts_period = COUNT(DISTINCT video_id) — byte-identical to the RPC's
-- all_posts; the PK keeps it globally deduped under chunked / incremental
-- refresh. post_date = max across sources (window membership matches the RPC).
create table if not exists public.roster_creator_posts (
  handle     text not null,
  video_id   text not null,
  brand_slug text not null,
  post_date  date not null,
  primary key (handle, video_id, brand_slug)
);
create index if not exists idx_rcp_handle_date on public.roster_creator_posts (handle, post_date);
create index if not exists idx_rcp_brand_date  on public.roster_creator_posts (brand_slug, post_date);

-- Daily per-(handle, brand_id) GMV from daily_video_product_stats — the
-- unmanaged view's GMV source (distinct from creator_performance). Null brand_id
-- → sentinel so the PK holds and all-brands sums still include it.
create table if not exists public.roster_universe_daily (
  handle     text not null,
  brand_id   uuid not null,
  stat_date  date not null,
  gmv        numeric not null default 0,
  primary key (handle, brand_id, stat_date)
);
create index if not exists idx_rud_handle_date on public.roster_universe_daily (handle, stat_date);
create index if not exists idx_rud_brand_date  on public.roster_universe_daily (brand_id, stat_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Refresh functions (range-bounded so chunked backfill + incremental stay cheap)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.refresh_roster_creator_daily_range(p_from date, p_to date)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_count integer;
begin
  delete from public.roster_creator_daily where stat_date >= p_from and stat_date < p_to;
  insert into public.roster_creator_daily (handle, brand_slug, stat_date, gmv, posts)
  select g.handle, g.brand_slug, g.d, g.gmv, 0
  from (
    select lower(cp.creator_name) as handle, cp.brand as brand_slug,
           cp.report_date as d, sum(cp.gmv)::numeric as gmv
    from public.creator_performance cp
    where cp.period_type = 'daily' and cp.creator_name is not null and cp.brand is not null
      and cp.report_date >= p_from and cp.report_date < p_to
    group by lower(cp.creator_name), cp.brand, cp.report_date
  ) g;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.refresh_roster_creator_posts_range(p_from date, p_to date)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_count integer;
begin
  insert into public.roster_creator_posts (handle, video_id, brand_slug, post_date)
  select distinct on (handle, video_id, brand_slug) handle, video_id, brand_slug, post_date
  from (
    select lower(trim(regexp_replace(v.creator_name, '^@', ''))) as handle,
           v.video_id, v.brand as brand_slug, v.post_date
    from public.videos v
    where v.video_id is not null and v.video_id <> '' and v.creator_name is not null
      and v.brand is not null and v.post_date is not null
      and v.post_date >= p_from and v.post_date < p_to
    union all
    select lower(trim(regexp_replace(vp.creator_name, '^@', ''))) as handle,
           vp.video_id, vp.brand as brand_slug, vp.post_date
    from public.video_performance vp
    where vp.video_id is not null and vp.video_id <> '' and vp.creator_name is not null
      and vp.brand is not null and vp.post_date is not null
      and vp.post_date >= p_from and vp.post_date < p_to
  ) u
  order by handle, video_id, brand_slug, post_date desc
  on conflict (handle, video_id, brand_slug) do update
    set post_date = greatest(public.roster_creator_posts.post_date, excluded.post_date);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.refresh_roster_universe_daily_range(p_from date, p_to date)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_count integer;
begin
  delete from public.roster_universe_daily where stat_date >= p_from and stat_date < p_to;
  insert into public.roster_universe_daily (handle, brand_id, stat_date, gmv)
  select lower(s.tiktok_username),
         coalesce(s.brand_id, '00000000-0000-0000-0000-000000000000'::uuid),
         s.report_date, sum(s.gmv)::numeric
  from public.daily_video_product_stats s
  where s.tiktok_username is not null and s.report_date >= p_from and s.report_date < p_to
  group by lower(s.tiktok_username), coalesce(s.brand_id, '00000000-0000-0000-0000-000000000000'::uuid), s.report_date;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Convenience: refresh the last p_days across all three summaries (historical
-- days are immutable, so a small window is cheap). p_days null → ~400d full.
create or replace function public.refresh_roster_summaries(p_days integer default 14)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_from date := case when p_days is null then current_date - 400 else current_date - p_days end;
begin
  perform public.refresh_roster_creator_daily_range(v_from, current_date + 1);
  perform public.refresh_roster_creator_posts_range(v_from, current_date + 1);
  perform public.refresh_roster_universe_daily_range(v_from, current_date + 1);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPCs — read from the summaries (signatures + output unchanged)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.get_creator_handle_perf(handles text[], brand_ids uuid[] default null, days_back integer default 30)
returns table(tiktok_username text, gmv_period numeric, posts_period integer, last_post_date date)
language sql stable security definer set search_path to 'public' as $$
  with g as (
    select rcd.handle, sum(rcd.gmv) as gmv
    from public.roster_creator_daily rcd
    join unnest(handles) as h(handle) on h.handle = rcd.handle
    where rcd.stat_date >= (current_date - days_back)
      and (brand_ids is null or rcd.brand_slug in (select slug from public.brands_v2 where id = any(brand_ids)))
    group by rcd.handle
  ),
  p as (
    select rcp.handle,
      count(distinct rcp.video_id) filter (where rcp.post_date >= current_date - days_back) as posts,
      max(rcp.post_date) as last_post
    from public.roster_creator_posts rcp
    join unnest(handles) as h(handle) on h.handle = rcp.handle
    where rcp.post_date >= (current_date - 365)
      and (brand_ids is null or rcp.brand_slug in (select slug from public.brands_v2 where id = any(brand_ids)))
    group by rcp.handle
  )
  select coalesce(g.handle, p.handle), coalesce(g.gmv,0)::numeric,
         coalesce(p.posts,0)::int, p.last_post
  from g full outer join p on p.handle = g.handle;
$$;

create or replace function public.get_creator_handle_brand_gmv(handles text[], brand_ids uuid[] default null, days_back integer default 30)
returns table(tiktok_username text, brand_id uuid, gmv_period numeric, posts_period integer)
language sql stable security definer set search_path to 'public' as $$
  with g as (
    select rcd.handle, b.id as brand_id, sum(rcd.gmv) as gmv
    from public.roster_creator_daily rcd
    join unnest(handles) as h(handle) on h.handle = rcd.handle
    join public.brands_v2 b on b.slug = rcd.brand_slug
    where rcd.stat_date >= (current_date - days_back)
      and (brand_ids is null or b.id = any(brand_ids))
    group by rcd.handle, b.id
  ),
  p as (
    select rcp.handle, b.id as brand_id, count(distinct rcp.video_id) as posts
    from public.roster_creator_posts rcp
    join unnest(handles) as h(handle) on h.handle = rcp.handle
    join public.brands_v2 b on b.slug = rcp.brand_slug
    where rcp.post_date >= (current_date - days_back)
      and (brand_ids is null or b.id = any(brand_ids))
    group by rcp.handle, b.id
  )
  select coalesce(g.handle, p.handle), coalesce(g.brand_id, p.brand_id),
         coalesce(g.gmv,0)::numeric, coalesce(p.posts,0)::int
  from g full outer join p on p.handle = g.handle and p.brand_id = g.brand_id;
$$;

create or replace function public.get_unmanaged_top_perf(
  managed_handles text[] default array[]::text[], brand_ids uuid[] default null,
  limit_count integer default 500, days_back integer default 30)
returns table(tiktok_username text, brand_id uuid, real_name text,
              gmv_period numeric, posts_period integer, last_post_date date)
language sql stable security definer set search_path to 'public' as $$
  with gmv as (
    select rud.handle, sum(rud.gmv) as gmv_period
    from public.roster_universe_daily rud
    where rud.stat_date >= current_date - days_back
      and (brand_ids is null or rud.brand_id = any(brand_ids))
    group by rud.handle
    having sum(rud.gmv) > 0
  ),
  top_brand as (
    select distinct on (rud.handle) rud.handle, rud.brand_id
    from public.roster_universe_daily rud
    where rud.stat_date >= current_date - days_back
      and (brand_ids is null or rud.brand_id = any(brand_ids))
    group by rud.handle, rud.brand_id
    order by rud.handle, sum(rud.gmv) desc nulls last
  ),
  posts as (
    select rcp.handle,
      count(distinct rcp.video_id) filter (where rcp.post_date >= current_date - days_back)::int as posts_period,
      max(rcp.post_date) as last_post
    from public.roster_creator_posts rcp
    where rcp.post_date >= current_date - 365
      and (brand_ids is null or rcp.brand_slug in (select slug from public.brands_v2 where id = any(brand_ids)))
    group by rcp.handle
  ),
  acct as (
    select distinct on (lower(ta.tiktok_username)) lower(ta.tiktok_username) as handle, ta.creator_id
    from public.tiktok_accounts ta where ta.tiktok_username is not null
    order by lower(ta.tiktok_username), ta.is_primary desc nulls last, ta.creator_id
  )
  select g.handle, tb.brand_id, cv.real_name,
         g.gmv_period::numeric, coalesce(p.posts_period,0)::int, p.last_post
  from gmv g
  join top_brand tb on tb.handle = g.handle
  left join posts p on p.handle = g.handle
  left join acct a on a.handle = g.handle
  left join public.creators_v2 cv on cv.id = a.creator_id
  where not (g.handle = any(managed_handles))
  order by g.gmv_period desc nulls last
  limit limit_count;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Scheduled refresh (pg_cron) — tolerant of environments without it
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('refresh-roster-summaries', '*/20 * * * *',
                        'select public.refresh_roster_summaries(14)');
  perform cron.schedule('refresh-roster-summaries-nightly', '20 4 * * *',
                        'select public.refresh_roster_summaries(40)');
exception when others then
  raise notice 'pg_cron not configured (%) — schedule refresh_roster_summaries() externally', sqlerrm;
end $$;

-- Seed recent data for fresh environments (bounded so it can't time out). Prod
-- was fully backfilled (~400d) out-of-band via the Supabase MCP in date chunks;
-- run select public.refresh_roster_summaries(null) once for full history.
select public.refresh_roster_summaries(35);
