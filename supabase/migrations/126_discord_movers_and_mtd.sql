-- 126_discord_movers_and_mtd.sql
--
-- Two new Discord post formats: BIGGEST MOVERS and MONTH-TO-DATE LEADERBOARD.
--
-- WHY THESE TWO. What's Cooking and Who's Cooking both rank by absolute GMV, so
-- the same ten creators win every week and the drop goes stale by construction.
-- Variety has to come from changing the RANKING FUNCTION, not the wording:
--   · Movers ranks by GROWTH, so mid-roster creators can top it.
--   · MTD ranks over the calendar month, so the board changes shape as the
--     month runs and there is still time to act on it.
--
-- Both mirror whos_cooking_agg_v2 (mig 099): same source table, same brand_id
-- scoping, aggregation in Postgres rather than shipping creator-day rows to the
-- app, which is what made the all-brands/umbrella selection time out before.

-- ── Biggest Movers ──────────────────────────────────────────────────────────
--
-- THE SMALL-DENOMINATOR TRAP is the whole design problem here. Percentage
-- growth on a tiny base is meaningless: $5 -> $50 is +900% and beats a creator
-- who went $4,000 -> $11,000. A leaderboard topped by noise teaches people to
-- ignore it, so both ends are floored:
--   p_min_prior   the creator must have been doing real volume BEFORE
--   p_min_current the creator must be doing real volume NOW
--
-- Creators with no prior GMV at all are deliberately EXCLUDED rather than given
-- an infinite score — a first-week creator is a Rookie, which is its own format
-- (get_roster_rookie, mig 097). Mixing them in would let Movers be won by
-- someone who simply did not exist last week, every single week.
create or replace function public.get_creator_movers(
  p_brand_ids     uuid[],
  p_current_start date,
  p_end           date,
  p_prior_start   date,
  p_prior_end     date,
  p_min_prior     numeric default 250,
  p_min_current   numeric default 500,
  p_limit         integer default 10
)
returns json
language sql
stable
security definer
set search_path to 'public'
as $function$
  with cur as (
    select lower(replace(tiktok_username, '@', '')) as handle,
           max(tiktok_username) as tiktok_username,
           sum(gmv) as gmv, sum(videos) as videos,
           count(distinct report_date) as days_posted
    from daily_creator_stats
    where report_date >= p_current_start and report_date <= p_end
      and (p_brand_ids is null or brand_id = any(p_brand_ids))
    group by 1
  ),
  pri as (
    -- Half-open [p_prior_start, p_prior_end), matching whos_cooking_agg_v2 so
    -- the two formats never disagree about which days the prior window holds.
    select lower(replace(tiktok_username, '@', '')) as handle, sum(gmv) as prior_gmv
    from daily_creator_stats
    where report_date >= p_prior_start and report_date < p_prior_end
      and (p_brand_ids is null or brand_id = any(p_brand_ids))
    group by 1
  ),
  joined as (
    select c.handle, c.tiktok_username, c.gmv, c.videos, c.days_posted,
           coalesce(p.prior_gmv, 0) as prior_gmv,
           c.gmv - coalesce(p.prior_gmv, 0) as delta,
           ((c.gmv - p.prior_gmv) / p.prior_gmv * 100) as growth_pct
    from cur c
    join pri p on p.handle = c.handle          -- INNER: no prior, not a mover
    where p.prior_gmv >= p_min_prior
      and c.gmv       >= p_min_current
      and c.gmv       >  p.prior_gmv           -- only movement UP
  )
  select json_build_object(
    'movers', coalesce((select json_agg(m) from (
        select tiktok_username, gmv, videos, days_posted as "daysPosted",
               prior_gmv as "priorGmv", delta, growth_pct as "growthPct"
        from joined order by growth_pct desc, gmv desc limit p_limit) m), '[]'::json),
    'eligibleCount', (select count(*) from joined),
    'poolCount',     (select count(*) from cur where gmv > 0)
  );
$function$;

-- ── Month-to-date leaderboard ───────────────────────────────────────────────
--
-- Movement is measured against THE SAME POINT in the previous month, not the
-- previous month's total — comparing day 12 against a finished 31-day month
-- would show everyone collapsing. The caller passes the matching prior window.
create or replace function public.get_creator_mtd(
  p_brand_ids       uuid[],
  p_month_start     date,
  p_end             date,
  p_prev_start      date,
  p_prev_end        date,
  p_limit           integer default 10
)
returns json
language sql
stable
security definer
set search_path to 'public'
as $function$
  with cur as (
    select lower(replace(tiktok_username, '@', '')) as handle,
           max(tiktok_username) as tiktok_username,
           sum(gmv) as gmv, sum(orders) as orders, sum(videos) as videos,
           count(distinct report_date) as days_posted
    from daily_creator_stats
    where report_date >= p_month_start and report_date <= p_end
      and (p_brand_ids is null or brand_id = any(p_brand_ids))
    group by 1
    having sum(gmv) > 0
  ),
  prev as (
    select lower(replace(tiktok_username, '@', '')) as handle, sum(gmv) as gmv
    from daily_creator_stats
    where report_date >= p_prev_start and report_date <= p_prev_end
      and (p_brand_ids is null or brand_id = any(p_brand_ids))
    group by 1
    having sum(gmv) > 0
  ),
  cur_ranked  as (select *, row_number() over (order by gmv desc, handle) rn from cur),
  prev_ranked as (select handle, row_number() over (order by gmv desc, handle) rn from prev)
  select json_build_object(
    'leaderboard', coalesce((select json_agg(l) from (
        select c.tiktok_username, c.gmv, c.orders, c.videos,
               c.days_posted as "daysPosted", c.rn as rank,
               p.rn as "prevRank",
               case when p.rn is null then null else (p.rn - c.rn) end as "rankDelta"
        from cur_ranked c left join prev_ranked p on p.handle = c.handle
        where c.rn <= p_limit order by c.rn) l), '[]'::json),
    'totalGmv',     coalesce((select sum(gmv) from cur), 0),
    'creatorCount', (select count(*) from cur),
    'videoCount',   coalesce((select sum(videos) from cur), 0),
    'prevGmv',      coalesce((select sum(gmv) from prev), 0)
  );
$function$;

-- A GRANT list that merely omits anon revokes NOTHING — EXECUTE defaults to
-- PUBLIC. Revoke explicitly, then grant only the roles that should call these.
-- The cron path (run-schedules) runs as service_role with no session.
revoke all on function public.get_creator_movers(uuid[], date, date, date, date, numeric, numeric, integer)
  from public, anon, authenticated;
revoke all on function public.get_creator_mtd(uuid[], date, date, date, date, integer)
  from public, anon, authenticated;
grant execute on function public.get_creator_movers(uuid[], date, date, date, date, numeric, numeric, integer)
  to service_role;
grant execute on function public.get_creator_mtd(uuid[], date, date, date, date, integer)
  to service_role;
