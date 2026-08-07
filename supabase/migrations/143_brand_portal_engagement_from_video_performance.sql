-- 143_brand_portal_engagement_from_video_performance.sql
--
-- The brand portal's "Reach & engagement" panel reported ZERO to a paying
-- client while the real numbers existed. Found live on Lemme 2026-08-06.
--
-- ── What the client saw ────────────────────────────────────────────────────
--
--   VIEWS 0 · LIKES 0 · COMMENTS 0 · ENGAGEMENT 0.0% · "-100% vs prior"
--
-- against actuals, measured through this function, of 199,908 views, 1,774
-- likes and 80 comments across 240 posts. Worse than a blank: the panel
-- editorialised the zero into "-100% vs prior", telling a client their reach
-- had collapsed to nothing, while the card directly beneath it said
-- "MOST VIRAL POST · 4.9k views".
--
-- (A naive SUM(views) over the same window returns 16.8M. That number is
-- wrong and is exactly the trap this function's aggregation avoids: it counts
-- every daily snapshot row of every video that was merely ACTIVE in the
-- window, including posts published months earlier, and multiplies each by its
-- product-row count. The honest figure for "reach of what we published this
-- period" is two orders of magnitude smaller.)
--
-- ── Why ────────────────────────────────────────────────────────────────────
--
-- brand-portal-overview.ts read engagement from `videos` (impressions, likes,
-- comments). That column set stopped being populated when TikTok merged the
-- Video List export into Video Data around 2026-07-13: the file that used to
-- feed `videos` now lands in `video_performance` (see migration 088). The
-- panel decayed rather than broke, which is why nobody caught it:
--
--     month     videos   sum(impressions)   zero-impression rows
--     2026-05    8,645            164,365                   35%
--     2026-06   11,019            336,727                   53%
--     2026-07   24,781            561,735                   86%
--     2026-08    1,524                  0                  100%
--
-- ── The aggregation ────────────────────────────────────────────────────────
--
-- MAX per (video_id, report_date), then SUM the days. This is the same shape
-- migrations 088/090/094 use and it is NOT interchangeable with SUM(views):
-- a video can have several rows for one day (multiple products on the same
-- post), and summing rows multiplies its reach by the product count.
--
-- Window semantics preserve what the old code meant: videos POSTED inside the
-- window, counting all engagement those posts have accumulated. Both the
-- current and prior period use the identical rule so the comparison is fair.
--
-- SECURITY DEFINER because this is a brand-wide fact read over
-- video_performance, where RLS would otherwise be evaluated per scanned row.

create or replace function public.get_brand_portal_engagement(
  p_brand_slugs text[],
  p_handles     text[],
  p_start       date,
  p_end         date
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
    where vp.brand = any(p_brand_slugs)
      and vp.period_type = 'daily'
      and vp.video_id is not null
      and vp.video_id <> ''
      and vp.post_date >= p_start
      and vp.post_date <= p_end
      and lower(trim(regexp_replace(vp.creator_name, '^@', ''))) = any(p_handles)
    group by vp.video_id, vp.report_date
  )
  select
    count(distinct video_id)::integer          as posts,
    coalesce(sum(day_views), 0)::bigint        as views,
    coalesce(sum(day_likes), 0)::bigint        as likes,
    coalesce(sum(day_comments), 0)::bigint     as comments
  from per_video_day;
$function$;

-- A GRANT list that merely omits anon revokes NOTHING: EXECUTE defaults to
-- PUBLIC. Revoke explicitly, then grant only what should call it.
revoke all on function public.get_brand_portal_engagement(text[], text[], date, date)
  from public, anon, authenticated;
grant execute on function public.get_brand_portal_engagement(text[], text[], date, date)
  to service_role;
