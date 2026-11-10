-- One scoped source scan for roster KPIs. The former per-store report fanout
-- scanned the same date window repeatedly and timed out on full-month portfolios.
-- No records or existing report functions are changed.
CREATE OR REPLACE FUNCTION public.get_roster_summary_workspace(
  p_tenant_id uuid, p_data_slugs text[], p_roster_slugs text[], p_start date, p_end date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
SET plan_cache_mode = force_custom_plan
SET enable_mergejoin = off
SET statement_timeout = '20s'
AS $function$
BEGIN
  IF p_tenant_id IS NULL OR p_start IS NULL OR p_end IS NULL
    OR p_end < p_start OR p_end - p_start > 399
    OR p_data_slugs IS NULL OR p_roster_slugs IS NULL
    OR cardinality(p_data_slugs) > 200 OR cardinality(p_roster_slugs) > 400 THEN
    RAISE EXCEPTION 'Invalid roster summary scope or dates' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_data_slugs || p_roster_slugs) wanted(slug)
    WHERE NOT EXISTS (SELECT 1 FROM public.brands_v2 b
      WHERE b.tenant_id = p_tenant_id AND b.slug = wanted.slug)
  ) THEN
    RAISE EXCEPTION 'Invalid roster summary brand scope' USING ERRCODE = '42501';
  END IF;
  RETURN (
    WITH stores AS MATERIALIZED (
      SELECT DISTINCT d.slug AS data_slug, r.slug AS roster_slug
      FROM public.brands_v2 d
      JOIN public.brands_v2 r ON r.tenant_id = p_tenant_id
        AND (r.id = d.id OR (r.is_umbrella AND d.parent_brand_id = r.id))
      WHERE d.tenant_id = p_tenant_id AND d.slug = ANY(p_data_slugs)
        AND r.slug = ANY(p_roster_slugs)
    ), roster AS MATERIALIZED (
      SELECT DISTINCT s.data_slug, mc.id, mc.creator_id, mc.reporting_start_date, mc.archived_at,
        mc.account_1, mc.account_2, mc.account_3, mc.account_4, mc.account_5,
        mc.account_6, mc.account_7, mc.account_8, mc.account_9, mc.account_10
      FROM stores s JOIN public.managed_creators mc
        ON mc.tenant_id = p_tenant_id AND mc.brand IN (s.roster_slug, s.data_slug)
      -- Same month-end reporting-exclusion semantics as the scoped split RPC.
      WHERE NOT coalesce(mc.tags, ARRAY[]::text[]) @> ARRAY['reporting-exclude:' || to_char(p_end, 'YYYY-MM')]
    ), src AS (
      SELECT r.data_slug, r.reporting_start_date, r.archived_at,
        lower(btrim(regexp_replace(h.handle, '^@', ''))) AS handle
      FROM roster r CROSS JOIN LATERAL (VALUES
        (r.account_1),(r.account_2),(r.account_3),(r.account_4),(r.account_5),
        (r.account_6),(r.account_7),(r.account_8),(r.account_9),(r.account_10)
      ) h(handle)
      WHERE h.handle IS NOT NULL AND btrim(h.handle) <> ''
      UNION ALL
      SELECT r.data_slug, r.reporting_start_date, r.archived_at,
        lower(btrim(regexp_replace(t.tiktok_username, '^@', '')))
      FROM roster r JOIN public.tiktok_accounts t
        ON t.tenant_id = p_tenant_id AND t.creator_id = r.creator_id
      WHERE t.tiktok_username IS NOT NULL AND btrim(t.tiktok_username) <> ''
    ), membership AS MATERIALIZED (
      SELECT data_slug, handle,
        jsonb_build_array(data_slug, handle) AS identity_key,
        range_agg(CASE WHEN reporting_start_date >= archived_at::date THEN 'empty'::daterange
          ELSE daterange(reporting_start_date, archived_at::date, '[)') END) AS managed_days
      FROM src GROUP BY data_slug, handle
    ), daily AS MATERIALIZED (
      SELECT cp.brand, cp.report_date,
        count(*) AS source_rows, count(cp.gmv) AS valued_rows,
        sum(cp.gmv) AS affiliate_gmv,
        count(*) FILTER (WHERE m.handle IS NOT NULL) AS managed_rows,
        count(cp.gmv) FILTER (WHERE m.handle IS NOT NULL) AS managed_valued_rows,
        sum(cp.gmv) FILTER (WHERE m.handle IS NOT NULL) AS managed_gmv
      FROM public.creator_performance cp
      -- One unambiguous composite identity forces the entire store+handle key
      -- into the join. A brand-only merge join otherwise checks every managed
      -- handle for each fact; materializing all facts instead costs large I/O.
      LEFT JOIN membership m ON m.identity_key = jsonb_build_array(cp.brand,
        lower(btrim(regexp_replace(cp.creator_name, '^@', ''))))
        AND m.managed_days @> cp.report_date
      WHERE cp.tenant_id = p_tenant_id AND cp.brand = ANY(p_data_slugs)
        AND cp.period_type = 'daily' AND cp.report_date BETWEEN p_start AND p_end
        AND cp.creator_name IS NOT NULL AND btrim(cp.creator_name) <> ''
      GROUP BY cp.brand, cp.report_date
    ), totals AS (
      SELECT coalesce(sum(managed_gmv), 0) AS managed_gmv,
        coalesce(sum(affiliate_gmv), 0) AS affiliate_gmv,
        coalesce(sum(managed_rows - managed_valued_rows), 0) AS missing_managed_values,
        coalesce(sum(source_rows - valued_rows), 0) AS missing_affiliate_values,
        count(*) AS source_days
      FROM daily
    ), expected AS (
      SELECT count(DISTINCT slug) * (p_end - p_start + 1) AS days FROM unnest(p_data_slugs) s(slug)
    )
    SELECT jsonb_build_object(
      'managed_gmv', CASE WHEN t.missing_managed_values = 0 THEN t.managed_gmv ELSE NULL END,
      'affiliate_gmv', CASE WHEN t.missing_affiliate_values = 0 THEN t.affiliate_gmv ELSE NULL END,
      'coverage_complete', e.days > 0 AND t.source_days = e.days AND t.missing_managed_values = 0,
      'source_days', t.source_days, 'expected_days', e.days
    ) FROM totals t CROSS JOIN expected e
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.get_roster_summary_workspace(uuid,text[],text[],date,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_roster_summary_workspace(uuid,text[],text[],date,date) TO service_role;
COMMENT ON FUNCTION public.get_roster_summary_workspace(uuid,text[],text[],date,date) IS
  'Tenant/store-scoped managed GMV and source-day coverage for one window. Current recorded subtotal; source-day presence is not upstream export completeness.';
