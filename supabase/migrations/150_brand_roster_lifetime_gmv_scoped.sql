-- 150_brand_roster_lifetime_gmv_scoped.sql
--
-- Scope get_brand_roster_lifetime_gmv to the roster's own handles.
--
-- Migration 148 grouped every handle that has ever had a daily_creator_stats
-- row for the brand. Measured on Lemme immediately after shipping it: 74,120
-- rows, of which ~142 are managed. The caller throws the rest away via its
-- handle→creator map, so the numbers were right, but the Overview was hauling
-- 74k rows over the wire on every load to use 0.2% of them.
--
-- That is also the silent-truncation shape this codebase keeps getting bitten
-- by: nothing caps the response today, but the day a db_max_rows is set, the
-- roster's lifetime figures would quietly go missing for creators past the cut
-- and no one would see an error — they would just see smaller numbers.
--
-- Passing the handles the caller already has removes both problems.

create or replace function public.get_brand_roster_lifetime_gmv(
  p_brand_ids uuid[],
  p_handles   text[]
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
    and lower(trim(replace(dcs.tiktok_username, '@', ''))) = any(p_handles)
  group by 1;
$function$;

revoke all on function public.get_brand_roster_lifetime_gmv(uuid[], text[])
  from public, anon, authenticated;
grant execute on function public.get_brand_roster_lifetime_gmv(uuid[], text[])
  to service_role;

-- Remove the unscoped one-argument version from 148 so it cannot be called by
-- accident. It shipped and was replaced within the hour; nothing else uses it.
drop function if exists public.get_brand_roster_lifetime_gmv(uuid[]);
