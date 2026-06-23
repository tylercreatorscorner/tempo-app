-- 054_dcs_gmv_sum_rpc.sql
--
-- The Daily Drop computed month-to-date GMV by paginating EVERY daily_creator_stats
-- MTD row (`paginatedFetch(... 'gmv', mtdFilters)`) and summing in JS. For a
-- multi-store umbrella (LeeFar ~47k MTD rows) or the all-brands drop (~259k) that
-- was dozens/hundreds of sequential, deep-offset paginated round-trips and timed
-- the serverless function out (504 Vercel Runtime Timeout).
--
-- Fix: compute the MTD GMV with a single indexed SQL aggregate. idx_dcs_date_brand
-- (report_date, brand_id) serves it. SECURITY DEFINER — the Daily Drop is admin/
-- manager-only and passes the brand_ids it already resolved from brands_v2;
-- p_brand_ids NULL = all brands.
--
-- Applied to production via Supabase MCP; this file is the replayable record.

CREATE OR REPLACE FUNCTION public.dcs_gmv_sum(p_brand_ids uuid[], p_start date, p_end date)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT COALESCE(sum(gmv), 0)
  FROM daily_creator_stats
  WHERE report_date >= p_start AND report_date <= p_end
    AND (p_brand_ids IS NULL OR brand_id = ANY(p_brand_ids));
$function$;

GRANT EXECUTE ON FUNCTION public.dcs_gmv_sum(uuid[], date, date) TO authenticated, anon, service_role;
