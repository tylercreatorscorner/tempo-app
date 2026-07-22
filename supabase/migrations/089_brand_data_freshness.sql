-- Per-brand data freshness for the dashboard's stale-data alarm.
--
-- The Jen "brands not reflecting" incident: six brands silently stopped
-- receiving uploads on 2026-07-09 during the legacy-dashboard → Tempo
-- handover, and NOTHING surfaced it for 13 days. This RPC reports each
-- brand's latest brand_daily_stats date (the same rollup the dashboard's
-- money reads, so "stale here" = "stale on the dashboard"); the dashboard
-- renders an unmissable banner for any active brand more than a few days
-- behind. Brands with no rows at all return NULL last_date ("never").

create or replace function public.brand_data_freshness(p_brand_ids uuid[])
returns table(brand_id uuid, last_date date)
language sql
stable security definer
set search_path to 'public'
as $$
  select b.id, max(s.report_date)
  from brands_v2 b
  left join brand_daily_stats s on s.brand_id = b.id
  where b.id = any(p_brand_ids)
  group by b.id;
$$;

grant execute on function public.brand_data_freshness(uuid[]) to authenticated, service_role;
