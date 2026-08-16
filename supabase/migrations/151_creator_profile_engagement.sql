-- 151_creator_profile_engagement.sql
--
-- Views / likes / comments for the ADMIN creator profile, plus its content table.
--
-- The admin creator profile has never shown engagement. It has been ingested
-- since migration 088 and the page still reads GMV, orders, items, videos and
-- commission — five money-shaped numbers and nothing about reach. For a
-- content coach that is the wrong half of the picture: the conversation is
-- "this hook did 7.6M views", and the page could not say it.
--
-- Two functions because they answer at different grains and the aggregate must
-- not be computed from the truncated top-N list.
--
-- ── Aggregation ─────────────────────────────────────────────────────────────
--
-- MAX per (video_id, report_date), then SUM the days. NOT interchangeable with
-- SUM(views): one video can have several rows for a single day (one per product
-- tagged in the post), and summing rows multiplies its reach by the product
-- count. Same rule as migrations 143 and 146.
--
-- ── Window ──────────────────────────────────────────────────────────────────
--
-- Filtered on report_date — engagement EARNED in the selected period — because
-- the profile's other figures are period figures. This matches migration 146
-- (per-video, brand portal) and deliberately differs from 143, which answers
-- "reach of what we published" and so filters on post_date.
--
-- SECURITY DEFINER: a multi-handle fact read over video_performance, where RLS
-- would otherwise be evaluated per scanned row.

create or replace function public.get_creator_engagement(
  p_handles text[],
  p_start   date,
  p_end     date
)
returns table (
  posts    integer,
  views    bigint,
  likes    bigint,
  comments bigint
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with per_video_day as (
    select vp.video_id,
           vp.report_date,
           max(vp.views)    as day_views,
           max(vp.likes)    as day_likes,
           max(vp.comments) as day_comments
    from public.video_performance vp
    where vp.period_type = 'daily'
      and vp.video_id is not null
      and vp.video_id <> ''
      and vp.report_date >= p_start
      and vp.report_date <= p_end
      and lower(trim(regexp_replace(vp.creator_name, '^@', ''))) = any(p_handles)
    group by vp.video_id, vp.report_date
  )
  select count(distinct video_id)::integer      as posts,
         coalesce(sum(day_views), 0)::bigint    as views,
         coalesce(sum(day_likes), 0)::bigint    as likes,
         coalesce(sum(day_comments), 0)::bigint as comments
  from per_video_day;
$function$;

-- Per-video rows for the "content that worked" table: engagement joined to the
-- GMV the post took in the same window. Ordered by VIEWS, not GMV — a coach is
-- looking for the hook that landed, and the two rank differently often enough
-- to matter (one Akiek post: 7.6M views / $31k, another: 921k views / $37k).
create or replace function public.get_creator_top_content(
  p_handles text[],
  p_start   date,
  p_end     date,
  p_limit   integer default 10
)
returns table (
  video_id    text,
  video_title text,
  brand_slug  text,
  post_date   date,
  views       bigint,
  likes       bigint,
  gmv         numeric
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with per_video_day as (
    select vp.video_id, vp.report_date,
           max(vp.views) as day_views, max(vp.likes) as day_likes
    from public.video_performance vp
    where vp.period_type = 'daily'
      and vp.video_id is not null and vp.video_id <> ''
      and vp.report_date between p_start and p_end
      and lower(trim(regexp_replace(vp.creator_name, '^@', ''))) = any(p_handles)
    group by vp.video_id, vp.report_date
  ),
  eng as (
    select video_id,
           sum(day_views)::bigint as views,
           sum(day_likes)::bigint as likes
    from per_video_day
    group by video_id
  ),
  money as (
    select dv.video_id,
           max(dv.video_title)              as video_title,
           max(b.slug)                      as brand_slug,
           min(dv.post_date)::date          as post_date,
           coalesce(sum(dv.gmv), 0)::numeric as gmv
    from public.daily_video_product_stats dv
    left join public.brands_v2 b on b.id = dv.brand_id
    where dv.report_date between p_start and p_end
      and lower(trim(replace(dv.tiktok_username, '@', ''))) = any(p_handles)
    group by dv.video_id
  )
  select e.video_id,
         coalesce(m.video_title, '(untitled)') as video_title,
         m.brand_slug,
         m.post_date,
         e.views,
         e.likes,
         coalesce(m.gmv, 0)::numeric as gmv
  from eng e
  left join money m on m.video_id = e.video_id
  order by e.views desc
  limit greatest(coalesce(p_limit, 10), 1);
$function$;

-- A GRANT list that merely omits anon revokes NOTHING: EXECUTE defaults to
-- PUBLIC. Revoke explicitly, then grant only what should call it.
revoke all on function public.get_creator_engagement(text[], date, date)
  from public, anon, authenticated;
grant execute on function public.get_creator_engagement(text[], date, date)
  to service_role, authenticated;

revoke all on function public.get_creator_top_content(text[], date, date, integer)
  from public, anon, authenticated;
grant execute on function public.get_creator_top_content(text[], date, date, integer)
  to service_role, authenticated;
