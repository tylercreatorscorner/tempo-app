-- Roster period selector: explicit date ranges (presets + custom).
--
-- The roster RPCs took only `days_back` and filtered `stat_date >= current_date
-- - days_back`. That model can only express "last N days ending today", so the
-- Creators page couldn't offer "Last Month" or an arbitrary custom range.
--
-- Fix: add optional p_start_date / p_end_date. When provided, the window is
-- [p_start_date, p_end_date]; when null, behavior is unchanged (the old
-- days_back path). The summary tables are date-keyed and summable over any
-- window, so this is purely a WHERE-clause change.
--
-- Bounds used everywhere:
--   lower = coalesce(p_start_date, current_date - days_back)
--   upper = coalesce(p_end_date,   current_date)        -- no-op for days_back (data ends yesterday)
--
-- New params are trailing + defaulted, so existing callers that pass only
-- days_back keep working unchanged (backward-compatible). Applied to PROD via
-- the Supabase MCP; this file mirrors it for the repo / fresh environments.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. get_creator_handle_perf
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.get_creator_handle_perf(text[], uuid[], integer);
create or replace function public.get_creator_handle_perf(
  handles text[], brand_ids uuid[] default null, days_back integer default 30,
  p_start_date date default null, p_end_date date default null)
returns table(tiktok_username text, gmv_period numeric, posts_period integer, last_post_date date)
language sql stable security definer set search_path to 'public' as $$
  with g as (
    select rcd.handle, sum(rcd.gmv) as gmv
    from public.roster_creator_daily rcd
    join unnest(handles) as h(handle) on h.handle = rcd.handle
    where rcd.stat_date >= coalesce(p_start_date, current_date - days_back)
      and rcd.stat_date <= coalesce(p_end_date, current_date)
      and (brand_ids is null or rcd.brand_slug in (select slug from public.brands_v2 where id = any(brand_ids)))
    group by rcd.handle
  ),
  p as (
    select rcp.handle,
      count(distinct rcp.video_id) filter (
        where rcp.post_date >= coalesce(p_start_date, current_date - days_back)
          and rcp.post_date <= coalesce(p_end_date, current_date)
      ) as posts,
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. get_creator_handle_brand_gmv
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.get_creator_handle_brand_gmv(text[], uuid[], integer);
create or replace function public.get_creator_handle_brand_gmv(
  handles text[], brand_ids uuid[] default null, days_back integer default 30,
  p_start_date date default null, p_end_date date default null)
returns table(tiktok_username text, brand_id uuid, gmv_period numeric, posts_period integer)
language sql stable security definer set search_path to 'public' as $$
  with g as (
    select rcd.handle, b.id as brand_id, sum(rcd.gmv) as gmv
    from public.roster_creator_daily rcd
    join unnest(handles) as h(handle) on h.handle = rcd.handle
    join public.brands_v2 b on b.slug = rcd.brand_slug
    where rcd.stat_date >= coalesce(p_start_date, current_date - days_back)
      and rcd.stat_date <= coalesce(p_end_date, current_date)
      and (brand_ids is null or b.id = any(brand_ids))
    group by rcd.handle, b.id
  ),
  p as (
    select rcp.handle, b.id as brand_id, count(distinct rcp.video_id) as posts
    from public.roster_creator_posts rcp
    join unnest(handles) as h(handle) on h.handle = rcp.handle
    join public.brands_v2 b on b.slug = rcp.brand_slug
    where rcp.post_date >= coalesce(p_start_date, current_date - days_back)
      and rcp.post_date <= coalesce(p_end_date, current_date)
      and (brand_ids is null or b.id = any(brand_ids))
    group by rcp.handle, b.id
  )
  select coalesce(g.handle, p.handle), coalesce(g.brand_id, p.brand_id),
         coalesce(g.gmv,0)::numeric, coalesce(p.posts,0)::int
  from g full outer join p on p.handle = g.handle and p.brand_id = g.brand_id;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_unmanaged_top_perf
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.get_unmanaged_top_perf(text[], uuid[], integer, integer);
create or replace function public.get_unmanaged_top_perf(
  managed_handles text[] default array[]::text[], brand_ids uuid[] default null,
  limit_count integer default 500, days_back integer default 30,
  p_start_date date default null, p_end_date date default null)
returns table(tiktok_username text, brand_id uuid, real_name text,
              gmv_period numeric, posts_period integer, last_post_date date)
language sql stable security definer set search_path to 'public' as $$
  with gmv as (
    select rud.handle, sum(rud.gmv) as gmv_period
    from public.roster_universe_daily rud
    where rud.stat_date >= coalesce(p_start_date, current_date - days_back)
      and rud.stat_date <= coalesce(p_end_date, current_date)
      and (brand_ids is null or rud.brand_id = any(brand_ids))
    group by rud.handle
    having sum(rud.gmv) > 0
  ),
  top_brand as (
    select distinct on (rud.handle) rud.handle, rud.brand_id
    from public.roster_universe_daily rud
    where rud.stat_date >= coalesce(p_start_date, current_date - days_back)
      and rud.stat_date <= coalesce(p_end_date, current_date)
      and (brand_ids is null or rud.brand_id = any(brand_ids))
    group by rud.handle, rud.brand_id
    order by rud.handle, sum(rud.gmv) desc nulls last
  ),
  posts as (
    select rcp.handle,
      count(distinct rcp.video_id) filter (
        where rcp.post_date >= coalesce(p_start_date, current_date - days_back)
          and rcp.post_date <= coalesce(p_end_date, current_date)
      )::int as posts_period,
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
