-- MAX(report_date) across a set of brands for a date range — in ONE call.
--
-- The dashboard fired one get_daily_trend RPC PER BRAND (28 of them) and then
-- summed every returned day in JS purely to read the last date off the end:
--
--   const latestDate = aggregatedTrend[aggregatedTrend.length - 1].date;
--
-- That single date is the "Data through …" badge and the stale-pipeline check.
-- The chart is driven by managedDaily, not by this. So: 28 round-trips, each
-- aggregating a full day-by-day series, to compute a MAX.
--
-- SEMANTICS ARE COPIED FROM get_daily_trend DELIBERATELY — same source table
-- (creator_performance, NOT daily_creator_stats), same period_type = 'daily'
-- filter, same optional tenant scope. Reading a different table could shift the
-- reported "Data through" date, which is a user-visible freshness claim.
--
-- Takes brand SLUGS (text[]), matching get_daily_trend's p_brand, rather than
-- the uuid[] that analytics_brand_totals uses — the caller has slugs here, and
-- converting would mean another lookup.
--
-- The BETWEEN clamp is LOAD-BEARING: a global MAX would break the guard added
-- in #135. Staleness is only evaluated when the selected range reaches the
-- present; an unclamped MAX would report "Data through <today>" for a
-- deliberately historical range and mis-drive isStale.
--
-- SECURITY DEFINER like get_daily_trend (creator_performance has RLS; the v2
-- daily-trend function is prosecdef=false and returns empty for `authenticated`,
-- which would silently render "Awaiting first data sync" — a real error wearing
-- an empty state).

CREATE OR REPLACE FUNCTION analytics_latest_data_date(
  p_brands TEXT[],
  p_start_date DATE,
  p_end_date DATE,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS DATE
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT MAX(cp.report_date)
  FROM creator_performance cp
  WHERE cp.brand = ANY(p_brands)
    AND cp.report_date BETWEEN p_start_date AND p_end_date
    AND cp.period_type = 'daily'
    AND (p_tenant_id IS NULL OR cp.tenant_id = p_tenant_id);
$function$;

GRANT EXECUTE ON FUNCTION analytics_latest_data_date(TEXT[], DATE, DATE, UUID) TO authenticated, service_role;
