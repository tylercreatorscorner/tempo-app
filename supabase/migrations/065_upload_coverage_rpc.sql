-- 065_upload_coverage_rpc.sql
--
-- Adds get_upload_coverage(): returns DISTINCT (brand, date) tuples for the
-- 4 fact tables the /upload page's DataMatrix and FreshnessPanel read.
--
-- Why: the routes previously ran a raw-row SELECT on the fact table and
-- de-duped in Node. For a tenant with ~14 active brands and ~600 creators per
-- brand per day, that's ~15k rows/day/brand → ~200k rows across a 14-day
-- window. PostgREST silently caps responses at db-max-rows (100k in this
-- project). Because the response was ordered by (brand, id) ascending, every
-- brand alphabetically past the cutoff (Kitsch onward) came back with ZERO
-- rows and rendered as "Missing" in the coverage grid — even when data
-- existed. Confirmed on 2026-07-01 (jen120499's Creator's Corner tenant).
--
-- The RPC pre-aggregates in the DB so the response is O(brands × days) ≈
-- 200 rows regardless of tenant size — no cap risk.

CREATE OR REPLACE FUNCTION public.get_upload_coverage(
  p_table  text,
  p_brands text[],
  p_start  date,
  p_end    date
) RETURNS TABLE(brand text, coverage_date date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Explicit table dispatch — safer than dynamic SQL, and constrains
  -- callers to the 4 fact tables the /upload page actually reads.
  IF p_table = 'creator_performance' THEN
    RETURN QUERY
      SELECT DISTINCT cp.brand::text, cp.report_date
      FROM creator_performance cp
      WHERE cp.brand = ANY(p_brands)
        AND cp.report_date >= p_start
        AND cp.report_date <= p_end;
  ELSIF p_table = 'video_performance' THEN
    RETURN QUERY
      SELECT DISTINCT vp.brand::text, vp.report_date
      FROM video_performance vp
      WHERE vp.brand = ANY(p_brands)
        AND vp.report_date >= p_start
        AND vp.report_date <= p_end;
  ELSIF p_table = 'videos' THEN
    RETURN QUERY
      SELECT DISTINCT v.brand::text, v.post_date
      FROM videos v
      WHERE v.brand = ANY(p_brands)
        AND v.post_date >= p_start
        AND v.post_date <= p_end;
  ELSIF p_table = 'product_performance' THEN
    RETURN QUERY
      SELECT DISTINCT pp.brand::text, pp.report_date
      FROM product_performance pp
      WHERE pp.brand = ANY(p_brands)
        AND pp.report_date >= p_start
        AND pp.report_date <= p_end;
  ELSE
    RAISE EXCEPTION 'Invalid table for coverage RPC: %', p_table;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_upload_coverage(text, text[], date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_upload_coverage IS
  'Returns DISTINCT (brand, date) tuples for the upload coverage panels. '
  'Replaces raw-row SELECT that hit PostgREST row cap for busy tenants.';
