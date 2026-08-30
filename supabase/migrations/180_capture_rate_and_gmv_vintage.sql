-- Capture rate and the content-vintage breakout, as ONE shared definition.
--
-- CAPTURE RATE = managed GMV / brand total GMV. The metric the whole Director
-- of Brands system rests on. It already existed inside the client report as
-- `pctOfStoreGmv`, but the scorecard cannot call that path: the client-report
-- split takes ~2.9s for a single brand-month and timed out entirely across 14
-- brands. This reads the roster_creator_daily rollup instead, which carries
-- every creator (the "roster_" prefix is a misnomer) and is a fraction of the
-- cost, while applying the IDENTICAL membership rule so the two agree.
-- Verified: catakor July returns 746,056.69 / 444,355.72 / 59.56% from both.
--
-- MEMBERSHIP, copied deliberately from get_brand_client_report_managed_split:
--   managed = the handle has any still-active roster row for the brand,
--             OR was archived AFTER the day the GMV was earned.
-- Handles come from managed_creators.account_1..account_10 PLUS tiktok_accounts.
-- Using fewer account columns silently under-counts.
--
-- Confirmed with the Director 2026-08-30:
--   * Once a creator is on the roster, ALL their GMV counts, including revenue
--     from videos posted before they joined. Nothing gates on added_at, and it
--     must not: added_at is when someone typed them into Tempo, not when CC
--     started managing them (Forchics' entire July roster was entered in
--     August, so gating on it would report $0 for a brand that did $112,490).
--   * A creator who leaves mid-month still counts for the days they were on.
--     Measured: creators who left DURING July carry $61,676, and that is CC's.
--     But 155 creators who left BEFORE July began carry $413,995 of July GMV,
--     and crediting CC for those would claim months it managed nobody. The rule
--     above counts the former and excludes the latter.
--
-- VINTAGE: of the GMV earned in the window, how much came from videos posted
-- this month, one month prior, two prior, or older. Buckets are relative to the
-- calendar month of p_end.
--
-- WARNING: VINTAGE CAN ONLY EVER EXPLAIN VIDEO-ATTRIBUTED GMV. A livestream is
-- not a video and has no post date. Video-attributable share ranged 74.7%
-- (Lemme) to 98.9% (Peach Slices) in July. The remainder is returned as its OWN
-- figure, `notVideoAttributable`, and is never spread across the buckets:
-- apportioning it would turn a measurement into an estimate. Callers must
-- render it as its own line, not fold it in.
--
-- WARNING: ~1.1% of July GMV sits on rows with a NULL post_date and lands in
-- `unknown`. Recoverable later from the video id (its top 32 bits are the
-- creation timestamp, validated 300/300 within a day), but not guessed here.

create or replace function public.get_brand_capture_rate(
  p_data_slugs   text[],
  p_roster_slugs text[],
  p_start        date,
  p_end          date
) returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  with src as (
    select mc.archived_at,
           lower(btrim(regexp_replace(h.handle, '^@', ''))) as handle
    from public.managed_creators mc
      cross join lateral (values
        (mc.account_1), (mc.account_2), (mc.account_3), (mc.account_4), (mc.account_5),
        (mc.account_6), (mc.account_7), (mc.account_8), (mc.account_9), (mc.account_10)
      ) h(handle)
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and h.handle is not null and btrim(h.handle) <> ''
    union all
    select mc.archived_at,
           lower(btrim(regexp_replace(t.tiktok_username, '^@', '')))
    from public.managed_creators mc
    join public.tiktok_accounts t on t.creator_id = mc.creator_id
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
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
    select d.gmv,
           (m.handle is not null
             and (m.ever_active or m.archived_on > d.stat_date)) as is_managed
    from public.roster_creator_daily d
    left join mem m on m.handle = d.handle
    where (p_data_slugs is null or d.brand_slug = any(p_data_slugs))
      and d.stat_date between p_start and p_end
  )
  select jsonb_build_object(
    'brandGmv',   round(coalesce(sum(gmv), 0), 2),
    'managedGmv', round(coalesce(sum(gmv) filter (where is_managed), 0), 2),
    -- NULL, not 0, when there is no denominator. A brand with no data has no
    -- capture rate; it does not have a capture rate of zero.
    'capturePct', case when coalesce(sum(gmv), 0) > 0
                       then round(100 * coalesce(sum(gmv) filter (where is_managed), 0)
                                  / sum(gmv), 2)
                       else null end
  )
  from rows_;
$fn$;

