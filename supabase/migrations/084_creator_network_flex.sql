-- Network "flex" band for the creator portal Home hero.
--
-- Returns network-scale context for one creator in a window: total network GMV,
-- how many creators drove GMV, the creator's own GMV, and their rank. The portal
-- renders "You're 1 of N creators powering $X across the network · Top Y%".
--
-- Source is daily_creator_stats (one row per creator per day) — NOT the raw
-- daily_video_product_stats (per video × product × day). Aggregating the small
-- rollup keeps this to a single fast scan even network-wide (no brand filter);
-- the portal still streams it behind Suspense so a slow window never blocks Home.
--
-- Ranking note: creators are ranked by per-handle GMV; a multi-handle creator's
-- own GMV is summed across their handles and compared to others' per-handle sums.
-- This is a deliberate approximation for a morale stat (errs slightly generous,
-- never understates), not an exact creator-grouped leaderboard.

create or replace function public.get_creator_network_flex(
  p_handles text[],
  p_start date,
  p_end date
)
returns table(
  network_gmv numeric,
  creator_count bigint,
  my_gmv numeric,
  my_rank bigint
)
language sql
stable
as $$
  with per_creator as (
    select lower(tiktok_username) as h, sum(gmv) as gmv
    from daily_creator_stats
    where report_date between p_start and p_end
    group by lower(tiktok_username)
    having sum(gmv) > 0
  ),
  me as (
    select coalesce(sum(gmv), 0) as gmv
    from per_creator
    where h = any (select lower(x) from unnest(p_handles) x)
  )
  select
    (select coalesce(sum(gmv), 0) from per_creator)                        as network_gmv,
    (select count(*) from per_creator)                                     as creator_count,
    (select gmv from me)                                                   as my_gmv,
    (select count(*) + 1 from per_creator pc, me where pc.gmv > me.gmv)    as my_rank;
$$;

-- The portal calls this with the service-role (admin) client; keep execute off anon.
grant execute on function public.get_creator_network_flex(text[], date, date) to authenticated, service_role;
