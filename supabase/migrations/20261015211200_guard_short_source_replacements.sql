-- A successful file upload does not establish that TikTok exported the full day.
-- Keep the existing writers and their chunk contract, but serialize the
-- replacement check under the SAME lock as their delete/insert transaction.
CREATE OR REPLACE FUNCTION public.upload_source_checked_atomic(
  p_table text,
  p_brand text,
  p_report_date date,
  p_records jsonb,
  p_overwrite boolean,
  p_file_rows integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing_rows integer;
  chunk_rows integer;
BEGIN
  IF p_table NOT IN ('creator_performance', 'video_performance') OR p_table IS NULL THEN
    RAISE EXCEPTION 'Unsupported source table' USING ERRCODE = '22023';
  END IF;
  IF p_brand IS NULL OR p_report_date IS NULL OR jsonb_typeof(p_records) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid source upload' USING ERRCODE = '22023';
  END IF;
  chunk_rows := jsonb_array_length(p_records);
  IF chunk_rows = 0 OR (p_file_rows IS NOT NULL AND p_file_rows < chunk_rows) THEN
    RAISE EXCEPTION 'Invalid whole-file row count' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_records) r
    WHERE (r->>'brand') IS DISTINCT FROM p_brand
       OR (r->>'report_date') IS DISTINCT FROM p_report_date::text
  ) THEN
    RAISE EXCEPTION 'Record brand/date does not match the upload target' USING ERRCODE = '22023';
  END IF;

  SET LOCAL statement_timeout = '60s';
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5('upload:' || p_table || ':' || p_brand || ':' || p_report_date::text), 1, 16))::bit(64)::bigint
  );
  IF p_table = 'creator_performance' THEN
    SELECT count(*) INTO existing_rows FROM public.creator_performance
    WHERE brand = p_brand AND report_date = p_report_date AND period_type = 'daily';
  ELSE
    SELECT count(*) INTO existing_rows FROM public.video_performance
    WHERE brand = p_brand AND report_date = p_report_date AND period_type = 'daily';
  END IF;

  IF p_overwrite AND existing_rows > 0 AND (p_file_rows IS NULL OR p_file_rows < existing_rows) THEN
    RETURN jsonb_build_object(
      'blocked', true,
      'reason', CASE WHEN p_file_rows IS NULL THEN 'missing_file_total' ELSE 'shorter_source' END,
      'existingRows', existing_rows,
      'fileRows', p_file_rows
    );
  END IF;
  -- The lock is reentrant within this transaction. Later chunks use
  -- overwrite=false, so a 5,000-row chunk is not mistaken for a whole file.
  IF p_table = 'creator_performance' THEN
    RETURN public.upload_creator_performance_atomic(p_brand, p_report_date, p_records, p_overwrite);
  END IF;
  RETURN public.upload_video_performance_atomic(p_brand, p_report_date, p_records, p_overwrite);
END;
$$;

REVOKE ALL ON FUNCTION public.upload_source_checked_atomic(text,text,date,jsonb,boolean,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upload_source_checked_atomic(text,text,date,jsonb,boolean,integer) TO service_role;
COMMENT ON FUNCTION public.upload_source_checked_atomic(text,text,date,jsonb,boolean,integer) IS
  'Server-only manual-upload guard. Refuses shorter creator/video replacements under the writer lock; does not infer source completeness or change merge behavior.';
