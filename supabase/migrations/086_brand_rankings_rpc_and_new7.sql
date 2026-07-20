-- Rankings page perf + Top Videos "New (7)" support.
--
-- 1) get_brand_rankings: the leaderboard with CURRENT and PRIOR-window ranks in
--    ONE round-trip. The TS version paginated the whole brand window TWICE
--    (current + prior ≈ 2 × 95 round-trips on LeeFar 30d) to rank client-side.
--    Rows beyond p_limit are still returned when they belong to the caller
--    (p_handles) so "me" always appears with a true rank.
-- 2) get_inspiration_videos gains p_posted_since (default null = no filter) so
--    the portal can show "posted in the last 7 days, by GMV". Postgres would
--    otherwise OVERLOAD on the new signature, so drop + recreate.

create or replace function public.get_brand_rankings(
  p_handles text[],
  p_brand_ids uuid[],
  p_start date,
  p_end date,
  p_prior_start date,
  p_prior_end date,
  p_limit int default 50
)
returns table(
  rank bigint,
  tiktok_username text,
  gmv numeric,
  orders numeric,
  videos bigint,
  prior_rank bigint,
  is_me boolean
)
language sql
stable
as $$
  with cur as (
    select lower(tiktok_username) as h,
           sum(gmv) as gmv,
           sum(orders) as orders,
           count(distinct video_id) as videos
    from daily_video_product_stats
    where report_date between p_start and p_end
      and (p_brand_ids is null or brand_id = any(p_brand_ids))
      and tiktok_username is not null and tiktok_username <> ''
    group by lower(tiktok_username)
    having sum(gmv) > 0
  ),
  ranked as (
    select h, gmv, orders, videos,
           row_number() over (order by gmv desc, h) as rk
    from cur
  ),
  prior as (
    select lower(tiktok_username) as h,
           row_number() over (order by sum(gmv) desc, lower(tiktok_username)) as rk
    from daily_video_product_stats
    where report_date between p_prior_start and p_prior_end
      and (p_brand_ids is null or brand_id = any(p_brand_ids))
      and tiktok_username is not null and tiktok_username <> ''
    group by lower(tiktok_username)
    having sum(gmv) > 0
  )
  select r.rk, r.h, r.gmv, r.orders, r.videos, p.rk,
         r.h = any (select lower(x) from unnest(p_handles) x) as is_me
  from ranked r
  left join prior p on p.h = r.h
  where r.rk <= p_limit
     or r.h = any (select lower(x) from unnest(p_handles) x)
  order by r.rk;
$$;

drop function if exists public.get_inspiration_videos(uuid[], date, date, int);

create or replace function public.get_inspiration_videos(
  p_brand_ids uuid[],
  p_start date,
  p_end date,
  p_limit int default 24,
  p_posted_since date default null
)
returns table(
  video_id text,
  video_title text,
  video_url text,
  post_date text,
  tiktok_username text,
  brand_id text,
  gmv numeric,
  orders numeric,
  items_sold numeric,
  commission numeric,
  days_active bigint,
  top_product text
)
language sql
stable
as $$
  with agg as (
    select
      d.video_id,
      max(d.video_title) as video_title,
      max(d.video_url) as video_url,
      max(d.post_date::text) as post_date,
      max(d.tiktok_username) as tiktok_username,
      max(d.brand_id::text) as brand_id,
      sum(d.gmv) as gmv,
      sum(d.orders) as orders,
      sum(d.items_sold) as items_sold,
      sum(d.est_commission) as commission,
      count(distinct d.report_date) as days_active
    from daily_video_product_stats d
    where d.report_date between p_start and p_end
      and (p_brand_ids is null or d.brand_id = any(p_brand_ids))
      and d.video_id is not null
      and (p_posted_since is null or d.post_date >= p_posted_since)
    group by d.video_id
    order by sum(d.gmv) desc
    limit p_limit
  ),
  prod as (
    select video_id, product_name, row_number() over (
      partition by video_id order by sum(gmv) desc
    ) as rn
    from daily_video_product_stats d
    where d.report_date between p_start and p_end
      and (p_brand_ids is null or d.brand_id = any(p_brand_ids))
      and d.video_id in (select a.video_id from agg a)
      and d.product_name is not null
    group by video_id, product_name
  )
  select
    a.video_id, a.video_title, a.video_url, a.post_date, a.tiktok_username,
    a.brand_id, a.gmv, a.orders, a.items_sold, a.commission, a.days_active,
    p.product_name
  from agg a
  left join prod p on p.video_id = a.video_id and p.rn = 1
  order by a.gmv desc;
$$;

grant execute on function public.get_brand_rankings(text[], uuid[], date, date, date, date, int) to authenticated, service_role;
grant execute on function public.get_inspiration_videos(uuid[], date, date, int, date) to authenticated, service_role;
