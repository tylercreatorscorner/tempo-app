-- daily_video_product_stats.video_url is a tiktokcdn-us.com MEDIA-FILE url —
-- not a watch URL. It can't be oEmbed-resolved (no thumbnails) and is the wrong
-- thing to link a creator to. The real watch URL is videos.video_link
-- (https://www.tiktok.com/@user/video/<id>, verified 100% populated).
-- get_inspiration_videos now joins videos and returns the WATCH url as
-- video_url (null when the videos row is missing — callers render no link).

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
  watch as (
    select v.video_id, max(v.video_link) as video_link
    from videos v
    where v.video_id in (select a.video_id from agg a)
      and v.video_link ilike '%tiktok.com%'
    group by v.video_id
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
    a.video_id, a.video_title, w.video_link, a.post_date, a.tiktok_username,
    a.brand_id, a.gmv, a.orders, a.items_sold, a.commission, a.days_active,
    p.product_name
  from agg a
  left join watch w on w.video_id = a.video_id
  left join prod p on p.video_id = a.video_id and p.rn = 1
  order by a.gmv desc;
$$;

grant execute on function public.get_inspiration_videos(uuid[], date, date, int, date) to authenticated, service_role;
