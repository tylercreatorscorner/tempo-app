-- 134_compass_verification_csv_side.sql
--
-- The manual upload's side of a Compass verification, aggregated server-side.
--
-- An RPC rather than a PostgREST select for two reasons: creator_performance
-- holds ~9,000 rows for a single brand-day, so a client-side sum would need
-- pagination past the 1000-row cap (the exact bug class in the truncation
-- audit); and RLS evaluates per scanned row, so a brand-wide fact read has to
-- be SECURITY DEFINER or it crawls.
--
-- Returns NULL gmv (not 0) when the day was never uploaded. "$0" and "absent"
-- are different facts and must never render the same.
CREATE OR REPLACE FUNCTION public.compass_verification_csv_side(
  p_brand text,
  p_date  date
)
RETURNS TABLE (gmv numeric, creators integer, loaded_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    -- SUM over zero rows is NULL, which is exactly what we want to propagate.
    SUM(cp.gmv)::numeric                        AS gmv,
    COUNT(DISTINCT cp.creator_name)::integer    AS creators,
    MIN(cp.created_at)                          AS loaded_at
  FROM creator_performance cp
  WHERE cp.brand = p_brand
    AND cp.report_date = p_date
    AND cp.period_type = 'daily';
$function$;

-- Explicit REVOKE: Supabase grants EXECUTE on every new function to
-- anon/authenticated/service_role by default, so a GRANT list that merely omits
-- anon revokes NOTHING. Verified empirically in migrations 113/114.
REVOKE ALL ON FUNCTION public.compass_verification_csv_side(text, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compass_verification_csv_side(text, date)
  TO service_role;
