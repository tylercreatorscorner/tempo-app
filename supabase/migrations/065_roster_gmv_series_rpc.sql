-- Roster per-row sparklines: per-(handle, day) GMV series.
--
-- The roster returns period aggregates; the sparkline column needs the daily
-- GMV trend over the same window. Reads the existing roster_creator_daily
-- summary table (migration 059) — same source + window rules as
-- get_creator_handle_perf, just grouped by stat_date instead of summed.
-- Called per page (the sliced handles only), so it stays cheap.

create or replace function public.get_creator_handle_gmv_series(
  handles text[], brand_ids uuid[] default null, days_back integer default 30,
  p_start_date date default null, p_end_date date default null)
returns table(tiktok_username text, stat_date date, gmv numeric)
language sql stable security definer set search_path to 'public' as $$
  select rcd.handle, rcd.stat_date, sum(rcd.gmv)::numeric
  from public.roster_creator_daily rcd
  join unnest(handles) as h(handle) on h.handle = rcd.handle
  where rcd.stat_date >= coalesce(p_start_date, current_date - days_back)
    and rcd.stat_date <= coalesce(p_end_date, current_date)
    and (brand_ids is null or rcd.brand_slug in (select slug from public.brands_v2 where id = any(brand_ids)))
  group by rcd.handle, rcd.stat_date;
$$;
