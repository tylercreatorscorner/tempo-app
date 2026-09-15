-- Partial, service-only import of UI-validated Affiliate Compass creator metrics.
-- Retain CSV-owned fields; absent export rows may not hide existing revenue.
CREATE OR REPLACE FUNCTION public.merge_compass_creator_metrics(
  p_brand text, p_report_date date, p_records jsonb, p_overwrite boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  owner_id uuid;
  affected integer;
BEGIN
  -- The existing daily-stats trigger resolves its target through public.
  -- This function remains invoker-only and executable only by service_role.
  IF p_brand IS NULL OR p_report_date IS NULL
    OR p_report_date >= (now() AT TIME ZONE 'Etc/GMT+8')::date
    OR jsonb_typeof(p_records) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'A brand, completed day and array of creator records are required';
  END IF;
  IF jsonb_array_length(p_records) = 0 THEN RAISE EXCEPTION 'Empty report'; END IF;
  IF (SELECT count(*) FROM public.brands_v2 WHERE slug = p_brand AND NOT is_archived) <> 1 THEN
    RAISE EXCEPTION 'Brand must resolve to exactly one active workspace';
  END IF;
  SELECT tenant_id INTO STRICT owner_id FROM public.brands_v2 WHERE slug = p_brand AND NOT is_archived;

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_records) r WHERE
    r->>'brand' IS DISTINCT FROM p_brand OR r->>'report_date' IS DISTINCT FROM p_report_date::text
    OR r->>'period_type' IS DISTINCT FROM 'daily'
    OR COALESCE(r->>'creator_name','') !~ '^[a-z0-9_.]{1,64}$'
    OR jsonb_typeof(r->'gmv') IS DISTINCT FROM 'number'
    OR jsonb_typeof(r->'items_sold') IS DISTINCT FROM 'number'
    OR COALESCE(r->>'gmv','') !~ '^[0-9]+(\.[0-9]{1,2})?$'
    OR COALESCE(r->>'items_sold','') !~ '^[0-9]+$'
  ) THEN RAISE EXCEPTION 'Invalid creator metric or record scope'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_records) r GROUP BY r->>'creator_name' HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate creator handle';
  END IF;

  -- Same lock as manual uploads: serialize competing writes to the same day.
  PERFORM pg_advisory_xact_lock(('x' || substr(md5('upload:creator_performance:'||p_brand||':'||p_report_date::text),1,16))::bit(64)::bigint);
  IF EXISTS (SELECT 1 FROM public.creator_performance c WHERE c.brand=p_brand AND c.report_date=p_report_date
    AND (c.tenant_id IS DISTINCT FROM owner_id OR c.period_type IS DISTINCT FROM 'daily')) THEN
    RAISE EXCEPTION 'Existing day has incompatible workspace or period';
  END IF;
  IF p_overwrite IS NOT TRUE AND EXISTS (SELECT 1 FROM public.creator_performance WHERE brand=p_brand AND report_date=p_report_date) THEN
    RAISE EXCEPTION 'Day already exists; overwrite was disabled';
  END IF;
  IF EXISTS (SELECT 1 FROM public.creator_performance c WHERE c.brand=p_brand AND c.report_date=p_report_date
    AND (COALESCE(c.gmv,0) <> 0 OR COALESCE(c.items_sold,0) <> 0)
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_records) r WHERE r->>'creator_name'=c.creator_name)) THEN
    RAISE EXCEPTION 'Report omits existing creators with GMV or units; reconcile identities before importing';
  END IF;

  INSERT INTO public.creator_performance (
    tenant_id,brand,report_date,period_type,creator_name,gmv,items_sold,data_source,
    refunds,orders,items_refunded,aov,avg_daily_products_with_sales,videos,live_streams,
    est_commission,samples_shipped,est_flat_fee
  ) SELECT owner_id,p_brand,p_report_date,'daily',r->>'creator_name',
    (r->>'gmv')::numeric,(r->>'items_sold')::integer,'api',
    NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL
  FROM jsonb_array_elements(p_records) r
  ON CONFLICT (creator_name,brand,report_date) DO UPDATE SET
    gmv=EXCLUDED.gmv,items_sold=EXCLUDED.items_sold;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN jsonb_build_object('upserted',affected,'deleted',0,'metrics',jsonb_build_array('gmv','items_sold'));
END;
$$;
REVOKE ALL ON FUNCTION public.merge_compass_creator_metrics(text,date,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.merge_compass_creator_metrics(text,date,jsonb,boolean) TO service_role;
