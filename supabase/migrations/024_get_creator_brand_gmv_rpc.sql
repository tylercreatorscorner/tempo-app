-- 024_get_creator_brand_gmv_rpc.sql
--
-- Adds an RPC for aggregating creator_performance into per-(brand, creator)
-- GMV totals over a date range.
--
-- Replaces the raw `.select(...).limit(50000)` query in src/lib/data/earnings.ts
-- which silently truncated ~57% of rows on busy months (118K daily rows in
-- April 2026 → only 50K returned), under-counting GMV for the brands whose
-- rows happened to fall after the cutoff.
--
-- The RPC aggregates server-side, returning ~one row per (brand, creator) —
-- ~30K rows max instead of 100K+, well under any limit.

CREATE OR REPLACE FUNCTION get_creator_brand_gmv(
  p_start_date DATE,
  p_end_date   DATE,
  p_brands     TEXT[]
)
RETURNS TABLE (
  brand        TEXT,
  creator_name TEXT,
  gmv          NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    cp.brand::text,
    cp.creator_name::text,
    SUM(cp.gmv)::numeric AS gmv
  FROM creator_performance cp
  WHERE cp.period_type = 'daily'
    AND cp.report_date >= p_start_date
    AND cp.report_date <= p_end_date
    AND cp.brand = ANY(p_brands)
  GROUP BY cp.brand, cp.creator_name
$$;

COMMENT ON FUNCTION get_creator_brand_gmv IS
  'Returns aggregated GMV per (brand, creator_name) for a date range, filtered
   to a list of brand slugs. Aggregates server-side to avoid row-limit
   truncation when fetching raw daily rows. Used by the earnings calculator.';

-- Permissions: grant to authenticated + service_role so the admin client and
-- any downstream callers can invoke it.
GRANT EXECUTE ON FUNCTION get_creator_brand_gmv(DATE, DATE, TEXT[]) TO authenticated, service_role;
