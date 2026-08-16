-- 148_brand_roster_lifetime_gmv.sql
--
-- All-time GMV per handle for one brand's whole roster.
--
-- The roster-grain sibling of get_brand_creator_lifetime_gmv (mig 147). Same
-- reason for existing: managed_creators.lifetime_gmv is 0 on all 2,090 rows
-- and nothing has ever written it, so every surface reading it showed $0.
--
-- 147 fixed the creator detail page. This one exists because the SAME dead
-- column also fed the "Lifetime GMV" column of the roster CSV that brands
-- download from the Reports page — meaning every export a client has ever
-- taken carried 0.00 down that column for every creator.
--
-- Grouped by handle, not by managed creator: managed_creators holds up to 10
-- handles per person in account_1..account_10, and the caller already owns
-- that handle → person mapping. Returning handle grain keeps this function
-- ignorant of the identity model, which is the part that keeps changing.
--
-- SECURITY DEFINER because RLS on daily_creator_stats evaluates per scanned
-- row. Brand scoping is the CALLER's job: p_brand_ids comes from the portal
-- session's own brand, never from a query parameter.

create or replace function public.get_brand_roster_lifetime_gmv(
  p_brand_ids uuid[]
)
returns table (
  handle       text,
  lifetime_gmv numeric,
  first_day    date
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select lower(trim(replace(dcs.tiktok_username, '@', ''))) as handle,
         coalesce(sum(dcs.gmv), 0)::numeric                 as lifetime_gmv,
         min(dcs.report_date)                               as first_day
  from public.daily_creator_stats dcs
  where dcs.brand_id = any(p_brand_ids)
    and dcs.tiktok_username is not null
  group by 1;
$function$;

-- A GRANT list that merely omits anon revokes NOTHING: EXECUTE defaults to
-- PUBLIC. Revoke explicitly, then grant only what should call it.
revoke all on function public.get_brand_roster_lifetime_gmv(uuid[])
  from public, anon, authenticated;
grant execute on function public.get_brand_roster_lifetime_gmv(uuid[])
  to service_role;
