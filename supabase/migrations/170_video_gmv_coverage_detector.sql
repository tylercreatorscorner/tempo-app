-- 170 · Coverage ledger: catch a video file that arrived the right SIZE and the
-- wrong AMOUNT.
--
-- The ledger judges every cell by ROW COUNT. That structurally cannot see
-- catakor 2026-07-27: 7,817 rows against a normal 7,788-9,957 and 2,233
-- creators against a normal ~2,200, so every count-based detector called it
-- green. But only 88 of its videos carried GMV against 176-271 on neighbouring
-- days, at $30.15 average against $72-79, and the day totalled $2,653.12
-- against the $13,078.37 catakor's OWN creator file reported for it. A partial
-- capture wearing a full-looking row count.
--
-- creator_performance.video_gmv and video_performance.gmv are two independent
-- TikTok exports of the same fact. On a healthy brand-day they agree TO THE
-- CENT, which makes the cross-check exact rather than heuristic.
--
-- MEASURED over 549 brand-days, 2026-07-24..08-26, every day with >$500 of
-- creator-file video GMV:
--
--     within 0.5% of exact   542 of 549   (98.7%)
--     1st percentile          99.3%
--     median                 100.0%
--     max                    102.2%
--     below 90%                2 days  <- catakor 07-27 (20.3%), jiyu 08-22 (0%)
--     below 50%                the same 2
--
-- Nothing legitimate sits between 20.3% and 99.3%. The 90% floor applied in
-- upload-coverage.ts separates the two real failures from 547 healthy days with
-- the entire gap to spare.
--
-- ⚠️ Only valid from ~2026-07-24. video_gmv / live_gmv / product_card_gmv were
-- not populated before then, so earlier days read 0 on the creator side and
-- would ALL look broken. The p_min_gmv floor excludes them naturally, since a
-- day with no creator-file video GMV is never judged.
create or replace function public.get_video_gmv_coverage(
  p_brands  text[],
  p_start   date,
  p_end     date,
  p_min_gmv numeric default 500
)
returns table(
  brand_slug        text,
  report_date       date,
  video_file_gmv    numeric,
  creator_file_gmv  numeric,
  pct_of_expected   numeric
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '60s'
as $function$
  with cp as (
    select cp.brand as b, cp.report_date::date as d,
           sum(coalesce(cp.video_gmv, 0))::numeric as v
    from public.creator_performance cp
    where cp.period_type = 'daily'
      and cp.report_date between p_start and p_end
      and (p_brands is null or cp.brand = any(p_brands))
    group by 1, 2
  ),
  vp as (
    select vp.brand as b, vp.report_date::date as d,
           sum(coalesce(vp.gmv, 0))::numeric as v
    from public.video_performance vp
    where vp.period_type = 'daily'
      and vp.report_date between p_start and p_end
      and (p_brands is null or vp.brand = any(p_brands))
    group by 1, 2
  )
  select cp.b, cp.d,
         coalesce(vp.v, 0)::numeric,
         cp.v::numeric,
         round(100.0 * coalesce(vp.v, 0) / nullif(cp.v, 0), 1)::numeric
  from cp left join vp on vp.b = cp.b and vp.d = cp.d
  -- Double duty: skips quiet days where a few dollars of rounding would swamp
  -- the ratio, AND skips every day before video_gmv existed.
  where cp.v > coalesce(p_min_gmv, 500);
$function$;

revoke execute on function public.get_video_gmv_coverage(text[], date, date, numeric) from public;
revoke execute on function public.get_video_gmv_coverage(text[], date, date, numeric) from anon;
grant  execute on function public.get_video_gmv_coverage(text[], date, date, numeric) to authenticated, service_role;

comment on function public.get_video_gmv_coverage(text[], date, date, numeric) is
  'Cross-checks creator_performance.video_gmv against video_performance.gmv per brand-day. Two '
  'independent exports of the same fact; they agree TO THE CENT on a healthy day (542 of 549 within '
  '0.5%). Catches a video file with the right ROW COUNT and the wrong money, which the coverage '
  'ledger''s row-count detectors structurally cannot see. Valid only from ~2026-07-24.';