create or replace function public.get_gmv_vintage(
  p_data_slugs   text[],
  p_roster_slugs text[],
  p_start        date,
  p_end          date,
  p_managed_only boolean default true
) returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  with src as (
    select mc.archived_at,
           lower(btrim(regexp_replace(h.handle, '^@', ''))) as handle
    from public.managed_creators mc
      cross join lateral (values
        (mc.account_1), (mc.account_2), (mc.account_3), (mc.account_4), (mc.account_5),
        (mc.account_6), (mc.account_7), (mc.account_8), (mc.account_9), (mc.account_10)
      ) h(handle)
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and h.handle is not null and btrim(h.handle) <> ''
    union all
    select mc.archived_at,
           lower(btrim(regexp_replace(t.tiktok_username, '^@', '')))
    from public.managed_creators mc
    join public.tiktok_accounts t on t.creator_id = mc.creator_id
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and mc.creator_id is not null
      and t.tiktok_username is not null and btrim(t.tiktok_username) <> ''
  ),
  mem as materialized (
    select handle,
           bool_or(archived_at is null) as ever_active,
           max(archived_at)::date       as archived_on
    from src group by 1
  ),
  -- Total GMV on the same membership rule, so the video share is measured
  -- against the right denominator.
  totals as (
    select coalesce(sum(d.gmv), 0) as total_gmv
    from public.roster_creator_daily d
    left join mem m on m.handle = d.handle
    where (p_data_slugs is null or d.brand_slug = any(p_data_slugs))
      and d.stat_date between p_start and p_end
      and (not p_managed_only
           or (m.handle is not null
               and (m.ever_active or m.archived_on > d.stat_date)))
  ),
  vid as (
    select case
             when v.post_date is null then 'unknown'
             when v.post_date >= date_trunc('month', p_end)::date                          then 'current'
             when v.post_date >= (date_trunc('month', p_end) - interval '1 month')::date   then 'prior_1'
             when v.post_date >= (date_trunc('month', p_end) - interval '2 month')::date   then 'prior_2'
             else 'older'
           end as bucket,
           v.gmv
    from public.video_performance v
    left join mem m
      on m.handle = lower(btrim(regexp_replace(v.creator_name, '^@', '')))
    where (p_data_slugs is null or v.brand = any(p_data_slugs))
      and v.report_date between p_start and p_end
      and v.creator_name is not null and btrim(v.creator_name) <> ''
      and (not p_managed_only
           or (m.handle is not null
               and (m.ever_active or m.archived_on > v.report_date)))
  ),
  agg as (
    select coalesce(sum(gmv) filter (where bucket = 'current'), 0) as current_month,
           coalesce(sum(gmv) filter (where bucket = 'prior_1'), 0) as prior_1,
           coalesce(sum(gmv) filter (where bucket = 'prior_2'), 0) as prior_2,
           coalesce(sum(gmv) filter (where bucket = 'older'),   0) as older,
           coalesce(sum(gmv) filter (where bucket = 'unknown'), 0) as unknown,
           coalesce(sum(gmv), 0)                                   as video_total
    from vid
  )
  select jsonb_build_object(
    'totalGmv',            round(t.total_gmv, 2),
    'videoAttributedGmv',  round(a.video_total, 2),
    -- Live and product-card GMV. Has no post date and is NEVER apportioned
    -- across the buckets. Render it as its own line.
    'notVideoAttributable', round(greatest(t.total_gmv - a.video_total, 0), 2),
    'vintage', jsonb_build_object(
      'currentMonth', round(a.current_month, 2),
      'prior1',       round(a.prior_1, 2),
      'prior2',       round(a.prior_2, 2),
      'older',        round(a.older, 2),
      'unknown',      round(a.unknown, 2)
    ),
    'anchorMonth', to_char(date_trunc('month', p_end), 'YYYY-MM')
  )
  from agg a, totals t;
$fn$;

-- EXECUTE defaults to PUBLIC, so naming anon alone would revoke nothing.
revoke all on function public.get_brand_capture_rate(text[], text[], date, date) from public;
revoke all on function public.get_gmv_vintage(text[], text[], date, date, boolean) from public;
grant execute on function public.get_brand_capture_rate(text[], text[], date, date)
  to authenticated, service_role;
grant execute on function public.get_gmv_vintage(text[], text[], date, date, boolean)
  to authenticated, service_role;

comment on function public.get_brand_capture_rate(text[], text[], date, date) is
  'Capture rate = managed GMV / brand total GMV, the Director of Brands core metric. Membership rule is '
  'IDENTICAL to get_brand_client_report_managed_split so the scorecard and the client report cannot '
  'disagree. Reads the roster_creator_daily rollup for speed. Returns capturePct NULL, never 0, when '
  'there is no denominator.';

comment on function public.get_gmv_vintage(text[], text[], date, date, boolean) is
  'Splits GMV earned in a window by the month the video was POSTED (current / prior_1 / prior_2 / older '
  '/ unknown), anchored on the calendar month of p_end. notVideoAttributable carries live and '
  'product-card GMV, which has no post date and must never be apportioned across the buckets.';
