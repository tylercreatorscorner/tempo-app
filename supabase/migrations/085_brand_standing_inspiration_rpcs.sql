-- Kill the creator-portal Home's two brand-wide paginated scans (~95 round-trips
-- EACH on LeeFar 30d: 94k daily_video_product_stats rows paged 1000 at a time).
-- Both become single-round-trip SQL aggregations. Count round-trips, not SQL.
--
-- get_brand_standing: brand totals (gmv/orders/creators/posts) + the creator's
--   per-handle rank + the neighbours one rung up/down. Semantics match the TS
--   version it replaces: creators ranked per handle; "me" = my best handle.
-- get_inspiration_videos: network top videos by GMV for a brand window with
--   per-video totals + the top product, replacing the full-scan-then-aggregate.
--
-- p_brand_ids: NULL = no brand filter (all brands); '{}' matches nothing (the
-- known-but-unresolvable-brand case) — mirrors the TS brandFilter contract.

create or replace function public.get_brand_standing(
  p_handles text[],
  p_brand_ids uuid[],
  p_start date,
  p_end date
)
returns table(
  brand_gmv numeric,
  brand_orders numeric,
  creator_count bigint,
  post_count bigint,
  my_rank bigint,
  my_gmv numeric,
  above_handle text,
  above_gmv numeric,
  below_handle text,
  below_gmv numeric
)
language sql
stable
as $$
  with per as (
    select lower(tiktok_username) as h, sum(gmv) as gmv, sum(orders) as orders
    from daily_video_product_stats
    where report_date between p_start and p_end
      and (p_brand_ids is null or brand_id = any(p_brand_ids))
      and tiktok_username is not null and tiktok_username <> ''
    group by lower(tiktok_username)
    having sum(gmv) > 0
  ),
  ranked as (
    select h, gmv, row_number() over (order by gmv desc, h) as rk from per
  ),
  me as (
    select h, gmv, rk from ranked
    where h = any (select lower(x) from unnest(p_handles) x)
    order by rk
    limit 1
  )
  select
    (select coalesce(sum(gmv), 0) from per),
    (select coalesce(sum(orders), 0) from per),
    (select count(*) from per),
    (select count(distinct video_id) from daily_video_product_stats
      where report_date between p_start and p_end
        and (p_brand_ids is null or brand_id = any(p_brand_ids))
        and video_id is not null),
    (select rk from me),
    (select gmv from me),
    (select h from ranked where rk = (select rk - 1 from me)),
    (select gmv from ranked where rk = (select rk - 1 from me)),
    (select h from ranked where rk = (select rk + 1 from me)),
    (select gmv from ranked where rk = (select rk + 1 from me));
$$;

create or replace function public.get_inspiration_videos(
  p_brand_ids uuid[],
  p_start date,
  p_end date,
  p_limit int default 24
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

grant execute on function public.get_brand_standing(text[], uuid[], date, date) to authenticated, service_role;
grant execute on function public.get_inspiration_videos(uuid[], date, date, int) to authenticated, service_role;
