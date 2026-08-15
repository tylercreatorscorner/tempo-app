-- 147_brand_creator_lifetime_gmv.sql
--
-- All-time GMV for one managed creator, scoped to one brand.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
--
-- The brand portal's creator page printed a "Lifetime GMV" KPI straight off
-- managed_creators.lifetime_gmv. That column is 0 on ALL 2,090 rows — nothing
-- has ever written it — so every client, on every creator, has been shown
-- "Lifetime GMV $0" sitting beside a real period figure. On @slavicnursingbabe
-- it read $0 next to $35.0k for the week.
--
-- ── Aggregated here, not in the client ──────────────────────────────────────
--
-- A creator can hold up to 10 handles and the read is unbounded in time, so a
-- PostgREST .select() would risk the 1,000-row truncation that silently
-- understates every un-paginated read in this codebase. SUM in the database
-- and there is nothing to truncate.
--
-- SECURITY DEFINER because RLS on daily_creator_stats evaluates per scanned
-- row. Brand scoping is the CALLER's job: p_brand_ids comes from the portal
-- session's own brand, never from a query parameter.
--
-- ── first_day is not decoration ─────────────────────────────────────────────
--
-- daily_creator_stats does not go back to the beginning of time — for this
-- creator it starts 2026-06-15. Labelling a sum over a partial record
-- "lifetime" overstates it, so the caller renders "since <first_day>" beside
-- the figure. NULL first_day means no rows at all, and the caller must render
-- an em dash rather than $0: a creator we have no record of has not earned
-- zero, we simply cannot say.

create or replace function public.get_brand_creator_lifetime_gmv(
  p_brand_ids uuid[],
  p_handles   text[]
)
returns table (
  lifetime_gmv numeric,
  first_day    date,
  last_day     date
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(sum(dcs.gmv), 0)::numeric as lifetime_gmv,
         min(dcs.report_date)               as first_day,
         max(dcs.report_date)               as last_day
  from public.daily_creator_stats dcs
  where dcs.brand_id = any(p_brand_ids)
    and lower(trim(replace(dcs.tiktok_username, '@', ''))) = any(p_handles);
$function$;

-- A GRANT list that merely omits anon revokes NOTHING: EXECUTE defaults to
-- PUBLIC. Revoke explicitly, then grant only what should call it.
revoke all on function public.get_brand_creator_lifetime_gmv(uuid[], text[])
  from public, anon, authenticated;
grant execute on function public.get_brand_creator_lifetime_gmv(uuid[], text[])
  to service_role;
