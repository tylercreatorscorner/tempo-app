-- 112_videolist_coverage_upload_evidence.sql
--
-- Fix the Video List freshness signal lying under dual-ingest (mig 110).
--
-- get_upload_coverage's 'videos' branch derived coverage from DISTINCT
-- videos.post_date. That was only ever a proxy for "a Video List file was
-- uploaded", and dual-ingest breaks it outright: every video_performance
-- upload now writes post_dated identity rows into `videos`, so the /upload
-- L column and StaleBrandsBanner would go green for brand-days where no
-- Video List file was uploaded at all. For brands still emitting the OLD
-- Video List export (jiyu, leefar_*, lemme, physicians_choice as of
-- 2026-07-22), a silently-stopped Video List upload would become
-- undetectable — the exact failure mode the freshness work exists to catch.
--
-- Instead, count evidence only a REAL Video List upload produces: the
-- /api/upload/run activity_log rows with details->>'table' = 'videos'.
-- coverage_date = the UTC day the file was uploaded (the videos table has no
-- report_date; upload-day is the honest liveness signal for a lifetime
-- export). Chunked uploads log one row per chunk; DISTINCT collapses them.
--
-- Known limit, accepted: the upload audit log only has rows since its
-- 2026-07-22 repair (the phantom-user_id fix), so videolist coverage before
-- that date reads as absent. That is honest "can't prove an upload
-- happened" — never fake green. The freshness "future rows" probe for
-- videolist now trivially returns empty (an upload timestamp can't be in
-- the future), which is correct: scheduled-row anomalies are already
-- blocked at ingest by the /api/upload/run guard.
--
-- The other three branches are unchanged; both callers
-- (/api/upload/freshness and /api/upload/matrix) keep the same RPC
-- signature and response shape. CREATE OR REPLACE preserves the existing
-- grants (authenticated, service_role — mig 065).

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
    -- Upload evidence, NOT videos.post_date — see file header. Sargable
    -- created_at bounds (half-open, end-exclusive of p_end + 1 day).
    RETURN QUERY
      SELECT DISTINCT al.brand::text,
             (al.created_at AT TIME ZONE 'utc')::date
      FROM activity_log al
      WHERE al.activity_type = 'upload'
        AND al.details->>'table' = 'videos'
        AND al.brand = ANY(p_brands)
        AND al.created_at >= (p_start::timestamp AT TIME ZONE 'utc')
        AND al.created_at <  ((p_end + 1)::timestamp AT TIME ZONE 'utc');
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

COMMENT ON FUNCTION public.get_upload_coverage IS
  'Returns DISTINCT (brand, date) tuples for the upload coverage panels. '
  'creator/video/product branches read fact-table report_date; the videos '
  'branch reads activity_log upload evidence (mig 112) because dual-ingest '
  '(mig 110) made videos.post_date untrustworthy as an upload-liveness signal.';
