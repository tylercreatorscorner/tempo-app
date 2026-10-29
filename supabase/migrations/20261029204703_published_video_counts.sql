-- Published content is a video identity, never a creator-export activity sum
-- or a video x product x sales-day row. This service-only read does not modify
-- source facts or previously shared report snapshots.
CREATE OR REPLACE FUNCTION public.get_published_video_counts_workspace(
  p_tenant_id uuid, p_roster_slugs text[],
  p_start date, p_end date, p_prior_start date, p_prior_end date,
  p_data_slugs text[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
SET plan_cache_mode = force_custom_plan
SET statement_timeout = '20s'
AS $function$
BEGIN
  IF p_tenant_id IS NULL OR p_roster_slugs IS NULL
    OR p_start IS NULL OR p_end IS NULL OR p_prior_start IS NULL OR p_prior_end IS NULL
    OR p_start > p_end OR p_prior_start > p_prior_end
    OR greatest(p_end, p_prior_end) - least(p_start, p_prior_start) > 800 THEN
    RAISE EXCEPTION 'Publication count scope or dates are invalid';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_roster_slugs) requested(slug)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.brands_v2 b
      WHERE b.tenant_id = p_tenant_id AND b.slug = requested.slug
    )
  ) THEN
    RAISE EXCEPTION 'Publication count brand scope is invalid';
  END IF;

  RETURN (
    WITH requested AS MATERIALIZED (
      SELECT b.id, b.slug, b.is_umbrella
      FROM public.brands_v2 b
      WHERE b.tenant_id = p_tenant_id AND b.slug = ANY(p_roster_slugs)
    ), stores AS MATERIALIZED (
      SELECT r.slug AS roster_slug, d.slug AS data_slug
      FROM requested r
      JOIN public.brands_v2 d ON d.tenant_id = p_tenant_id
       AND (CASE WHEN r.is_umbrella AND EXISTS (
         SELECT 1 FROM public.brands_v2 child
         WHERE child.tenant_id = p_tenant_id AND child.parent_brand_id = r.id
       ) THEN d.parent_brand_id = r.id ELSE d.id = r.id END)
       AND (p_data_slugs IS NULL OR d.slug = ANY(p_data_slugs))
    ), roster AS MATERIALIZED (
      SELECT DISTINCT s.roster_slug, s.data_slug, mc.*
      FROM stores s
      JOIN public.managed_creators mc ON mc.tenant_id = p_tenant_id
       AND mc.brand IN (s.roster_slug, s.data_slug)
    ), member_exclusions AS MATERIALIZED (
      -- One opted-out row opts out all aliases of that person for this brand.
      -- An untagged duplicate must not undo a deliberate monthly exclusion.
      SELECT r.roster_slug, r.data_slug,
        coalesce(r.creator_id::text, 'row:' || r.id::text) AS member_key,
        bool_or(coalesce(r.tags, ARRAY[]::text[]) @> ARRAY['reporting-exclude:' || to_char(p_end, 'YYYY-MM')]) AS current_excluded,
        bool_or(coalesce(r.tags, ARRAY[]::text[]) @> ARRAY['reporting-exclude:' || to_char(p_prior_end, 'YYYY-MM')]) AS prior_excluded
      FROM roster r
      GROUP BY 1, 2, 3
    ), effective_roster AS MATERIALIZED (
      SELECT r.*, e.current_excluded, e.prior_excluded
      FROM roster r JOIN member_exclusions e ON e.roster_slug = r.roster_slug AND e.data_slug = r.data_slug
        AND e.member_key = coalesce(r.creator_id::text, 'row:' || r.id::text)
    ), handles AS MATERIALIZED (
      SELECT r.roster_slug, r.data_slug, r.reporting_start_date, r.archived_at,
             r.current_excluded, r.prior_excluded,
             lower(regexp_replace(btrim(h.handle), '^@+', '')) AS handle
      FROM effective_roster r
      CROSS JOIN LATERAL (VALUES
        (r.account_1), (r.account_2), (r.account_3), (r.account_4), (r.account_5),
        (r.account_6), (r.account_7), (r.account_8), (r.account_9), (r.account_10)
      ) h(handle)
      WHERE nullif(btrim(h.handle), '') IS NOT NULL
      UNION
      SELECT r.roster_slug, r.data_slug, r.reporting_start_date, r.archived_at,
             r.current_excluded, r.prior_excluded,
             lower(regexp_replace(btrim(t.tiktok_username), '^@+', ''))
      FROM effective_roster r
      JOIN public.tiktok_accounts t ON t.tenant_id = p_tenant_id AND t.creator_id = r.creator_id
      WHERE nullif(btrim(t.tiktok_username), '') IS NOT NULL
    ), handle_exclusions AS MATERIALIZED (
      SELECT h.roster_slug, h.data_slug, h.handle,
        bool_or(h.current_excluded) AS current_excluded,
        bool_or(h.prior_excluded) AS prior_excluded
      FROM handles h GROUP BY 1, 2, 3
    ), posts AS MATERIALIZED (
      SELECT DISTINCT s.roster_slug, btrim(vp.video_id) AS video_id,
             vp.post_date::date AS posted,
             lower(regexp_replace(btrim(vp.creator_name), '^@+', '')) AS handle,
             vp.brand AS data_slug
      FROM stores s
      JOIN public.video_performance vp ON vp.tenant_id = p_tenant_id AND vp.brand = s.data_slug
      WHERE vp.period_type = 'daily' AND nullif(btrim(vp.video_id), '') IS NOT NULL
        AND vp.post_date IS NOT NULL
        -- Leave the indexed post_date uncast in the predicate.
        AND vp.post_date >= least(p_start, p_prior_start)
        AND vp.post_date < greatest(p_end, p_prior_end) + 1
    ), managed_posts AS MATERIALIZED (
      SELECT p.roster_slug, p.video_id,
        bool_or(p.posted BETWEEN p_start AND p_end
          AND NOT e.current_excluded) AS in_current,
        bool_or(p.posted BETWEEN p_prior_start AND p_prior_end
          AND NOT e.prior_excluded) AS in_prior
      FROM posts p
      JOIN handles h ON h.roster_slug = p.roster_slug AND h.data_slug = p.data_slug AND h.handle = p.handle
        AND (h.reporting_start_date IS NULL OR p.posted >= h.reporting_start_date)
        AND (h.archived_at IS NULL OR p.posted < h.archived_at::date)
      JOIN handle_exclusions e ON e.roster_slug = p.roster_slug AND e.data_slug = p.data_slug AND e.handle = p.handle
      GROUP BY p.roster_slug, p.video_id
    ), day_rows AS MATERIALIZED (
      SELECT vp.brand, vp.report_date, count(*) AS rows
      FROM public.video_performance vp
      WHERE vp.tenant_id = p_tenant_id AND vp.period_type = 'daily'
        AND vp.brand IN (SELECT data_slug FROM stores)
        AND vp.report_date BETWEEN least(p_start, p_prior_start) AND greatest(p_end, p_prior_end)
      GROUP BY vp.brand, vp.report_date
    ), latest_runs AS MATERIALIZED (
      -- The legacy run ledger has no tenant column. It is evidence only when
      -- the data slug belongs unambiguously to this tenant.
      SELECT DISTINCT ON (i.brand_slug, i.report_date)
        i.brand_slug, i.report_date, i.status, i.rows_expected, i.rows_written, i.finished_at, i.error
      FROM public.ingestion_runs i
      WHERE i.target_table = 'video_performance'
        AND i.brand_slug IN (SELECT data_slug FROM stores)
        AND i.report_date BETWEEN least(p_start, p_prior_start) AND greatest(p_end, p_prior_end)
        AND NOT EXISTS (SELECT 1 FROM public.brands_v2 other
          WHERE other.slug = i.brand_slug AND other.tenant_id <> p_tenant_id)
      ORDER BY i.brand_slug, i.report_date, i.started_at DESC, i.id DESC
    ), windows AS (
      SELECT 'current' AS window, d::date AS day FROM generate_series(p_start::timestamp, p_end::timestamp, interval '1 day') d
      UNION ALL
      SELECT 'prior', d::date FROM generate_series(p_prior_start::timestamp, p_prior_end::timestamp, interval '1 day') d
    ), coverage AS MATERIALIZED (
      SELECT s.roster_slug, w.window,
        bool_and(coalesce(i.status = 'complete' AND i.finished_at IS NOT NULL AND i.error IS NULL
          AND i.rows_expected > 0 AND i.rows_written = i.rows_expected
          AND d.rows = i.rows_expected
          AND NOT EXISTS (
            SELECT 1 FROM public.ingestion_runs earlier
            WHERE earlier.brand_slug = s.data_slug AND earlier.target_table = 'video_performance'
              AND earlier.report_date = w.day AND earlier.rows_expected > d.rows
          ), false)) AS complete
      FROM stores s CROSS JOIN windows w
      LEFT JOIN latest_runs i ON i.brand_slug = s.data_slug AND i.report_date = w.day
      LEFT JOIN day_rows d ON d.brand = s.data_slug AND d.report_date = w.day
      GROUP BY s.roster_slug, w.window
    ), by_brand AS (
      SELECT r.slug,
        (SELECT count(DISTINCT p.video_id) FROM managed_posts p WHERE p.roster_slug = r.slug AND p.in_current) AS count,
        (SELECT count(DISTINCT p.video_id) FROM managed_posts p WHERE p.roster_slug = r.slug AND p.in_prior) AS prior_count,
        (SELECT count(DISTINCT p.video_id) FROM posts p WHERE p.roster_slug = r.slug AND p.posted BETWEEN p_start AND p_end) AS store_count,
        (SELECT count(DISTINCT p.video_id) FROM posts p WHERE p.roster_slug = r.slug AND p.posted BETWEEN p_prior_start AND p_prior_end) AS prior_store_count,
        coalesce((SELECT c.complete FROM coverage c WHERE c.roster_slug = r.slug AND c.window = 'current'), false) AS current_complete,
        coalesce((SELECT c.complete FROM coverage c WHERE c.roster_slug = r.slug AND c.window = 'prior'), false) AS prior_complete
      FROM requested r
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(DISTINCT video_id) FROM managed_posts WHERE in_current),
      'priorTotal', (SELECT count(DISTINCT video_id) FROM managed_posts WHERE in_prior),
      'storeTotal', (SELECT count(DISTINCT video_id) FROM posts WHERE posted BETWEEN p_start AND p_end),
      'priorStoreTotal', (SELECT count(DISTINCT video_id) FROM posts WHERE posted BETWEEN p_prior_start AND p_prior_end),
      'currentComplete', coalesce((SELECT bool_and(current_complete) FROM by_brand), false),
      'priorComplete', coalesce((SELECT bool_and(prior_complete) FROM by_brand), false),
      'brands', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'slug', slug, 'count', count, 'priorCount', prior_count,
        'storeCount', store_count, 'priorStoreCount', prior_store_count,
        'currentComplete', current_complete, 'priorComplete', prior_complete
      ) ORDER BY slug) FROM by_brand), '[]'::jsonb)
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_published_video_counts_workspace(uuid, text[], date, date, date, date, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_published_video_counts_workspace(uuid, text[], date, date, date, date, text[]) TO service_role;
COMMENT ON FUNCTION public.get_published_video_counts_workspace(uuid, text[], date, date, date, date, text[]) IS
  'Distinct managed videos by publication date, tenant and brand, with prior-period counts. Completeness is ingested-file evidence only, not proof that TikTok exported all activity.';
