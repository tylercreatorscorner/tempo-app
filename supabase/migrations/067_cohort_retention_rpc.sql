-- Creator cohort-retention matrix (powers /retention).
--
-- Rows = cohort of managed creators bucketed by the month of their FIRST managed
-- post (behavioural acquisition); columns = months since that first post; cell =
-- count of that cohort still active (posted >=1 real video) in month N.
--
-- Reads the pg_cron-refreshed roster_creator_posts rollup (migration 059, built
-- from videos.video_id — the CORRECT post source, not the miscounting
-- daily_video_product_stats.video_id), so it is index-served and cheap
-- (~135ms all-brands, EXPLAIN: Function Scan, 21k shared hits, 0 disk), NOT a
-- fact-table scan — the opposite of the 83s normalized-join incident. Well under
-- the 30s Vercel budget and the 100k-row RPC cap (~120 rows out).
--
-- Dedups multi-handle creators to ONE creator_id before counting (39% of managed
-- creators carry >1 handle), and maps each handle to exactly one managed
-- creator_id so a post is never double-counted across tangled identities.
--
-- p_brand_slugs: DATA-STORE slugs, already umbrella-expanded by the caller (like
-- computeManagedGmv). NULL => all brands. Empty array => empty result
-- (fail-closed for scoped managers, matching /api/roster).
create or replace function public.get_cohort_retention(
  p_brand_slugs text[] default null
)
returns table(
  cohort_month    date,
  month_index     int,
  active_creators int,
  cohort_size     int
)
language sql stable security definer set search_path to 'public' as $$
  with managed_handles as (
    -- one managed creator_id per handle (deterministic), so a post joins to a
    -- single person even when a handle is tangled across identities.
    select distinct on (lower(ta.tiktok_username))
           lower(ta.tiktok_username) as handle,
           mc.creator_id
    from public.managed_creators mc
    join public.tiktok_accounts ta on ta.creator_id = mc.creator_id
    where mc.archived_at is null
      and mc.creator_id is not null
      and ta.tiktok_username is not null
    order by lower(ta.tiktok_username), ta.is_primary desc nulls last, mc.creator_id
  ),
  creator_month as (
    -- one row per (creator_id, active calendar month); rolls a person's handles up
    select mh.creator_id,
           date_trunc('month', rcp.post_date)::date as active_month
    from public.roster_creator_posts rcp
    join managed_handles mh on mh.handle = rcp.handle
    where (p_brand_slugs is null or rcp.brand_slug = any(p_brand_slugs))
    group by mh.creator_id, date_trunc('month', rcp.post_date)
  ),
  cohort as (
    select creator_id, min(active_month) as cohort_month
    from creator_month
    group by creator_id
  ),
  sized as (
    select cohort_month, count(*)::int as cohort_size
    from cohort
    group by cohort_month
  ),
  retained as (
    select c.cohort_month,
           ((extract(year  from cm.active_month) - extract(year  from c.cohort_month)) * 12
          +  (extract(month from cm.active_month) - extract(month from c.cohort_month)))::int as month_index,
           count(distinct cm.creator_id)::int as active_creators
    from creator_month cm
    join cohort c on c.creator_id = cm.creator_id
    group by c.cohort_month, month_index
  )
  select r.cohort_month, r.month_index, r.active_creators, s.cohort_size
  from retained r
  join sized s on s.cohort_month = r.cohort_month
  order by r.cohort_month, r.month_index;
$$;

grant execute on function public.get_cohort_retention(text[]) to anon, authenticated, service_role;
