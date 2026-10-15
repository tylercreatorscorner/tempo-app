-- Transaction-only fixtures: no test facts survive this script.
BEGIN;
DO $$
DECLARE
  fixture_brand text := 'catakor';
  fixture_date date := '1900-01-01';
  protected_table text;
  records jsonb;
  first_chunk jsonb;
  rest jsonb;
  verdict jsonb;
  row_count integer;
BEGIN
  IF NOT has_function_privilege('service_role','public.upload_source_checked_atomic(text,text,date,jsonb,boolean,integer)','EXECUTE')
     OR has_function_privilege('authenticated','public.upload_source_checked_atomic(text,text,date,jsonb,boolean,integer)','EXECUTE')
     OR has_function_privilege('anon','public.upload_source_checked_atomic(text,text,date,jsonb,boolean,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected source guard permissions';
  END IF;
  FOREACH protected_table IN ARRAY ARRAY['creator_performance','video_performance'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE brand=$1 AND report_date=$2',protected_table)
      INTO row_count USING fixture_brand,fixture_date;
    IF row_count <> 0 THEN RAISE EXCEPTION 'Fixture date already contains facts'; END IF;
    SELECT jsonb_agg(jsonb_build_object(
      'brand',fixture_brand,'report_date',fixture_date::text,
      'creator_name','__source_guard_fixture_'||i,
      'video_id','__source_guard_fixture_'||i,'product_id','__source_guard_fixture',
      'product_name','__source_guard_fixture','video_title','__source_guard_fixture',
      'gmv',0,'orders',0,'videos',i
    ) ORDER BY i) INTO records FROM generate_series(1,3) i;
    first_chunk := jsonb_build_array(records->0);
    rest := jsonb_build_array(records->1,records->2);

    verdict := public.upload_source_checked_atomic(protected_table,fixture_brand,fixture_date,records,true,3);
    IF (verdict->>'upserted')::int <> 3 THEN RAISE EXCEPTION 'Fixture seed failed'; END IF;
    verdict := public.upload_source_checked_atomic(protected_table,fixture_brand,fixture_date,rest,true,2);
    IF verdict->>'blocked' <> 'true' THEN RAISE EXCEPTION 'Short replacement was not blocked'; END IF;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE brand=$1 AND report_date=$2',protected_table)
      INTO row_count USING fixture_brand,fixture_date;
    IF row_count <> 3 THEN RAISE EXCEPTION 'Rejected replacement changed saved facts'; END IF;
    verdict := public.upload_source_checked_atomic(protected_table,fixture_brand,fixture_date,first_chunk,true,NULL);
    IF verdict->>'reason' <> 'missing_file_total' THEN RAISE EXCEPTION 'Unknown file size was accepted'; END IF;

    -- Whole file has three rows even though the first chunk contains one.
    verdict := public.upload_source_checked_atomic(protected_table,fixture_brand,fixture_date,first_chunk,true,3);
    IF (verdict->>'deleted')::int <> 3 OR (verdict->>'upserted')::int <> 1 THEN
      RAISE EXCEPTION 'Whole-file/chunk distinction failed';
    END IF;
    verdict := public.upload_source_checked_atomic(protected_table,fixture_brand,fixture_date,rest,false,3);
    EXECUTE format('SELECT count(*) FROM public.%I WHERE brand=$1 AND report_date=$2',protected_table)
      INTO row_count USING fixture_brand,fixture_date;
    IF row_count <> 3 THEN RAISE EXCEPTION 'Later chunk removed earlier rows'; END IF;
    verdict := public.upload_source_checked_atomic(protected_table,fixture_brand,fixture_date,first_chunk,false,1);
    EXECUTE format('SELECT count(*) FROM public.%I WHERE brand=$1 AND report_date=$2',protected_table)
      INTO row_count USING fixture_brand,fixture_date;
    IF row_count <> 3 THEN RAISE EXCEPTION 'Merge deleted unmatched records'; END IF;
    BEGIN
      PERFORM public.upload_source_checked_atomic(protected_table,'wrong-target',fixture_date,records,true,3);
      RAISE EXCEPTION 'Mismatched record scope was accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
  END LOOP;
END;
$$;
SELECT 'PASS creator/video replacement guard, chunk preservation, merge, target validation and execution grants' AS result;
ROLLBACK;
