-- Make the creator profile's Views, Engagement and Top Content respect the
-- brand selector.
--
-- Reported by the VA doing roster data entry: on the admin creator profile,
-- switching the brand selector left some figures unchanged, so a creator who
-- works several brands "mirrored information from one brand to another". She
-- stopped adding multi-brand creators because of it, which was the right call.
--
-- Cause: get_creator_engagement and get_creator_top_content took no brand
-- argument at all, so the page could not scope them even though it scopes
-- getCreatorSummary, getCreatorAccountBreakdown and getCreatorVideos beside
-- them. Six figures sat in one metric rail, four of them brand-scoped and two
-- of them not.
--
-- Scale of the error, measured on skozdeals (16 brands, 2026-08-01..27): the
-- page reported 106,821 views under EVERY brand. Actual: Kitsch 68,741,
-- Dr. Dent 5,431, Bondie 41, Neurogum 0. For Dr. Dent, the brand that prompted
-- the question, Views read about 20x high.
--
-- p_brand_slugs is an ARRAY because a brand may be an umbrella: the caller
-- passes expandSlugs(), so filtering to `leefar` matches its store slugs.
-- NULL means no filter, which preserves the unscoped "all brands" view.
--
-- WARNING: both sides of get_creator_top_content must be filtered. `eng` (from
-- video_performance) drives the row set and `money` (daily_video_product_stats)
-- is LEFT JOINed onto it; filtering only `money` would leave other brands'
-- videos on the list with their money blanked out, which looks like a data bug
-- rather than a filter.
--
-- Still intentionally cross-brand on that page, and NOT bugs: the "where the
-- effort goes" table (its whole job is comparing brands) and the Lifetime
-- footer (labelled lifetime).

drop function if exists public.get_creator_engagement(text[], date, date);
drop function if exists public.get_creator_top_content(text[], date, date, integer);

create function public.get_creator_engagement(
  p_handles      text[],
  p_start        date,
  p_end          date,
  p_brand_slugs  text[] default null
)
returns table(posts integer, views bigint, likes bigint, comments bigint)
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
      and (p_brand_slugs is null or vp.brand = any(p_brand_slugs))
    group by vp.video_id, vp.report_date
  )
  select count(distinct video_id)::integer      as posts,
         coalesce(sum(day_views), 0)::bigint    as views,
         coalesce(sum(day_likes), 0)::bigint    as likes,
         coalesce(sum(day_comments), 0)::bigint as comments
  from per_video_day;
$function$;

create function public.get_creator_top_content(
  p_handles      text[],
  p_start        date,
  p_end          date,
  p_limit        integer default 10,
  p_brand_slugs  text[] default null
)
returns table(video_id text, video_title text, brand_slug text, post_date date,
              views bigint, likes bigint, gmv numeric)
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
      -- Filters the ROW SET, not just the money. See the header note.
      and (p_brand_slugs is null or vp.brand = any(p_brand_slugs))
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
      and (p_brand_slugs is null or b.slug = any(p_brand_slugs))
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

-- EXECUTE defaults to PUBLIC, so the recreated functions must be re-locked.
revoke all on function public.get_creator_engagement(text[], date, date, text[]) from public;
revoke all on function public.get_creator_top_content(text[], date, date, integer, text[]) from public;
grant execute on function public.get_creator_engagement(text[], date, date, text[])
  to authenticated, service_role;
grant execute on function public.get_creator_top_content(text[], date, date, integer, text[])
  to authenticated, service_role;
