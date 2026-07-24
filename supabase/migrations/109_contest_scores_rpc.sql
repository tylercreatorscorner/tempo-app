-- Contest engine Phase 1: per-handle window scores for a frozen entrant cohort.
--
-- get_contest_scores(p_handles, p_start, p_end) reads ONLY the pg_cron roster
-- rollups (migration 059) — roster_creator_daily for GMV, roster_creator_posts
-- for posts + distinct posting days — NEVER the raw fact tables (the migration
-- 059 hard rule: a fact-table scan here is the 35s+ path this repo already
-- paid to retire). Both rollups store pre-lowercased handles, so the join is a
-- plain equality against the normalized INPUT array (mig 086's
-- lower(unnest(..)) idiom) — never an expression over the table column (the
-- 83s regexp incident, mig 071).
--
-- The caller (src/lib/contests/scoring.ts) passes the union of every
-- entrant's handles and re-groups rows per HUMAN in JS.
--
-- p_brand_slugs: DATA-STORE slugs, umbrella-expanded by the caller (the
-- get_affiliate_leaderboard convention, mig 071). Non-null for brand-scoped
-- contests — a "CataKor July Sprint" ranks CataKor GMV/posts only. NULL =
-- agency-wide (segment- and everyone-scoped contests).

create or replace function public.get_contest_scores(
  p_handles     text[],
  p_start       date,
  p_end         date,
  p_brand_slugs text[] default null
)
returns table(handle text, gmv numeric, posts bigint, posting_days bigint)
language sql stable security definer set search_path to 'public' as $$
  with h as (
    select distinct lower(trim(x)) as handle
    from unnest(p_handles) as x
    where trim(coalesce(x, '')) <> ''
  ),
  g as (
    select rcd.handle, sum(rcd.gmv) as gmv
    from public.roster_creator_daily rcd
    join h on h.handle = rcd.handle
    where rcd.stat_date between p_start and p_end
      and (p_brand_slugs is null or rcd.brand_slug = any(p_brand_slugs))
    group by rcd.handle
  ),
  p as (
    select rcp.handle,
           count(distinct rcp.video_id)  as posts,
           count(distinct rcp.post_date) as posting_days
    from public.roster_creator_posts rcp
    join h on h.handle = rcp.handle
    where rcp.post_date between p_start and p_end
      and (p_brand_slugs is null or rcp.brand_slug = any(p_brand_slugs))
    group by rcp.handle
  )
  select coalesce(g.handle, p.handle),
         coalesce(g.gmv, 0)::numeric,
         coalesce(p.posts, 0)::bigint,
         coalesce(p.posting_days, 0)::bigint
  from g full outer join p on p.handle = g.handle;
$$;

-- The honest scoring cutoff ("scored through"): the latest day present in
-- roster_creator_daily. The rollup has no lone stat_date index, so a bare
-- MAX(stat_date) would seq-scan tens of millions of rows; instead take the
-- per-brand max via idx_rcd_brand_date (an index-served backward scan per
-- slug) and fold. brands_v2 drives the slug list — rollup slugs absent from
-- brands_v2 are defunct brands that receive no uploads and cannot advance the
-- cutoff.
--
-- p_brand_slugs (data-store slugs, umbrella-expanded by the caller): non-null
-- narrows the cutoff to those brands' uploads — a brand-scoped contest's
-- "scored through" must reflect THAT brand's data lag, not another brand's
-- fresher upload. NULL = global (still per-slug, still index-served).
create or replace function public.get_contest_scored_through(
  p_brand_slugs text[] default null
)
returns date
language sql stable security definer set search_path to 'public' as $$
  select max(last_d)
  from (
    select (select max(rcd.stat_date)
            from public.roster_creator_daily rcd
            where rcd.brand_slug = b.slug) as last_d
    from public.brands_v2 b
    where p_brand_slugs is null or b.slug = any(p_brand_slugs)
  ) t;
$$;

-- Service-role only. CREATE FUNCTION grants EXECUTE to PUBLIC by default, and
-- a GRANT list that merely omits anon revokes NOTHING (house rule, mig 100) —
-- the REVOKE must be explicit.
revoke all on function public.get_contest_scores(text[], date, date, text[]) from public, anon, authenticated;
revoke all on function public.get_contest_scored_through(text[]) from public, anon, authenticated;
grant execute on function public.get_contest_scores(text[], date, date, text[]) to service_role;
grant execute on function public.get_contest_scored_through(text[]) to service_role;
