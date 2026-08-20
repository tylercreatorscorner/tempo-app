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
    select distinct mp.handle from public.managed_brand_handles mp
    where p_roster_slugs is null or mp.brand_slug = any(p_roster_slugs)
  ),
  posts as materialized (
    select vp.video_id, vp.post_date::date as posted,
           lower(btrim(regexp_replace(vp.creator_name, '^@', ''))) as handle
    from public.video_performance vp
    where vp.period_type = 'daily'
      and vp.video_id is not null and vp.video_id <> ''
      and vp.post_date is not null
      and (p_data_slugs is null or vp.brand = any(p_data_slugs))
      -- report_date is indexed and post_date is NOT. Filtering post_date alone
      -- took 5.6s against 0.5s for the sibling RPC. A video posted inside the
      -- window necessarily has stats rows on or after its post date, so this
      -- open-ended floor prunes the scan without dropping a single row the
      -- post_date filter would have kept — verified identical output (194/259).
      and vp.report_date >= least(p_prior_start, p_start)
      and vp.post_date::date between least(p_prior_start, p_start) and greatest(p_prior_end, p_end)
    group by 1, 2, 3
  ),
  ppl as materialized (
    select mc.id, lower(btrim(replace(h.handle, '@', ''))) as handle
    from public.managed_creators mc,
         lateral (values (mc.account_1),(mc.account_2),(mc.account_3),(mc.account_4),(mc.account_5),
                         (mc.account_6),(mc.account_7),(mc.account_8),(mc.account_9),(mc.account_10)) h(handle)
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and mc.employment_status = 'active'
      and h.handle is not null and btrim(h.handle) <> ''
  ),
  -- ONE pass over creator_performance for both windows. The per-creator LATERAL
  -- version of this timed out at 60s: 142 creators x 2 laterals over a 5.8M-row
  -- table is 284 scans of the same data.
  cp_agg as materialized (
    select lower(btrim(regexp_replace(cp.creator_name, '^@', ''))) as handle,
           coalesce(sum(cp.gmv) filter (where cp.report_date between p_start and p_end), 0)             as cur_gmv,
           coalesce(sum(cp.gmv) filter (where cp.report_date between p_prior_start and p_prior_end), 0) as pri_gmv
    from public.creator_performance cp
    where cp.period_type = 'daily'
      and (p_data_slugs is null or cp.brand = any(p_data_slugs))
      and cp.report_date between least(p_prior_start, p_start) and greatest(p_prior_end, p_end)
      and cp.creator_name is not null and btrim(cp.creator_name) <> ''
    group by 1
  ),
  post_agg as materialized (
    select handle,
           count(*) filter (where posted between p_start and p_end)             as cur_posts,
           count(*) filter (where posted between p_prior_start and p_prior_end) as pri_posts
    from posts group by handle
  ),
  -- ACTIVE = posted OR sold, at PERSON grain. Must match the creator table's
  -- "N posted or sold this period" exactly; two definitions of "active" on one
  -- report is the defect this pass exists to remove.
  act as materialized (
    select p.id,
           bool_or(coalesce(a.cur_gmv,0) > 0 or coalesce(pa.cur_posts,0) > 0) as active_cur,
           bool_or(coalesce(a.pri_gmv,0) > 0 or coalesce(pa.pri_posts,0) > 0) as active_prior
    from ppl p
    left join cp_agg   a  on a.handle  = p.handle
    left join post_agg pa on pa.handle = p.handle
    group by p.id
  )
  select jsonb_build_object(
    'signedPeople',      (select count(*) from act),
    'activePeople',      (select count(*) from act where active_cur),
    'activePeoplePrior', (select count(*) from act where active_prior),
    'newlyActivePeople', (select count(*) from act where active_cur and not active_prior),
    'rosterPosts',       (select count(*) from posts where handle in (select handle from mh) and posted between p_start and p_end),
    'rosterPostsPrior',  (select count(*) from posts where handle in (select handle from mh) and posted between p_prior_start and p_prior_end),
    'storePosts',        (select count(*) from posts where posted between p_start and p_end),
    'storePostsPrior',   (select count(*) from posts where posted between p_prior_start and p_prior_end)
  );
$function$;

-- A GRANT list that merely omits anon revokes NOTHING: EXECUTE defaults to
-- PUBLIC. Revoke explicitly, then grant only what should call it.
revoke all on function public.get_brand_client_report_counts(text[], text[], date, date, date, date)
  from public, anon, authenticated;
-- authenticated AND service_role, anon REVOKED — the same posture as
-- get_brand_report_extras. buildClientReportSnapshot runs on the COOKIE
-- client as the signed-in admin, so a service_role-only grant made this
-- permission-denied; the caller treats failure as non-fatal, so the
-- block silently never reached a single snapshot. A grant that is too
-- tight fails as quietly here as one that is too loose fails loudly.
grant execute on function public.get_brand_client_report_counts(text[], text[], date, date, date, date)
  to authenticated, service_role;
