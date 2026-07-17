-- Per-brand daily GMV series for a date range — one call, for the Brand
-- Performance table's sparkline column.
--
-- Deliberately reads daily_creator_stats, the SAME source as
-- analytics_brand_totals (migration 073), because the sparkline sits in the same
-- row as that function's GMV number. Sourcing the shape and the total from
-- different tables is how you end up with a line that visibly disagrees with the
-- figure beside it.
--
-- Cheap by construction: grouped per (brand, day), so a 13-brand / 7-day view is
-- ~91 rows. This is NOT a return to the 28x get_daily_trend fan-out that
-- migration 074 removed — that was one round-trip PER BRAND; this is one call
-- for all of them.

CREATE OR REPLACE FUNCTION analytics_brand_daily_series(
  p_brand_ids UUID[],
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  brand_id UUID,
  report_date DATE,
  gmv NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    dcs.brand_id,
    dcs.report_date,
    COALESCE(SUM(dcs.gmv), 0)::numeric
  FROM daily_creator_stats dcs
  WHERE dcs.brand_id = ANY(p_brand_ids)
    AND dcs.report_date BETWEEN p_start_date AND p_end_date
  GROUP BY dcs.brand_id, dcs.report_date
  ORDER BY dcs.brand_id, dcs.report_date;
$function$;

GRANT EXECUTE ON FUNCTION analytics_brand_daily_series(UUID[], DATE, DATE) TO authenticated, service_role;
