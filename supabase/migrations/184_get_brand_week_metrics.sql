-- Everything the weekly manager form shows READ-ONLY, for one brand and week.
--
-- The manager types the judgement (win, challenge, next action, client health,
-- renewal risk). They never type GMV, managed GMV, capture rate or posts, which
-- is the entire point: capture rate is the metric the system rests on and the
-- one most easily got wrong by hand.
--
-- Membership rule is the same as get_brand_capture_rate and
-- get_brand_client_report_managed_split, so this form, the scorecard and the
-- client report cannot disagree.
--
-- WARNING: COVERAGE IS RETURNED, NOT HIDDEN. Rolling windows in Tempo end at
-- the last uploaded day, not calendar yesterday, and data currently runs three
-- days behind. A week graded on four uploaded days is not comparable to one
-- graded on seven, and quietly reporting the short number is how a brand looks
-- like it collapsed when really the files had not landed. The form shows
-- daysCovered and lastDayWithData so the manager sees it before submitting.
--
-- POSTS: roster_creator_daily.posts is keyed on the video's POST date (the
-- refresh full-outer-joins GMV-by-report_date against videos-by-post_date), so
-- summing it over the window gives videos PUBLISHED in the week, which is the
-- content-volume field. It is not the count of videos that merely earned.

create or replace function public.get_brand_week_metrics(
  p_brand_slug text,
  p_week_start date,
  p_week_end   date
) returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  with target as (
    select b.id, b.slug, coalesce(b.display_name, b.name) as label,
           case when b.is_umbrella
                then coalesce((select array_agg(c.slug) from public.brands_v2 c
                                where c.parent_brand_id = b.id
                                  and coalesce(c.is_archived,false) = false),
                              array[b.slug])
                else array[b.slug] end as data_slugs
    from public.brands_v2 b
    where b.slug = p_brand_slug and b.parent_brand_id is null
  ),
  prior as (
    select (p_week_start - 7)::date as ps, (p_week_end - 7)::date as pe
  ),
  src as (
    select mc.archived_at,
           lower(btrim(regexp_replace(h.handle, '^@', ''))) as handle
    from public.managed_creators mc
      cross join lateral (values
        (mc.account_1), (mc.account_2), (mc.account_3), (mc.account_4), (mc.account_5),
        (mc.account_6), (mc.account_7), (mc.account_8), (mc.account_9), (mc.account_10)
      ) h(handle)
    where mc.brand = p_brand_slug
      and h.handle is not null and btrim(h.handle) <> ''
    union all
    select mc.archived_at,
           lower(btrim(regexp_replace(t.tiktok_username, '^@', '')))
    from public.managed_creators mc
    join public.tiktok_accounts t on t.creator_id = mc.creator_id
    where mc.brand = p_brand_slug
      and mc.creator_id is not null
      and t.tiktok_username is not null and btrim(t.tiktok_username) <> ''
  ),
  mem as materialized (
    select handle,
           bool_or(archived_at is null) as ever_active,
           max(archived_at)::date       as archived_on
    from src group by 1
  ),
  rows_ as (
    select d.stat_date, d.gmv, coalesce(d.posts, 0) as posts,
           (d.stat_date between p_week_start and p_week_end) as in_cur,
           (d.stat_date between (select ps from prior) and (select pe from prior)) as in_pri,
           (m.handle is not null
             and (m.ever_active or m.archived_on > d.stat_date)) as is_managed
    from public.roster_creator_daily d
    join target t on d.brand_slug = any(t.data_slugs)
    left join mem m on m.handle = d.handle
    where d.stat_date between (select ps from prior) and p_week_end
  )
  select jsonb_build_object(
    'brand',      (select slug  from target),
    'brandLabel', (select label from target),
    'weekStart',  p_week_start,
    'weekEnd',    p_week_end,
    'current', jsonb_build_object(
      'brandGmv',   round(coalesce(sum(gmv) filter (where in_cur), 0), 2),
      'managedGmv', round(coalesce(sum(gmv) filter (where in_cur and is_managed), 0), 2),
      'capturePct', case when coalesce(sum(gmv) filter (where in_cur), 0) > 0
                         then round(100 * coalesce(sum(gmv) filter (where in_cur and is_managed), 0)
                                    / sum(gmv) filter (where in_cur), 2)
                         else null end,
      'posts',      coalesce(sum(posts) filter (where in_cur and is_managed), 0)::int
    ),
    'prior', jsonb_build_object(
      'brandGmv',   round(coalesce(sum(gmv) filter (where in_pri), 0), 2),
      'managedGmv', round(coalesce(sum(gmv) filter (where in_pri and is_managed), 0), 2),
      'capturePct', case when coalesce(sum(gmv) filter (where in_pri), 0) > 0
                         then round(100 * coalesce(sum(gmv) filter (where in_pri and is_managed), 0)
                                    / sum(gmv) filter (where in_pri), 2)
                         else null end,
      'posts',      coalesce(sum(posts) filter (where in_pri and is_managed), 0)::int
    ),
    'coverage', jsonb_build_object(
      -- Days of the 7 that carry ANY data for this brand.
      'daysCovered',     count(distinct stat_date) filter (where in_cur),
      'daysInWeek',      (p_week_end - p_week_start) + 1,
      'lastDayWithData', max(stat_date) filter (where in_cur),
      'priorDaysCovered', count(distinct stat_date) filter (where in_pri)
    )
  )
  from rows_;
$fn$;

revoke all on function public.get_brand_week_metrics(text, date, date) from public;
grant execute on function public.get_brand_week_metrics(text, date, date)
  to authenticated, service_role;

comment on function public.get_brand_week_metrics(text, date, date) is
  'Read-only figures for the weekly manager report: brand GMV, managed GMV, capture rate and posts '
  'published, for a week and the week before it, plus data coverage. Same membership rule as '
  'get_brand_capture_rate so the form, scorecard and client report agree. Coverage is returned so a '
  'part-uploaded week is visible rather than silently reported short.';
