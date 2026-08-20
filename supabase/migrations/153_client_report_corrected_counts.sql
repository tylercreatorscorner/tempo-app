-- 153_client_report_corrected_counts.sql
--
-- Two corrected counts for the client report. Both fix figures a brand has
-- already been shown.
--
-- ── 1. "Signed creators" was counting TikTok ACCOUNTS, not people ──────────
--
-- get_brand_client_report_agg emits
--     'signed_creator_count', (SELECT COUNT(*) FROM mh)
-- where `mh` is DISTINCT handles from managed_brand_handles. Lemme has 142
-- people holding 220 handles — 51 of them run two or more accounts — so the
-- report told the brand it had 218 signed creators when it had 142. A 54%
-- overstatement of roster size, and the activation rate divides by it.
--
-- People is the honest unit: a brand signs a person, not a username.
--
-- ── 2. Posts published was undercounting by ~18% ───────────────────────────
--
-- The same function derives posts from SUM(creator_performance.videos), a
-- creator-grain daily rollup. Measured on Lemme for 2026-08-02..08:
--
--     SUM(creator_performance.videos)                     159
--     SUM(daily_creator_stats.videos)                     159   (fed from it)
--     COUNT(DISTINCT video_id) by post_date, video_perf   194
--     COUNT(DISTINCT video_id) by post_date, dvps         194
--
-- Two independent video-level sources agree on 194 while the rollup says 159.
-- Counting distinct videos at video grain is the measure that can be checked
-- against the brand's own TikTok Shop export, so that is what the report uses.
--
-- ⚠️ Deliberately NOT patched into get_brand_client_report_agg. That function
-- is on the invoice/earnings money path, is 8kB of interlocking CTEs, and
-- carries inline `--` comments that a string-level edit would mangle. The
-- caller overrides the four affected fields with these values instead, which
-- keeps the correction in one reviewable place.
--
-- Prior-window figures are returned so the period-over-period deltas move on
-- the SAME basis as the current ones. Correcting only the current side would
-- have produced a fake +22% jump the first week it shipped.

create or replace function public.get_brand_client_report_counts(
  p_data_slugs   text[],
  p_roster_slugs text[],
  p_start        date,
  p_end          date,
  p_prior_start  date,
  p_prior_end    date
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '60s'
as $function$
  with mh as materialized (
    select distinct mp.handle
    from public.managed_brand_handles mp
    where p_roster_slugs is null or mp.brand_slug = any(p_roster_slugs)
  ),
  posts as materialized (
    select vp.video_id,
           vp.post_date::date as posted,
           (lower(btrim(regexp_replace(vp.creator_name, '^@', ''))) in (select handle from mh)) as is_managed
    from public.video_performance vp
    where vp.period_type = 'daily'
      and vp.video_id is not null and vp.video_id <> ''
      and vp.post_date is not null
      and (p_data_slugs is null or vp.brand = any(p_data_slugs))
      and vp.post_date::date between least(p_prior_start, p_start) and greatest(p_prior_end, p_end)
    group by 1, 2, 3
  ),
  -- Active = a signed PERSON who recorded GMV in the window, collapsed from
  -- handle grain so someone running three accounts counts once.
  act as materialized (
    select mc.id,
           bool_or(cur.gmv > 0)   as active_cur,
           bool_or(pri.gmv > 0)   as active_prior
    from public.managed_creators mc
    left join lateral (
      select coalesce(sum(cp.gmv), 0) as gmv
      from public.creator_performance cp
      where cp.period_type = 'daily'
        and cp.report_date between p_start and p_end
        and (p_data_slugs is null or cp.brand = any(p_data_slugs))
        and lower(btrim(regexp_replace(cp.creator_name, '^@', ''))) = any(array_remove(array[
              lower(btrim(replace(mc.account_1 ,'@',''))), lower(btrim(replace(mc.account_2 ,'@',''))),
              lower(btrim(replace(mc.account_3 ,'@',''))), lower(btrim(replace(mc.account_4 ,'@',''))),
              lower(btrim(replace(mc.account_5 ,'@',''))), lower(btrim(replace(mc.account_6 ,'@',''))),
              lower(btrim(replace(mc.account_7 ,'@',''))), lower(btrim(replace(mc.account_8 ,'@',''))),
              lower(btrim(replace(mc.account_9 ,'@',''))), lower(btrim(replace(mc.account_10,'@','')))
            ], null))
    ) cur on true
    left join lateral (
      select coalesce(sum(cp.gmv), 0) as gmv
      from public.creator_performance cp
      where cp.period_type = 'daily'
        and cp.report_date between p_prior_start and p_prior_end
        and (p_data_slugs is null or cp.brand = any(p_data_slugs))
        and lower(btrim(regexp_replace(cp.creator_name, '^@', ''))) = any(array_remove(array[
              lower(btrim(replace(mc.account_1 ,'@',''))), lower(btrim(replace(mc.account_2 ,'@',''))),
              lower(btrim(replace(mc.account_3 ,'@',''))), lower(btrim(replace(mc.account_4 ,'@',''))),
              lower(btrim(replace(mc.account_5 ,'@',''))), lower(btrim(replace(mc.account_6 ,'@',''))),
              lower(btrim(replace(mc.account_7 ,'@',''))), lower(btrim(replace(mc.account_8 ,'@',''))),
              lower(btrim(replace(mc.account_9 ,'@',''))), lower(btrim(replace(mc.account_10,'@','')))
            ], null))
    ) pri on true
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and mc.employment_status = 'active'
    group by mc.id
  )
  select jsonb_build_object(
    'signedPeople',       (select count(*) from act),
    'activePeople',       (select count(*) from act where active_cur),
    'activePeoplePrior',  (select count(*) from act where active_prior),
    'rosterPosts',        (select count(*) from posts where is_managed and posted between p_start and p_end),
    'rosterPostsPrior',   (select count(*) from posts where is_managed and posted between p_prior_start and p_prior_end),
    'storePosts',         (select count(*) from posts where posted between p_start and p_end),
    'storePostsPrior',    (select count(*) from posts where posted between p_prior_start and p_prior_end)
  );
$function$;

-- A GRANT list that merely omits anon revokes NOTHING: EXECUTE defaults to
-- PUBLIC. Revoke explicitly, then grant only what should call it.
revoke all on function public.get_brand_client_report_counts(text[], text[], date, date, date, date)
  from public, anon, authenticated;
grant execute on function public.get_brand_client_report_counts(text[], text[], date, date, date, date)
  to service_role;
