-- Roster per-row Posts sparkline: per-(handle, day) distinct-video count.
-- Mirrors get_creator_handle_gmv_series (migration 065) but reads
-- roster_creator_posts and counts distinct video_id per day. Called per page
-- (sliced handles only).

create or replace function public.get_creator_handle_posts_series(
  handles text[], brand_ids uuid[] default null, days_back integer default 30,
  p_start_date date default null, p_end_date date default null)
returns table(tiktok_username text, stat_date date, posts integer)
language sql stable security definer set search_path to 'public' as $$
  select rcp.handle, rcp.post_date, count(distinct rcp.video_id)::int
  from public.roster_creator_posts rcp
  join unnest(handles) as h(handle) on h.handle = rcp.handle
  where rcp.post_date >= coalesce(p_start_date, current_date - days_back)
    and rcp.post_date <= coalesce(p_end_date, current_date)
    and (brand_ids is null or rcp.brand_slug in (select slug from public.brands_v2 where id = any(brand_ids)))
  group by rcp.handle, rcp.post_date;
$$;
