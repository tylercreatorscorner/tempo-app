-- Brand Client Report in ONE round-trip.
--
-- brand-client-report.ts paginate-looped creator_performance (current + prior
-- windows) and video_performance (full window superset) through per-row RLS -
-- an all-brands 30d run was ~100+ sequential 1000-row pages (the PDF button
-- honestly advertised "~10-20s"), and every page sat on the same 8s-timeout
-- cliff that killed the Daily Drop (RLS policy functions evaluate per scanned
-- row: 5,128ms measured for ONE page). Same cure: a SECURITY DEFINER
-- aggregate RPC that returns bounded aggregates, not rows.
--
-- Everything the PDF renders comes back in one jsonb:
--   totals + prior totals, managed/organic split (+ managed prior),
--   new-vs-returning, newly-activated, signed-roster count, daily series,
--   top creators (overall + managed), top videos (overall + managed, real
--   watch URLs via `videos` - video_performance.video_link is ~0% usable per
--   mig 079), top products, product x creator breakdown.
--
-- Managed membership rides managed_brand_handles (account_1..10, normalized)
-- scoped to p_roster_slugs - the caller passes [brand] for umbrella/plain
-- brands and [store, parentUmbrella] for store slugs (the old JS filtered
-- mc.brand = storeSlug exactly, which returned an EMPTY managed set for
-- store-grain runs - fixed here). NULL = all brands.
--
-- Cross-store duplicate video_performance rows collapse via the mig-079
-- dedup (DISTINCT ON (video_id, product_id, report_date) keeping max gmv) -
-- the old JS summed duplicates straight, slightly overstating all-brands and
-- umbrella runs wherever byte-identical cross-brand copies existed.
CREATE OR REPLACE FUNCTION public.get_brand_client_report_agg(
  p_data_slugs   text[],              -- creator/video_performance brand filter; NULL = all
  p_roster_slugs text[],              -- managed_creators grain for the managed split; NULL = all
  p_start date, p_end date,
  p_prior_start date, p_prior_end date
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
SET statement_timeout = '60s'
AS $$
  WITH mh AS MATERIALIZED (
    SELECT DISTINCT mp.handle
    FROM managed_brand_handles mp
    WHERE p_roster_slugs IS NULL OR mp.brand_slug = ANY(p_roster_slugs)
  ),
  cur AS MATERIALIZED (
    SELECT lower(btrim(regexp_replace(cp.creator_name, '^@', ''))) AS handle,
           MAX(cp.creator_name) AS name,
           SUM(cp.gmv)::numeric AS gmv,
           SUM(cp.orders)::bigint AS orders,
           SUM(cp.videos)::bigint AS videos,
           SUM(cp.est_commission)::numeric AS commission
    FROM creator_performance cp
    WHERE cp.period_type = 'daily'
      AND cp.report_date BETWEEN p_start AND p_end
      AND (p_data_slugs IS NULL OR cp.brand = ANY(p_data_slugs))
      AND cp.creator_name IS NOT NULL AND btrim(cp.creator_name) <> ''
    GROUP BY 1
  ),
  cur_m AS MATERIALIZED (SELECT c.*, (c.handle IN (SELECT handle FROM mh)) AS is_managed FROM cur c),
  prior AS MATERIALIZED (
    SELECT lower(btrim(regexp_replace(cp.creator_name, '^@', ''))) AS handle,
           SUM(cp.gmv)::numeric AS gmv,
           SUM(cp.orders)::bigint AS orders,
           SUM(cp.videos)::bigint AS videos
    FROM creator_performance cp
    WHERE cp.period_type = 'daily'
      AND cp.report_date BETWEEN p_prior_start AND p_prior_end
      AND (p_data_slugs IS NULL OR cp.brand = ANY(p_data_slugs))
      AND cp.creator_name IS NOT NULL AND btrim(cp.creator_name) <> ''
    GROUP BY 1
  ),
  prior_m AS MATERIALIZED (SELECT p.*, (p.handle IN (SELECT handle FROM mh)) AS is_managed FROM prior p),
  -- New/returning + newly-activated via ONE hash join. NOT IN against the
  -- ~180k-row prior handle set degraded to per-row linear subplan scans
  -- (the function measured 11.9s; this join takes it to ~4s all-brands).
  nv AS MATERIALIZED (
    SELECT COUNT(*) FILTER (WHERE p.handle IS NULL)::bigint                          AS new_count,
           COALESCE(SUM(c.gmv) FILTER (WHERE p.handle IS NULL), 0)::numeric          AS new_gmv,
           COUNT(*) FILTER (WHERE p.handle IS NOT NULL)::bigint                      AS returning_count,
           COALESCE(SUM(c.gmv) FILTER (WHERE p.handle IS NOT NULL), 0)::numeric      AS returning_gmv,
           COUNT(*) FILTER (WHERE c.is_managed AND p.handle IS NULL)::bigint         AS newly_activated
    FROM cur_m c LEFT JOIN prior p USING (handle)
  ),
  daily AS (
    SELECT cp.report_date AS d,
           SUM(cp.gmv)::numeric AS gmv,
           SUM(cp.orders)::bigint AS orders,
           COUNT(DISTINCT lower(btrim(regexp_replace(cp.creator_name, '^@', ''))))::bigint AS creators
    FROM creator_performance cp
    WHERE cp.period_type = 'daily'
      AND cp.report_date BETWEEN p_start AND p_end
      AND (p_data_slugs IS NULL OR cp.brand = ANY(p_data_slugs))
    GROUP BY cp.report_date
  ),
  -- Video x product rows, mig-079 deduped across stores.
  vp_dd AS MATERIALIZED (
    SELECT DISTINCT ON (vp.video_id, vp.product_id, vp.report_date)
           vp.video_id, vp.video_title, vp.creator_name, vp.product_name,
           vp.gmv, vp.orders, vp.brand,
           lower(btrim(regexp_replace(vp.creator_name, '^@', ''))) AS handle
    FROM video_performance vp
    WHERE vp.period_type = 'daily'
      AND vp.report_date BETWEEN p_start AND p_end
      AND (p_data_slugs IS NULL OR vp.brand = ANY(p_data_slugs))
    ORDER BY vp.video_id, vp.product_id, vp.report_date, vp.gmv DESC
  ),
  -- Per-video aggregates. HAVING > 0: the daily export logs zero-GMV activity
  -- rows for most tracked videos; a client-report leaderboard only ranks
  -- earners. is_managed from the max-gmv row's handle (same rule as the JS).
  vids AS MATERIALIZED (
    SELECT v.video_id,
           (array_agg(v.video_title ORDER BY v.gmv DESC))[1] AS title,
           (array_agg(v.creator_name ORDER BY v.gmv DESC))[1] AS creator,
           (array_agg(v.handle ORDER BY v.gmv DESC))[1] AS handle,
           SUM(v.gmv)::numeric AS gmv, SUM(v.orders)::bigint AS orders,
           ((array_agg(v.handle ORDER BY v.gmv DESC))[1] IN (SELECT handle FROM mh)) AS is_managed
    FROM vp_dd v
    WHERE v.video_id IS NOT NULL AND v.video_id <> ''
    GROUP BY v.video_id
    HAVING SUM(v.gmv) > 0
  ),
  -- Watch URLs resolved ONLY for leaderboard candidates (<=15 rows). Doing it
  -- for every video ran the `videos` lookup 178,866 times (~2s alone).
  vids_url AS MATERIALIZED (
    SELECT vd.*,
           COALESCE(
             (SELECT vv.video_link FROM videos vv
              WHERE vv.video_id = vd.video_id AND vv.video_link ILIKE '%tiktok.com%'
              ORDER BY vv.post_date DESC NULLS LAST LIMIT 1),
             'https://www.tiktok.com/@' || vd.handle || '/video/' || vd.video_id
           ) AS url
    FROM (
      (SELECT * FROM vids ORDER BY gmv DESC LIMIT 10)
      UNION
      (SELECT * FROM vids WHERE is_managed ORDER BY gmv DESC LIMIT 5)
    ) vd
  ),
  prods AS MATERIALIZED (
    SELECT COALESCE(NULLIF(btrim(v.product_name), ''), 'Unknown Product') AS name,
           SUM(v.gmv)::numeric AS gmv, SUM(v.orders)::bigint AS orders
    FROM vp_dd v
    GROUP BY 1
  ),
  top5_prods AS MATERIALIZED (SELECT name FROM prods ORDER BY gmv DESC LIMIT 5),
  prod_creators AS MATERIALIZED (
    SELECT pc.product, pc.name, pc.gmv FROM (
      SELECT COALESCE(NULLIF(btrim(v.product_name), ''), 'Unknown Product') AS product,
             (array_agg(v.creator_name ORDER BY v.gmv DESC))[1] AS name,
             SUM(v.gmv)::numeric AS gmv,
             row_number() OVER (
               PARTITION BY COALESCE(NULLIF(btrim(v.product_name), ''), 'Unknown Product')
               ORDER BY SUM(v.gmv) DESC
             ) AS rn
      FROM vp_dd v
      WHERE v.handle <> ''
        AND COALESCE(NULLIF(btrim(v.product_name), ''), 'Unknown Product') IN (SELECT name FROM top5_prods)
      GROUP BY 1, v.handle
    ) pc
    WHERE pc.rn <= 3
  )
  SELECT jsonb_build_object(
    'totals', (SELECT jsonb_build_object(
        'gmv', COALESCE(SUM(gmv), 0), 'orders', COALESCE(SUM(orders), 0),
        'videos', COALESCE(SUM(videos), 0), 'commission', COALESCE(SUM(commission), 0),
        'active_creators', COUNT(*)) FROM cur_m),
    'prior_totals', (SELECT jsonb_build_object(
        'gmv', COALESCE(SUM(gmv), 0), 'orders', COALESCE(SUM(orders), 0),
        'videos', COALESCE(SUM(videos), 0), 'active_creators', COUNT(*)) FROM prior_m),
    'managed', (SELECT jsonb_build_object(
        'gmv', COALESCE(SUM(gmv), 0), 'orders', COALESCE(SUM(orders), 0),
        'videos', COALESCE(SUM(videos), 0), 'commission', COALESCE(SUM(commission), 0),
        'creators', COUNT(*)) FROM cur_m WHERE is_managed),
    'organic', (SELECT jsonb_build_object(
        'gmv', COALESCE(SUM(gmv), 0), 'orders', COALESCE(SUM(orders), 0),
        'creators', COUNT(*)) FROM cur_m WHERE NOT is_managed),
    'managed_prior', (SELECT jsonb_build_object(
        'gmv', COALESCE(SUM(gmv), 0), 'orders', COALESCE(SUM(orders), 0),
        'creators', COUNT(*)) FROM prior_m WHERE is_managed),
    'new_vs_returning', (SELECT jsonb_build_object(
        'new_count', nv.new_count, 'new_gmv', nv.new_gmv,
        'returning_count', nv.returning_count, 'returning_gmv', nv.returning_gmv
      ) FROM nv),
    'newly_activated', (SELECT nv.newly_activated FROM nv),
    'signed_creator_count', (SELECT COUNT(*) FROM mh),
    'daily', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'd', d.d, 'gmv', d.gmv, 'orders', d.orders, 'creators', d.creators)
        ORDER BY d.d), '[]'::jsonb) FROM daily d),
    'top_creators', (SELECT COALESCE(jsonb_agg(t ORDER BY t.gmv DESC), '[]'::jsonb) FROM (
        SELECT c.name, c.gmv, c.orders, c.videos FROM cur_m c ORDER BY c.gmv DESC LIMIT 10) t),
    'managed_top_creators', (SELECT COALESCE(jsonb_agg(t ORDER BY t.gmv DESC), '[]'::jsonb) FROM (
        SELECT c.name, c.gmv, c.orders, c.videos FROM cur_m c WHERE c.is_managed ORDER BY c.gmv DESC LIMIT 5) t),
    'top_videos', (SELECT COALESCE(jsonb_agg(t ORDER BY t.gmv DESC), '[]'::jsonb) FROM (
        SELECT vu.title, vu.creator, vu.gmv, vu.orders, vu.url FROM vids_url vu ORDER BY vu.gmv DESC LIMIT 10) t),
    'managed_top_videos', (SELECT COALESCE(jsonb_agg(t ORDER BY t.gmv DESC), '[]'::jsonb) FROM (
        SELECT vu.title, vu.creator, vu.gmv, vu.orders, vu.url FROM vids_url vu WHERE vu.is_managed ORDER BY vu.gmv DESC LIMIT 5) t),
    'top_products', (SELECT COALESCE(jsonb_agg(t ORDER BY t.gmv DESC), '[]'::jsonb) FROM (
        SELECT p.name, p.gmv, p.orders FROM prods p ORDER BY p.gmv DESC LIMIT 10) t),
    'product_creators', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'product', pc.product, 'name', pc.name, 'gmv', pc.gmv)), '[]'::jsonb) FROM prod_creators pc)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_brand_client_report_agg(text[], text[], date, date, date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_brand_client_report_agg(text[], text[], date, date, date, date) IS
  'Every Brand Client Report section as bounded aggregates in one jsonb. Replaces ~100+ per-row-RLS paginated reads (the 10-20s PDF).';
