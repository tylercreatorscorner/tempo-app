-- 146_brand_portal_video_engagement.sql
--
-- Per-video views/likes/comments for the brand portal's Videos page.
--
-- The sibling of get_brand_portal_engagement (migration 143), which fixed the
-- AGGREGATE panel. The per-video columns were left broken in that pass so the
-- three client-facing falsehoods could ship on their own, and were flagged in
-- brand-portal-overview.ts rather than quietly left at zero.
--
-- Same root cause: the page read videos.impressions/likes/comments, and those
-- columns stopped being populated when TikTok merged the Video List export
-- into Video Data around 2026-07-13. For lemme, 35% of videos had zero
-- impressions in May, 53% in June, 86% in July and 100% in August. Every
-- per-video number a brand saw was a zero with a real number behind it.
--
-- ── Aggregation ─────────────────────────────────────────────────────────────
--
-- MAX per (video_id, report_date), then SUM the days. NOT interchangeable with
-- SUM(views): one video can have several rows for a single day (one per
-- product tagged in the post), and summing rows multiplies its reach by the
-- product count.
--
-- ── Window ──────────────────────────────────────────────────────────────────
--
-- Filtered on report_date, i.e. engagement EARNED during the selected period,
-- because the Videos page is period-scoped and its GMV column is period GMV.
-- This differs from migration 143 deliberately: that one answers "reach of what
-- we published this period" and so filters on post_date. Do not "align" them —
-- they answer different questions and both are used.
--
-- SECURITY DEFINER: a brand-wide fact read over video_performance, where RLS
-- would otherwise be evaluated per scanned row.

create or replace function public.get_brand_portal_video_engagement(
  p_brand_slugs text[],
  p_handles     text[],
  p_start       date,
  p_end         date
)
returns table (
  video_id text,
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
      and vp.report_date >= p_start
      and vp.report_date <= p_end
      and lower(trim(regexp_replace(vp.creator_name, '^@', ''))) = any(p_handles)
    group by vp.video_id, vp.report_date
  )
  select video_id,
         coalesce(sum(day_views), 0)::bigint    as views,
         coalesce(sum(day_likes), 0)::bigint    as likes,
         coalesce(sum(day_comments), 0)::bigint as comments
  from per_video_day
  group by video_id;
$function$;

-- A GRANT list that merely omits anon revokes NOTHING: EXECUTE defaults to
-- PUBLIC. Revoke explicitly, then grant only what should call it.
revoke all on function public.get_brand_portal_video_engagement(text[], text[], date, date)
  from public, anon, authenticated;
grant execute on function public.get_brand_portal_video_engagement(text[], text[], date, date)
  to service_role;
