-- Read-only dashboard series. Membership comes from the canonical managed lookup.
-- Only the service role can execute; the route authorizes exact brand UUIDs first.
CREATE OR REPLACE FUNCTION public.dashboard_metric_series(p_brand_ids uuid[], p_start date, p_end date, p_members jsonb)
RETURNS TABLE(brand_id uuid, stat_date date, gmv numeric, orders numeric, units numeric, managed_gmv numeric, managed_orders numeric, managed_units numeric, recorded boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp
AS $$
WITH brands AS MATERIALIZED (
 SELECT id,slug,tenant_id FROM brands_v2 WHERE id=ANY(p_brand_ids)
 AND p_end >= p_start AND p_end-p_start <= 400
), members AS MATERIALIZED (
 SELECT DISTINCT x.brand,x.handle,x.cutoff FROM jsonb_to_recordset(p_members) x(brand text,handle text,cutoff date)
), managed AS (
 SELECT b.id,cp.report_date,sum(cp.gmv)::numeric gmv,sum(cp.orders)::numeric orders,sum(cp.items_sold)::numeric units
 FROM creator_performance cp JOIN brands b ON b.slug=cp.brand AND b.tenant_id=cp.tenant_id
 WHERE cp.period_type='daily' AND cp.report_date BETWEEN p_start AND p_end
 AND EXISTS(SELECT 1 FROM members m WHERE m.brand=cp.brand AND m.handle=lower(cp.creator_name) AND (m.cutoff IS NULL OR cp.report_date<m.cutoff))
 GROUP BY b.id,cp.report_date
), total AS (
 SELECT s.* FROM brand_daily_stats s JOIN brands b ON b.id=s.brand_id WHERE s.report_date BETWEEN p_start AND p_end
)
SELECT coalesce(t.brand_id,m.id),coalesce(t.report_date,m.report_date),t.gmv::numeric,t.orders::numeric,t.items_sold::numeric,
 coalesce(m.gmv,0),coalesce(m.orders,0),coalesce(m.units,0),t.report_date IS NOT NULL
 FROM total t FULL JOIN managed m ON m.id=t.brand_id AND m.report_date=t.report_date;
$$;
REVOKE ALL ON FUNCTION public.dashboard_metric_series(uuid[],date,date,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_metric_series(uuid[],date,date,jsonb) TO service_role;
