-- 193_roster_weekly_trend.sql
--
-- The client could see the STORE's trajectory and only two point-in-time
-- numbers for ours.
--
-- ── What was missing ────────────────────────────────────────────────────────
--
-- The report charts daily store GMV and a 12-week store GMV trend, both from
-- brand_lifetime_daily, which is store grain. The roster's own contribution
-- appeared only as this window's figure against last window's: Cata-Kor
-- August reads "59.6% -> 68.0% of store GMV". A client can see the two
-- endpoints and cannot see the SHAPE between them — whether we climbed
-- steadily, spiked once, or recovered from a dip. That shape is the visual
-- answer to "is this working", and it is the one question the report asks the
-- reader to take on trust.
--
-- The gap exists because the report grew out of what the snapshot already
-- carried. Both existing series were store-level, so store trends got charted
-- and ours did not: the data's shape drove the design instead of the client's
-- question.
--
-- ── The membership rule is COPIED, not re-derived ───────────────────────────
--
-- 🚨 A SECOND DEFINITION OF "MANAGED" WOULD BE WORSE THAN NO CHART. The bars
-- sit directly under a headline stating roster GMV, so any rule that differs
-- from the headline's puts two contradicting numbers on one page. The src /
-- mem CTEs below are a verbatim copy of
-- get_brand_client_report_managed_split (migrations 157 + 158):
--
--   * handles come from account_1..10 UNION tiktok_accounts, because 1,003
--     active-roster handles live ONLY in tiktok_accounts and 99 ONLY in the
--     account_ columns — neither store alone is complete;
--   * a handle is managed on day D when ANY roster row for it is still active
--     OR was archived after D, so membership is per-DAY and a past week does
--     not silently rewrite itself as the roster changes;
--   * collapsing to handle grain first is what makes the union safe: this is a
--     set membership test and carries no creator identity, so the 84 handles
--     that map to two or more roster rows cannot be counted twice.
--
-- ⚠️ Do NOT "simplify" this to roster_creator_daily. That rollup answers who is
-- on the roster TODAY, which makes history mutable and would disagree with the
-- headline above the chart by exactly the amount the roster has changed.
--
-- ── Why it reads creator_performance rather than the rollup it sits beside ──
--
-- The store bars come from brand_lifetime_daily and these come from
-- creator_performance, so a divergence between the two sources would render a
-- roster segment TALLER than the bar containing it. Checked over this exact
-- 84-day span, every brand with any lifetime history: the two agree to the
-- cent, zero exceptions. Cata-Kor 2,367,226.27 both ways. The RPC returns the
-- store total from its own source anyway, so the caller can compare rather
-- than assume.
--
-- ── Bucketing is copied from migration 156 for the same reason ──────────────
--
-- wk = (p_through - stat_date) / 7, week_end = p_through - wk * 7, buckets
-- 0..11. Identical arithmetic to get_brand_lifetime's weekly series, so the
-- roster segment lands inside the store bar for the SAME seven days. Any drift
-- here would be invisible and wrong.
--
-- ── Cost ────────────────────────────────────────────────────────────────────
--
-- Warm, measured 2026-09-04 over 84 days: kitsch 3.31s, lemme 1.19s, jiyu
-- 1.18s, catakor 0.54s. It runs alongside get_brand_client_report_counts
-- (13.3s on a 30-day kitsch window) in a Promise.all, so the parallel max does
-- not move. The scan is index-on-brand with the date as a filter, which is the
-- same shape the split RPC already pays for.

create or replace function public.get_brand_roster_weekly(
  p_data_slugs   text[],
  p_roster_slugs text[],
  p_through      date
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '60s'
as $function$
  with src as (
    select mc.id, mc.archived_at,
           lower(btrim(regexp_replace(h.handle, '^@', ''))) as handle
    from public.managed_creators mc
      cross join lateral (values
        (mc.account_1), (mc.account_2), (mc.account_3), (mc.account_4), (mc.account_5),
        (mc.account_6), (mc.account_7), (mc.account_8), (mc.account_9), (mc.account_10)
      ) h(handle)
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and h.handle is not null and btrim(h.handle) <> ''
    union all
    select mc.id, mc.archived_at,
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
  -- Pre-aggregate to (week, managed) grain. is_managed is DATE-dependent, so
  -- it belongs in the grouping key: one creator can be roster for part of the
  -- 84 days and not the rest.
  per as materialized (
    select ((p_through - cp.report_date) / 7)::int as wk,
           (m.handle is not null
             and (m.ever_active or m.archived_on > cp.report_date)) as is_managed,
           sum(cp.gmv)::numeric as gmv
    from public.creator_performance cp
    left join mem m
      on m.handle = lower(btrim(regexp_replace(cp.creator_name, '^@', '')))
    where cp.period_type = 'daily'
      and (p_data_slugs is null or cp.brand = any(p_data_slugs))
      and cp.report_date between p_through - 83 and p_through
      and cp.creator_name is not null and btrim(cp.creator_name) <> ''
    group by 1, 2
  ),
  wk as (
    select wk,
           coalesce(sum(gmv) filter (where is_managed), 0)::numeric as roster_gmv,
           coalesce(sum(gmv), 0)::numeric                           as store_gmv
    from per
    where wk between 0 and 11
    group by 1
  )
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'week_end',   (p_through - wk.wk * 7),
      'roster_gmv', wk.roster_gmv,
      'store_gmv',  wk.store_gmv
    ) order by wk.wk desc), '[]'::jsonb)
  from wk;
$function$;

-- ⚠️ EXECUTE defaults to PUBLIC, so `revoke from anon` alone is a NO-OP: the
-- grant has to be taken from PUBLIC by name. The report is served to
-- unauthenticated readers through a token route, and that route runs as the
-- service role — anon must never be able to call this directly and read any
-- brand's GMV by slug.
revoke execute on function public.get_brand_roster_weekly(text[], text[], date) from public;
revoke execute on function public.get_brand_roster_weekly(text[], text[], date) from anon;
grant  execute on function public.get_brand_roster_weekly(text[], text[], date) to authenticated, service_role;
