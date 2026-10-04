-- Read-only agency-business performance. Registry archival is a present-day
-- state and must not erase historical client rows or expected source stores.
CREATE OR REPLACE FUNCTION public.agency_business_month_performance(
  p_tenant_id uuid,
  p_month date
)
RETURNS TABLE (
  brand_id uuid,
  managed_gmv numeric,
  prior_managed_gmv numeric,
  recorded_days integer,
  prior_recorded_days integer,
  expected_days integer,
  prior_expected_days integer,
  recorded_through date,
  prior_recorded_through date,
  complete boolean,
  prior_complete boolean
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
SET plan_cache_mode = force_custom_plan
AS $function$
DECLARE
  v_prior_month date;
  v_next_month date;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant is required' USING ERRCODE = '22023';
  END IF;
  IF p_month IS NULL OR NOT isfinite(p_month)
     OR p_month < DATE '2000-01-01' OR p_month > DATE '2100-12-01'
     OR extract(day FROM p_month) <> 1 THEN
    RAISE EXCEPTION 'Month must be the first day of a month between 2000 and 2100'
      USING ERRCODE = '22023';
  END IF;
  v_prior_month := (p_month - INTERVAL '1 month')::date;
  v_next_month := (p_month + INTERVAL '1 month')::date;

  RETURN QUERY
  WITH registry AS MATERIALIZED (
    SELECT b.id, b.slug, b.parent_brand_id
    FROM public.brands_v2 b
    WHERE b.tenant_id = p_tenant_id
  ), roots AS (
    SELECT b.id, b.slug FROM registry b WHERE b.parent_brand_id IS NULL
  ), data_map AS MATERIALIZED (
    -- Each source slug contributes once per root, including legacy root data.
    SELECT r.id AS root_id, r.slug AS roster_slug, r.slug AS data_slug FROM roots r
    UNION
    SELECT r.id, r.slug, c.slug
    FROM roots r JOIN registry c ON c.parent_brand_id = r.id
  ), expected_stores AS (
    -- Umbrellas require every child store. The umbrella itself is not an
    -- additional export. A root with no children requires its own daily data.
    SELECT r.id AS root_id, c.slug AS data_slug
    FROM roots r JOIN registry c ON c.parent_brand_id = r.id
    UNION
    SELECT r.id, r.slug FROM roots r
    WHERE NOT EXISTS (SELECT 1 FROM registry c WHERE c.parent_brand_id = r.id)
  ), store_counts AS (
    SELECT e.root_id, count(*) AS store_count
    FROM expected_stores e GROUP BY e.root_id
  ), roster AS MATERIALIZED (
    SELECT mc.creator_id, mc.brand, mc.reporting_start_date, mc.archived_at,
           mc.account_1, mc.account_2, mc.account_3, mc.account_4, mc.account_5,
           mc.account_6, mc.account_7, mc.account_8, mc.account_9, mc.account_10
    FROM public.managed_creators mc
    JOIN roots r ON r.slug = mc.brand
    WHERE mc.tenant_id = p_tenant_id
  ), member_handles AS (
    SELECT mc.brand, mc.reporting_start_date, mc.archived_at,
           lower(btrim(regexp_replace(h.handle, '^@', ''))) AS handle
    FROM roster mc
    CROSS JOIN LATERAL (VALUES
      (mc.account_1), (mc.account_2), (mc.account_3), (mc.account_4), (mc.account_5),
      (mc.account_6), (mc.account_7), (mc.account_8), (mc.account_9), (mc.account_10)
    ) h(handle)
    WHERE nullif(btrim(h.handle), '') IS NOT NULL
    UNION ALL
    SELECT mc.brand, mc.reporting_start_date, mc.archived_at,
           lower(btrim(regexp_replace(t.tiktok_username, '^@', '')))
    FROM roster mc
    JOIN public.tiktok_accounts t ON t.creator_id = mc.creator_id
                                AND t.tenant_id = p_tenant_id
    WHERE nullif(btrim(t.tiktok_username), '') IS NOT NULL
  ), membership AS MATERIALIZED (
    -- Union intervals before joining sales so duplicate/overlapping roster
    -- rows and aliases never multiply GMV. NULL starts retain legacy history.
    SELECT h.brand, h.handle,
           range_agg(CASE WHEN h.reporting_start_date >= h.archived_at::date
                     THEN 'empty'::daterange
                     ELSE daterange(h.reporting_start_date, h.archived_at::date, '[)')
                     END) AS managed_days
    FROM member_handles h GROUP BY h.brand, h.handle
  ), facts AS MATERIALIZED (
    SELECT m.root_id, m.data_slug, cp.report_date, cp.gmv,
           coalesce(mm.managed_days @> cp.report_date, false) AS is_managed
    FROM public.creator_performance cp
    JOIN data_map m ON m.data_slug = cp.brand
    LEFT JOIN membership mm ON mm.brand = m.roster_slug
      AND mm.handle = lower(btrim(regexp_replace(cp.creator_name, '^@', '')))
    WHERE cp.tenant_id = p_tenant_id AND cp.period_type = 'daily'
      AND cp.report_date >= v_prior_month AND cp.report_date < v_next_month
  ), monthly_totals AS (
    SELECT f.root_id, (f.report_date >= p_month) AS is_current,
           -- A recorded managed row with unknown money cannot establish a
           -- total. Coverage below intentionally measures source presence only.
           CASE WHEN bool_or(f.is_managed AND f.gmv IS NULL) THEN NULL::numeric
                ELSE coalesce(sum(f.gmv) FILTER (WHERE f.is_managed), 0)::numeric
           END AS gmv
    FROM facts f GROUP BY f.root_id, (f.report_date >= p_month)
  ), covered_dates AS (
    SELECT f.root_id, f.report_date
    FROM facts f
    JOIN expected_stores e ON e.root_id = f.root_id AND e.data_slug = f.data_slug
    JOIN store_counts n ON n.root_id = f.root_id
    GROUP BY f.root_id, f.report_date, n.store_count
    HAVING count(DISTINCT f.data_slug) = n.store_count
  ), coverage AS (
    SELECT d.root_id, (d.report_date >= p_month) AS is_current,
           count(*)::integer AS days, max(d.report_date) AS through_date
    FROM covered_dates d GROUP BY d.root_id, (d.report_date >= p_month)
  )
  SELECT r.id,
         cur.gmv, pri.gmv,
         coalesce(cc.days, 0), coalesce(pc.days, 0),
         v_next_month - p_month, p_month - v_prior_month,
         cc.through_date, pc.through_date,
         coalesce(cc.days, 0) = v_next_month - p_month,
         coalesce(pc.days, 0) = p_month - v_prior_month
  FROM roots r
  LEFT JOIN monthly_totals cur ON cur.root_id = r.id AND cur.is_current
  LEFT JOIN monthly_totals pri ON pri.root_id = r.id AND NOT pri.is_current
  LEFT JOIN coverage cc ON cc.root_id = r.id AND cc.is_current
  LEFT JOIN coverage pc ON pc.root_id = r.id AND NOT pc.is_current
  ORDER BY r.id;
END;
$function$;

COMMENT ON FUNCTION public.agency_business_month_performance(uuid, date) IS
'Read-only, tenant-scoped monthly managed creator GMV with independent prior-month presence. Uses reporting membership intervals and preserves refunds. NULL GMV means no daily source rows for that month or a managed row with unknown GMV; zero means recorded rows with no managed GMV. Coverage requires daily creator source presence in every registered child store (or root if no children), including archived registry rows. Coverage is data presence, separate from monetary completeness, and not a guarantee that a TikTok export contains every sale. Does not read creator costs or activate renewals.';

REVOKE ALL ON FUNCTION public.agency_business_month_performance(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agency_business_month_performance(uuid, date) TO service_role;
