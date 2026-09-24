-- Explicit reporting membership is independent of contract/content start dates.
-- Existing rows retain their historical basis until an operator confirms a date.
-- New roster additions start today by default; staff can backdate the reporting date.
ALTER TABLE public.managed_creators ADD COLUMN reporting_start_date date;
ALTER TABLE public.managed_creators ALTER COLUMN reporting_start_date SET DEFAULT ((now() AT TIME ZONE 'America/Chicago')::date);
COMMENT ON COLUMN public.managed_creators.reporting_start_date IS 'Inclusive start of managed reporting attribution on sale/activity date. NULL preserves legacy unbounded history. Independent of contract and content-vintage dates.';

CREATE OR REPLACE FUNCTION public.get_agency_portfolio_workspace(p_tenant_id uuid, p_start date, p_end date, p_prior_start date, p_prior_end date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET plan_cache_mode TO 'force_custom_plan'
 SET search_path TO 'public', 'pg_temp'
AS $function$
WITH scoped_brands_v2 AS NOT MATERIALIZED (SELECT * FROM public.brands_v2 WHERE tenant_id = p_tenant_id),
scoped_creator_performance AS NOT MATERIALIZED (SELECT * FROM public.creator_performance WHERE tenant_id = p_tenant_id),
scoped_managed_creators AS NOT MATERIALIZED (SELECT * FROM public.managed_creators WHERE tenant_id = p_tenant_id),
scoped_tiktok_accounts AS NOT MATERIALIZED (SELECT * FROM public.tiktok_accounts WHERE tenant_id = p_tenant_id), brand as (
    select b.id, b.slug, b.name
    from scoped_brands_v2 b
    where coalesce(b.is_archived, false) = false and b.parent_brand_id is null
  ),
  map as (
    select b.slug as roster_slug, b.slug as data_slug from brand b
    union
    select p.slug, c.slug
    from brand p join scoped_brands_v2 c on c.parent_brand_id = p.id
  ),
  src as (
    select mc.brand, mc.archived_at, mc.reporting_start_date,
           lower(btrim(regexp_replace(h.handle, '^@', ''))) as handle
    from scoped_managed_creators mc
      cross join lateral (values
        (mc.account_1), (mc.account_2), (mc.account_3), (mc.account_4), (mc.account_5),
        (mc.account_6), (mc.account_7), (mc.account_8), (mc.account_9), (mc.account_10)
      ) h(handle)
    where h.handle is not null and btrim(h.handle) <> ''
    union all
    select mc.brand, mc.archived_at, mc.reporting_start_date,
           lower(btrim(regexp_replace(t.tiktok_username, '^@', '')))
    from scoped_managed_creators mc
    join scoped_tiktok_accounts t on t.creator_id = mc.creator_id
    where mc.creator_id is not null
      and t.tiktok_username is not null and btrim(t.tiktok_username) <> ''
  ),
  mem as materialized (
    select brand, handle,
           range_agg(case when reporting_start_date >= archived_at::date then 'empty'::daterange else daterange(reporting_start_date, archived_at::date, '[)') end) as managed_days
    from src group by 1, 2
  ),
  present as (
    select distinct m.roster_slug
    from map m
    where exists (
      select 1 from scoped_creator_performance cp
      where cp.brand = m.data_slug and cp.period_type = 'daily'
        and cp.report_date between least(p_start, p_prior_start) and greatest(p_end, p_prior_end)
    )
  ),
  gsum as (
    select m.roster_slug,
      coalesce(sum(cp.gmv) filter (where cp.report_date between p_start and p_end), 0)             as store_cur,
      coalesce(sum(cp.gmv) filter (where cp.report_date between p_prior_start and p_prior_end), 0) as store_pri,
      coalesce(sum(cp.gmv) filter (where cp.report_date between p_start and p_end
        and mm.handle is not null and (mm.managed_days @> cp.report_date)), 0)     as roster_cur,
      coalesce(sum(cp.gmv) filter (where cp.report_date between p_prior_start and p_prior_end
        and mm.handle is not null and (mm.managed_days @> cp.report_date)), 0)     as roster_pri
    from scoped_creator_performance cp
    join map m on m.data_slug = cp.brand
    left join mem mm on mm.brand = m.roster_slug
                    and mm.handle = lower(btrim(regexp_replace(cp.creator_name, '^@', '')))
    where cp.period_type = 'daily'
      and cp.gmv <> 0
      and cp.report_date between least(p_start, p_prior_start) and greatest(p_end, p_prior_end)
    group by 1
  ),
  gmv as (
    select p.roster_slug,
           coalesce(s.store_cur, 0) as store_cur, coalesce(s.store_pri, 0) as store_pri,
           coalesce(s.roster_cur, 0) as roster_cur, coalesce(s.roster_pri, 0) as roster_pri
    from present p left join gsum s on s.roster_slug = p.roster_slug
  ),
  cost as (
    select mc.brand,
           count(*)                                       as signed,
           count(*) filter (where coalesce((agreement.value->>'retainer')::numeric,mc.retainer,0) > 0) as retained,
           coalesce(sum(coalesce((agreement.value->>'retainer')::numeric,mc.retainer,0)), 0)      as committed
    from scoped_managed_creators mc
    left join scoped_brands_v2 ab on ab.slug=mc.brand
    left join lateral (select public.get_creator_agreement_terms(p_tenant_id,mc.creator_id,ab.id,p_end) as value) agreement on true
    where mc.archived_at is null
    group by 1
  ),
  rows as (
    select b.slug, b.name,
           round(g.store_cur, 2)  as store_gmv,
           round(g.store_pri, 2)  as prior_store_gmv,
           round(g.roster_cur, 2) as roster_gmv,
           round(g.roster_pri, 2) as prior_roster_gmv,
           coalesce(c.signed, 0)   as signed,
           coalesce(c.retained, 0) as retained,
           round(coalesce(c.committed, 0), 2) as committed_retainer
    from brand b
    join gmv g on g.roster_slug = b.slug
    left join cost c on c.brand = b.slug
  )
  select jsonb_build_object(
    'brands', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug',              r.slug,
        'name',              r.name,
        'storeGmv',          r.store_gmv,
        'priorStoreGmv',     r.prior_store_gmv,
        'rosterGmv',         r.roster_gmv,
        'priorRosterGmv',    r.prior_roster_gmv,
        'signed',            r.signed,
        'retained',          r.retained,
        'committedRetainer', r.committed_retainer
      ) order by r.roster_gmv desc)
      from rows r
    ), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
        'clients',           count(*) filter (where r.roster_gmv > 0),
        -- A store counts as a client's only in a period we sold in it.
        'storeGmv',          round(coalesce(sum(r.store_gmv)       filter (where r.roster_gmv > 0), 0), 2),
        'priorStoreGmv',     round(coalesce(sum(r.prior_store_gmv) filter (where r.prior_roster_gmv > 0), 0), 2),
        'rosterGmv',         round(sum(r.roster_gmv), 2),
        'priorRosterGmv',    round(sum(r.prior_roster_gmv), 2),
        'signed',            sum(r.signed),
        'retained',          sum(r.retained),
        'committedRetainer', round(sum(r.committed_retainer), 2)
      ) from rows r
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_agency_trend_workspace(p_tenant_id uuid, p_start date, p_end date)
 RETURNS TABLE(roster_slug text, month date, store_gmv numeric, roster_gmv numeric)
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET plan_cache_mode TO 'force_custom_plan'
 SET search_path TO 'public', 'pg_temp'
AS $function$
WITH scoped_brands_v2 AS NOT MATERIALIZED (SELECT * FROM public.brands_v2 WHERE tenant_id = p_tenant_id),
scoped_creator_performance AS NOT MATERIALIZED (SELECT * FROM public.creator_performance WHERE tenant_id = p_tenant_id),
scoped_managed_creators AS NOT MATERIALIZED (SELECT * FROM public.managed_creators WHERE tenant_id = p_tenant_id),
scoped_tiktok_accounts AS NOT MATERIALIZED (SELECT * FROM public.tiktok_accounts WHERE tenant_id = p_tenant_id), brand as (
    select b.id, b.slug
    from scoped_brands_v2 b
    where coalesce(b.is_archived, false) = false and b.parent_brand_id is null
  ),
  map as (
    select b.slug as roster_slug, b.slug as data_slug from brand b
    union
    select p.slug, c.slug from brand p join scoped_brands_v2 c on c.parent_brand_id = p.id
  ),
  src as (
    select mc.brand, mc.archived_at, mc.reporting_start_date,
           lower(btrim(regexp_replace(h.handle, '^@', ''))) as handle
    from scoped_managed_creators mc
      cross join lateral (values
        (mc.account_1), (mc.account_2), (mc.account_3), (mc.account_4), (mc.account_5),
        (mc.account_6), (mc.account_7), (mc.account_8), (mc.account_9), (mc.account_10)
      ) h(handle)
    where h.handle is not null and btrim(h.handle) <> ''
    union all
    select mc.brand, mc.archived_at, mc.reporting_start_date,
           lower(btrim(regexp_replace(t.tiktok_username, '^@', '')))
    from scoped_managed_creators mc
    join scoped_tiktok_accounts t on t.creator_id = mc.creator_id
    where mc.creator_id is not null
      and t.tiktok_username is not null and btrim(t.tiktok_username) <> ''
  ),
  mem as materialized (
    select brand, handle,
           range_agg(case when reporting_start_date >= archived_at::date then 'empty'::daterange else daterange(reporting_start_date, archived_at::date, '[)') end) as managed_days
    from src group by 1, 2
  )
  select m.roster_slug,
         date_trunc('month', cp.report_date)::date as month,
         round(coalesce(sum(cp.gmv), 0), 2) as store_gmv,
         round(coalesce(sum(cp.gmv) filter (where mm.handle is not null
           and (mm.managed_days @> cp.report_date)), 0), 2) as roster_gmv
  from scoped_creator_performance cp
  join map m on m.data_slug = cp.brand
  left join mem mm on mm.brand = m.roster_slug
                  and mm.handle = lower(btrim(regexp_replace(cp.creator_name, '^@', '')))
  where cp.period_type = 'daily'
    and cp.gmv <> 0
    and cp.report_date between p_start and p_end
  group by 1, 2;
$function$;

CREATE OR REPLACE FUNCTION public.get_brand_client_report_agg_workspace(p_tenant_id uuid, p_data_slugs text[], p_roster_slugs text[], p_start date, p_end date, p_prior_start date, p_prior_end date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET plan_cache_mode TO 'force_custom_plan'
 SET search_path TO 'public'
 SET statement_timeout TO '60s'
AS $function$
WITH scoped_creator_performance AS NOT MATERIALIZED (SELECT * FROM public.creator_performance WHERE tenant_id = p_tenant_id),
scoped_video_performance AS NOT MATERIALIZED (SELECT * FROM public.video_performance WHERE tenant_id = p_tenant_id),
scoped_managed_creators AS NOT MATERIALIZED (SELECT * FROM public.managed_creators WHERE tenant_id = p_tenant_id),
scoped_tiktok_accounts AS NOT MATERIALIZED (SELECT * FROM public.tiktok_accounts WHERE tenant_id = p_tenant_id),
scoped_videos AS NOT MATERIALIZED (SELECT * FROM public.videos WHERE tenant_id = p_tenant_id),
report_members as materialized (
 select handle, range_agg(case when reporting_start_date >= archived_at::date then 'empty'::daterange else daterange(reporting_start_date, archived_at::date, '[)') end) as managed_days from (
 select mc.archived_at, mc.reporting_start_date, lower(btrim(regexp_replace(h.handle,'^@',''))) handle
 from scoped_managed_creators mc cross join lateral (values (mc.account_1),(mc.account_2),(mc.account_3),(mc.account_4),(mc.account_5),(mc.account_6),(mc.account_7),(mc.account_8),(mc.account_9),(mc.account_10)) h(handle)
 where (p_roster_slugs is null or mc.brand=any(p_roster_slugs)) and nullif(btrim(h.handle),'') is not null
 union all
 select mc.archived_at, mc.reporting_start_date, lower(btrim(regexp_replace(t.tiktok_username,'^@','')))
 from scoped_managed_creators mc join scoped_tiktok_accounts t on t.creator_id=mc.creator_id
 where (p_roster_slugs is null or mc.brand=any(p_roster_slugs)) and nullif(btrim(t.tiktok_username),'') is not null
 ) s group by handle
 ), scoped_managed_brand_handles AS (SELECT DISTINCT mc.brand AS brand_slug, lower(btrim(regexp_replace(h.handle, '^@', ''))) AS handle FROM scoped_managed_creators mc CROSS JOIN LATERAL (VALUES (mc.account_1), (mc.account_2), (mc.account_3), (mc.account_4), (mc.account_5), (mc.account_6), (mc.account_7), (mc.account_8), (mc.account_9), (mc.account_10)) h(handle) WHERE h.handle IS NOT NULL AND btrim(h.handle) <> '' UNION SELECT DISTINCT mc.brand, lower(btrim(regexp_replace(t.tiktok_username, '^@', ''))) FROM scoped_managed_creators mc JOIN scoped_tiktok_accounts t ON t.creator_id=mc.creator_id WHERE t.tiktok_username IS NOT NULL AND btrim(t.tiktok_username) <> ''), mh AS MATERIALIZED (
    SELECT DISTINCT mp.handle
    FROM scoped_managed_brand_handles mp
    WHERE p_roster_slugs IS NULL OR mp.brand_slug = ANY(p_roster_slugs)
  ),
  cur AS MATERIALIZED (
    SELECT lower(btrim(regexp_replace(cp.creator_name, '^@', ''))) AS handle,
           MAX(cp.creator_name) AS name,
           SUM(cp.gmv)::numeric AS gmv,
           SUM(cp.orders)::bigint AS orders, SUM(cp.items_sold)::bigint AS items,
           SUM(cp.videos)::bigint AS videos,
           SUM(cp.est_commission)::numeric AS commission
    FROM scoped_creator_performance cp
    WHERE cp.period_type = 'daily'
      AND cp.report_date BETWEEN p_start AND p_end
      AND (p_data_slugs IS NULL OR cp.brand = ANY(p_data_slugs))
      AND cp.creator_name IS NOT NULL AND btrim(cp.creator_name) <> ''
    GROUP BY 1
  ),
  cur_m AS MATERIALIZED (
    SELECT coalesce(rm.managed_days @> cp.report_date,false) as is_managed,
           lower(btrim(regexp_replace(cp.creator_name, '^@', ''))) AS handle,
           MAX(cp.creator_name) AS name,
           SUM(cp.gmv)::numeric AS gmv,
           SUM(cp.orders)::bigint AS orders, SUM(cp.items_sold)::bigint AS items,
           SUM(cp.videos)::bigint AS videos,
           SUM(cp.est_commission)::numeric AS commission
    FROM scoped_creator_performance cp
    LEFT JOIN report_members rm ON rm.handle=lower(btrim(regexp_replace(cp.creator_name, '^@', '')))
    WHERE cp.period_type = 'daily'
      AND cp.report_date BETWEEN p_start AND p_end
      AND (p_data_slugs IS NULL OR cp.brand = ANY(p_data_slugs))
      AND cp.creator_name IS NOT NULL AND btrim(cp.creator_name) <> ''
    GROUP BY 1, 2
  ),
  prior AS MATERIALIZED (
    SELECT lower(btrim(regexp_replace(cp.creator_name, '^@', ''))) AS handle,
           SUM(cp.gmv)::numeric AS gmv,
           SUM(cp.orders)::bigint AS orders, SUM(cp.items_sold)::bigint AS items,
           SUM(cp.videos)::bigint AS videos
    FROM scoped_creator_performance cp
    WHERE cp.period_type = 'daily'
      AND cp.report_date BETWEEN p_prior_start AND p_prior_end
      AND (p_data_slugs IS NULL OR cp.brand = ANY(p_data_slugs))
      AND cp.creator_name IS NOT NULL AND btrim(cp.creator_name) <> ''
    GROUP BY 1
  ),
  prior_m AS MATERIALIZED (
    SELECT coalesce(rm.managed_days @> cp.report_date,false) as is_managed,
           lower(btrim(regexp_replace(cp.creator_name, '^@', ''))) AS handle,
           SUM(cp.gmv)::numeric AS gmv,
           SUM(cp.orders)::bigint AS orders, SUM(cp.items_sold)::bigint AS items,
           SUM(cp.videos)::bigint AS videos
    FROM scoped_creator_performance cp
    LEFT JOIN report_members rm ON rm.handle=lower(btrim(regexp_replace(cp.creator_name, '^@', '')))
    WHERE cp.period_type = 'daily'
      AND cp.report_date BETWEEN p_prior_start AND p_prior_end
      AND (p_data_slugs IS NULL OR cp.brand = ANY(p_data_slugs))
      AND cp.creator_name IS NOT NULL AND btrim(cp.creator_name) <> ''
    GROUP BY 1, 2
  ),
  nv AS MATERIALIZED (
    SELECT COUNT(*) FILTER (WHERE p.handle IS NULL AND c.gmv > 0)::bigint                          AS new_count,
           COALESCE(SUM(c.gmv) FILTER (WHERE p.handle IS NULL), 0)::numeric          AS new_gmv,
           COUNT(*) FILTER (WHERE p.handle IS NOT NULL AND c.gmv > 0)::bigint                      AS returning_count,
           COALESCE(SUM(c.gmv) FILTER (WHERE p.handle IS NOT NULL), 0)::numeric      AS returning_gmv,
           (SELECT count(*) FROM cur_m cm WHERE cm.is_managed AND cm.gmv>0 AND NOT EXISTS (SELECT 1 FROM prior pr WHERE pr.handle=cm.handle))::bigint         AS newly_activated
    FROM cur c LEFT JOIN prior p USING (handle)
  ),
  daily AS (
    SELECT cp.report_date AS d,
           SUM(cp.gmv)::numeric AS gmv,
           SUM(cp.orders)::bigint AS orders, SUM(cp.items_sold)::bigint AS items,
           COUNT(DISTINCT lower(btrim(regexp_replace(cp.creator_name, '^@', '')))) FILTER (WHERE cp.gmv > 0)::bigint AS creators
    FROM scoped_creator_performance cp
    WHERE cp.period_type = 'daily'
      AND cp.report_date BETWEEN p_start AND p_end
      AND (p_data_slugs IS NULL OR cp.brand = ANY(p_data_slugs))
    GROUP BY cp.report_date
  ),
  vp_dd AS MATERIALIZED (
    SELECT DISTINCT ON (vp.video_id, vp.product_id, vp.report_date)
           vp.video_id, vp.video_title, vp.creator_name, vp.product_name,
           vp.gmv, vp.orders, vp.brand, vp.report_date,
           lower(btrim(regexp_replace(vp.creator_name, '^@', ''))) AS handle
    FROM scoped_video_performance vp
    WHERE vp.period_type = 'daily'
      AND vp.report_date BETWEEN p_start AND p_end
      AND (p_data_slugs IS NULL OR vp.brand = ANY(p_data_slugs))
    ORDER BY vp.video_id, vp.product_id, vp.report_date, vp.gmv DESC
  ),
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
  managed_vids AS MATERIALIZED (
    SELECT v.video_id,
           (array_agg(v.video_title ORDER BY v.gmv DESC))[1] AS title,
           (array_agg(v.creator_name ORDER BY v.gmv DESC))[1] AS creator,
           (array_agg(v.handle ORDER BY v.gmv DESC))[1] AS handle,
           SUM(v.gmv)::numeric AS gmv, SUM(v.orders)::bigint AS orders,
           true AS is_managed
    FROM vp_dd v JOIN report_members rm ON rm.handle=v.handle AND rm.managed_days @> v.report_date
    WHERE v.video_id IS NOT NULL AND v.video_id <> ''
    GROUP BY v.video_id
    HAVING SUM(v.gmv) > 0
  ),
  vids_url AS MATERIALIZED (
    SELECT vd.*,
           COALESCE(
             (SELECT vv.video_link FROM scoped_videos vv
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
        'gmv', COALESCE(SUM(gmv), 0), 'orders', COALESCE(SUM(orders), 0), 'items', COALESCE(SUM(items), 0),
        'videos', COALESCE(SUM(videos), 0), 'commission', COALESCE(SUM(commission), 0),
        'active_creators', COUNT(*) FILTER (WHERE gmv > 0)) FROM cur),
    'prior_totals', (SELECT jsonb_build_object(
        'gmv', COALESCE(SUM(gmv), 0), 'orders', COALESCE(SUM(orders), 0), 'items', COALESCE(SUM(items), 0),
        'videos', COALESCE(SUM(videos), 0), 'active_creators', COUNT(*) FILTER (WHERE gmv > 0)) FROM prior),
    'managed', (SELECT jsonb_build_object(
        'gmv', COALESCE(SUM(gmv), 0), 'orders', COALESCE(SUM(orders), 0), 'items', COALESCE(SUM(items), 0),
        'videos', COALESCE(SUM(videos), 0), 'commission', COALESCE(SUM(commission), 0),
        'creators', COUNT(*) FILTER (WHERE gmv > 0)) FROM cur_m WHERE is_managed),
    'organic', (SELECT jsonb_build_object(
        'gmv', COALESCE(SUM(gmv), 0), 'orders', COALESCE(SUM(orders), 0), 'items', COALESCE(SUM(items), 0),
        'creators', COUNT(*) FILTER (WHERE gmv > 0)) FROM cur_m WHERE NOT is_managed),
    -- videos added here: the only change from mig 096.
    'managed_prior', (SELECT jsonb_build_object(
        'gmv', COALESCE(SUM(gmv), 0), 'orders', COALESCE(SUM(orders), 0), 'items', COALESCE(SUM(items), 0),
        'videos', COALESCE(SUM(videos), 0),
        'creators', COUNT(*) FILTER (WHERE gmv > 0)) FROM prior_m WHERE is_managed),
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
        SELECT c.name, c.gmv, c.orders, c.videos FROM cur c ORDER BY c.gmv DESC LIMIT 10) t),
    'managed_top_creators', (SELECT COALESCE(jsonb_agg(t ORDER BY t.gmv DESC), '[]'::jsonb) FROM (
        SELECT c.name, c.gmv, c.orders, c.videos FROM cur_m c WHERE c.is_managed ORDER BY c.gmv DESC LIMIT 5) t),
    'top_videos', (SELECT COALESCE(jsonb_agg(t ORDER BY t.gmv DESC), '[]'::jsonb) FROM (
        SELECT vu.title, vu.creator, vu.gmv, vu.orders, vu.url FROM vids_url vu ORDER BY vu.gmv DESC LIMIT 10) t),
    'managed_top_videos', (SELECT COALESCE(jsonb_agg(t ORDER BY t.gmv DESC), '[]'::jsonb) FROM (
        SELECT vu.title, vu.creator, vu.gmv, vu.orders,
        coalesce((SELECT vv.video_link FROM scoped_videos vv WHERE vv.video_id=vu.video_id AND vv.video_link ILIKE '%tiktok.com%' ORDER BY vv.post_date DESC NULLS LAST LIMIT 1),
        'https://www.tiktok.com/@' || vu.handle || '/video/' || vu.video_id) as url
        FROM managed_vids vu ORDER BY vu.gmv DESC LIMIT 5) t),
    'top_products', (SELECT COALESCE(jsonb_agg(t ORDER BY t.gmv DESC), '[]'::jsonb) FROM (
        SELECT p.name, p.gmv, p.orders FROM prods p ORDER BY p.gmv DESC LIMIT 10) t),
    'product_creators', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'product', pc.product, 'name', pc.name, 'gmv', pc.gmv)), '[]'::jsonb) FROM prod_creators pc)
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_brand_client_report_counts_workspace(p_tenant_id uuid, p_data_slugs text[], p_roster_slugs text[], p_start date, p_end date, p_prior_start date, p_prior_end date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET plan_cache_mode TO 'force_custom_plan'
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '60s'
AS $function$
WITH scoped_creator_performance AS NOT MATERIALIZED (SELECT * FROM public.creator_performance WHERE tenant_id = p_tenant_id),
scoped_video_performance AS NOT MATERIALIZED (SELECT * FROM public.video_performance WHERE tenant_id = p_tenant_id),
scoped_managed_creators AS NOT MATERIALIZED (SELECT * FROM public.managed_creators WHERE tenant_id = p_tenant_id),
scoped_tiktok_accounts AS NOT MATERIALIZED (SELECT * FROM public.tiktok_accounts WHERE tenant_id = p_tenant_id), src as (
    select mc.id, mc.archived_at, mc.reporting_start_date, mc.employment_status,
           lower(btrim(regexp_replace(h.handle, '^@', ''))) as handle
    from scoped_managed_creators mc
      cross join lateral (values
        (mc.account_1), (mc.account_2), (mc.account_3), (mc.account_4), (mc.account_5),
        (mc.account_6), (mc.account_7), (mc.account_8), (mc.account_9), (mc.account_10)
      ) h(handle)
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and h.handle is not null and btrim(h.handle) <> ''
    union all
    select mc.id, mc.archived_at, mc.reporting_start_date, mc.employment_status,
           lower(btrim(regexp_replace(t.tiktok_username, '^@', '')))
    from scoped_managed_creators mc
    join scoped_tiktok_accounts t on t.creator_id = mc.creator_id
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and mc.creator_id is not null
      and t.tiktok_username is not null and btrim(t.tiktok_username) <> ''
  ),
  mem as materialized (
    select handle,
           range_agg(case when reporting_start_date >= archived_at::date then 'empty'::daterange else daterange(reporting_start_date, archived_at::date, '[)') end) as managed_days
    from src group by 1
  ),
  posts as materialized (
    select vp.video_id, vp.post_date::date as posted,
           lower(btrim(regexp_replace(vp.creator_name, '^@', ''))) as handle
    from scoped_video_performance vp
    where vp.period_type = 'daily'
      and vp.video_id is not null and vp.video_id <> ''
      and vp.post_date is not null
      and (p_data_slugs is null or vp.brand = any(p_data_slugs))
      and vp.post_date::date between least(p_prior_start, p_start) and greatest(p_prior_end, p_end)
    group by 1, 2, 3
  ),
  roster_posts as materialized (
    select p.*
    from posts p
    join mem m on m.handle = p.handle
    where m.managed_days @> p.posted
  ),
  ppl as materialized (
    select distinct s.id, s.handle
    from src s
    where s.employment_status = 'active'
      and s.archived_at is null
      and (s.reporting_start_date is null or s.reporting_start_date <= p_end)
  ),
  cp_agg as materialized (
    select lower(btrim(regexp_replace(cp.creator_name, '^@', ''))) as handle,
           coalesce(sum(cp.gmv) filter (where cp.report_date between p_start and p_end), 0)             as cur_gmv,
           coalesce(sum(cp.gmv) filter (where cp.report_date between p_prior_start and p_prior_end), 0) as pri_gmv,
           coalesce(sum(cp.gmv) filter (where cp.report_date between p_start and p_end and m.managed_days @> cp.report_date),0) as managed_cur_gmv,
           coalesce(sum(cp.gmv) filter (where cp.report_date between p_prior_start and p_prior_end and m.managed_days @> cp.report_date),0) as managed_pri_gmv
    from scoped_creator_performance cp
    left join mem m on m.handle = lower(btrim(regexp_replace(cp.creator_name, '^@', '')))
    where cp.period_type = 'daily'
      and (p_data_slugs is null or cp.brand = any(p_data_slugs))
      and cp.report_date between least(p_prior_start, p_start) and greatest(p_prior_end, p_end)
      and cp.creator_name is not null and btrim(cp.creator_name) <> ''
    group by 1
  ),
  post_agg as materialized (
    select handle,
           count(*) filter (where posted between p_start and p_end)             as cur_posts,
           count(*) filter (where posted between p_prior_start and p_prior_end) as pri_posts
    from roster_posts group by handle
  ),
  -- POSTED and SOLD are tracked separately. `active_cur` (posted OR sold) is
  -- kept only so activePeople does not move under callers still reading it;
  -- the report itself now prints the two halves.
  act as materialized (
    select p.id,
           bool_or(coalesce(a.managed_cur_gmv,0) > 0 or coalesce(pa.cur_posts,0) > 0) as active_cur,
           bool_or(coalesce(a.managed_pri_gmv,0) > 0 or coalesce(pa.pri_posts,0) > 0) as active_prior,
           bool_or(coalesce(pa.cur_posts,0) > 0)                              as posted_cur,
           bool_or(coalesce(pa.pri_posts,0) > 0)                              as posted_pri,
           bool_or(coalesce(a.managed_cur_gmv,0)   > 0)                               as sold_cur
    from ppl p
    left join cp_agg   a  on a.handle  = p.handle
    left join post_agg pa on pa.handle = p.handle
    group by p.id
  ),
  -- Roster rows archived DURING the window, person grain. A creator re-signed
  -- under a second still-active row has not left.
  departed as (
    select count(*) as n
    from (
      select mc.id
      from scoped_managed_creators mc
      where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
        and mc.archived_at is not null
        and mc.archived_at::date between p_start and p_end
      except
      select mc2.id
      from scoped_managed_creators mc2
      where (p_roster_slugs is null or mc2.brand = any(p_roster_slugs))
        and mc2.archived_at is null
    ) d
  )
  select jsonb_build_object(
    'signedPeople',      (select count(*) from act),
    'activePeople',      (select count(*) from act where active_cur),
    'activePeoplePrior', (select count(*) from act where active_prior),
    'newlyActivePeople', (select count(*) from act where active_cur and not active_prior),
    'rosterPosts',       (select count(*) from roster_posts where posted between p_start and p_end),
    'rosterPostsPrior',  (select count(*) from roster_posts where posted between p_prior_start and p_prior_end),
    'storePosts',        (select count(*) from posts where posted between p_start and p_end),
    'storePostsPrior',   (select count(*) from posts where posted between p_prior_start and p_prior_end),
    'rosterPosted',        (select count(*) from act where posted_cur),
    'rosterPostedPrior',   (select count(*) from act where posted_pri),
    'rosterSold',          (select count(*) from act where sold_cur),
    'rosterSoldNotPosted', (select count(*) from act where sold_cur and not posted_cur),
    'rosterDeparted',      (select n from departed),
    'storeCreatorsPosted', (select count(distinct handle) from posts
                             where posted between p_start and p_end),
    'storeCreatorsSold',   (select count(*) from cp_agg where cur_gmv > 0)
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_brand_client_report_granular_workspace(p_tenant_id uuid, p_data_slugs text[], p_roster_slugs text[], p_start date, p_end date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET plan_cache_mode TO 'force_custom_plan'
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '60s'
AS $function$
WITH scoped_brands_v2 AS NOT MATERIALIZED (SELECT * FROM public.brands_v2 WHERE tenant_id = p_tenant_id),
scoped_managed_creators AS NOT MATERIALIZED (SELECT * FROM public.managed_creators WHERE tenant_id = p_tenant_id),
scoped_tiktok_accounts AS NOT MATERIALIZED (SELECT * FROM public.tiktok_accounts WHERE tenant_id = p_tenant_id),
scoped_daily_video_product_stats AS NOT MATERIALIZED (SELECT * FROM public.daily_video_product_stats WHERE tenant_id = p_tenant_id), roster as (
    select mc.id,
           agreement.value as agreement,
           mc.creator_id,
           nullif(trim(mc.real_name), '')                          as real_name,
           coalesce(nullif(trim(mc.real_name), ''), mc.account_1)  as display_name,
           nullif(trim(mc.role), '')                               as role,
           coalesce((agreement.value->>'retainer')::numeric,rasof.retainer, 0)::numeric                    as retainer,
           (agreement.value is not null or coalesce(rasof.is_exact, true))                          as retainer_exact,
           case when coalesce((agreement.value->>'retainer')::numeric,rasof.retainer, 0) > 0
                then case when agreement.value is not null then (agreement.value->>'quota')::integer else nullif(mc.monthly_post_requirement, 0) end end    as quota,
           mc.archived_at::date                                    as archived_on,
           mc.cc_start_date                                        as cc_start_date,
           mc.reporting_start_date,
           array_remove(array[
             lower(trim(replace(mc.account_1 , '@',''))), lower(trim(replace(mc.account_2 , '@',''))),
             lower(trim(replace(mc.account_3 , '@',''))), lower(trim(replace(mc.account_4 , '@',''))),
             lower(trim(replace(mc.account_5 , '@',''))), lower(trim(replace(mc.account_6 , '@',''))),
             lower(trim(replace(mc.account_7 , '@',''))), lower(trim(replace(mc.account_8 , '@',''))),
             lower(trim(replace(mc.account_9 , '@',''))), lower(trim(replace(mc.account_10, '@','')))
           ], null)                                                as col_handles
    from scoped_managed_creators mc
    left join lateral public.get_retainer_as_of(array[mc.id], p_end) rasof on true
    left join scoped_brands_v2 agreement_brand on agreement_brand.slug=mc.brand
    left join lateral (select public.get_creator_agreement_terms(p_tenant_id,mc.creator_id,agreement_brand.id,p_end) as value) agreement on true
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and mc.employment_status = 'active'
      and (mc.reporting_start_date is null or mc.reporting_start_date <= p_end)
      and (mc.archived_at is null or mc.archived_at::date > p_start)
  ),
  roster_current as (select * from roster where archived_on is null),
  handle_src as (
    select r.id, r.archived_on, r.reporting_start_date, r.creator_id, hh.handle
    from roster r, unnest(r.col_handles) as hh(handle)
    where hh.handle <> ''
    union all
    select r.id, r.archived_on, r.reporting_start_date, r.creator_id,
           lower(btrim(regexp_replace(t.tiktok_username, '^@', '')))
    from roster r
    join scoped_tiktok_accounts t on t.creator_id = r.creator_id
    where r.creator_id is not null
      and t.tiktok_username is not null and btrim(t.tiktok_username) <> ''
  ),
  handles_by_creator as (
    select id, array_agg(distinct handle order by handle) as handles
    from handle_src group by id
  ),
  roster_handles as (
    select distinct handle, id, archived_on, reporting_start_date, creator_id
    from handle_src
  ),
  facts as (
    select dv.video_id,
           dv.post_date,
           coalesce(dv.gmv, 0)::numeric   as gmv,
           coalesce(dv.orders, 0)::bigint as orders,
           dv.items_sold as units,
           rh.id                          as creator_id,
           rh.handle                      as handle
    from scoped_daily_video_product_stats dv
    join scoped_brands_v2 b on b.id = dv.brand_id
    left join lateral (
      select h.id, h.handle from roster_handles h
      where h.handle = lower(trim(replace(dv.tiktok_username, '@','')))
        and (h.archived_on is null or dv.report_date < h.archived_on)
        and (h.reporting_start_date is null or dv.report_date >= h.reporting_start_date)
      order by (h.archived_on is null) desc, (h.creator_id is not null) desc, h.id
      limit 1
    ) rh on true
    where (p_data_slugs is null or b.slug = any(p_data_slugs))
      and dv.report_date between p_start and p_end
  ),
  roster_facts as (select * from facts where creator_id is not null),
  top_handle as (
    select distinct on (creator_id) creator_id, handle
    from (select creator_id, handle, sum(gmv) as gmv
          from roster_facts group by 1,2) t
    order by creator_id, gmv desc, handle
  ),
  per_creator as (
    select f.creator_id,
           count(distinct f.video_id) filter (where f.post_date::date between p_start and p_end and (r.reporting_start_date is null or f.post_date::date >= r.reporting_start_date)) as posts_published,
           count(distinct f.video_id)                                                            as videos_earning,
           sum(f.gmv)                                                                            as gmv,
           sum(f.orders)                                                                         as orders,
           case when count(f.units)=count(*) then sum(f.units) end as units,
           sum(f.gmv) filter (where f.post_date::date between p_start and p_end)                 as window_post_gmv,
           sum(f.gmv) filter (where r.cc_start_date is null
                                 or f.post_date::date >= r.cc_start_date)                        as net_new_gmv
    from roster_facts f
    join roster r on r.id = f.creator_id
    group by f.creator_id
  ),
  vintage as (
    select date_trunc('month', post_date)::date as posted_month,
           count(distinct video_id)             as videos,
           sum(gmv)                             as gmv
    from roster_facts
    group by 1
  ),
  /* Video GMV bucketed by AGE, not calendar month. Age is measured back from
     the window END, never from today: a frozen report must give the same
     answer forever. VIDEO GMV ONLY -- live and product-card GMV carry no post
     date and are never apportioned across these buckets. */
  vintage_age as (
    select case
             when post_date is null             then 'unknown'
             when post_date::date >  p_end - 30 then 'd0_30'
             when post_date::date >  p_end - 60 then 'd30_60'
             when post_date::date >  p_end - 90 then 'd60_90'
             when post_date::date > p_end - 180 then 'd90_180'
             else                                    'd180_plus'
           end                      as bucket,
           count(distinct video_id) as videos,
           sum(gmv)                 as gmv
    from roster_facts
    group by 1
  ),
  top3 as (
    select posted_month from vintage
    where posted_month is not null
    order by posted_month desc
    limit 3
  )

  select jsonb_build_object(
    'roster', (
      select jsonb_build_object(
        'signed',                count(*),
        'onRetainer',            count(*) filter (where retainer > 0),
        'affiliateOnly',         count(*) filter (where retainer = 0),
        'monthlyRetainerBudget', coalesce(sum(retainer), 0),
        'retainerHistoryExact',  coalesce(bool_and(retainer_exact) filter (where retainer > 0), true),
        -- Share of RETAINED creators carrying a level, so the renderer can
        -- decide whether the column is worth showing at all.
        'roleCoverage',          case when count(*) filter (where retainer > 0) = 0 then 0
                                      else round(100.0 * count(*) filter (where retainer > 0 and role is not null)
                                                 / count(*) filter (where retainer > 0)) end
      ) from roster_current
    ),

    'videoCounts', (
      select jsonb_build_object(
        'postsPublished', coalesce(count(distinct video_id) filter (where post_date::date between p_start and p_end), 0),
        'videosEarning',  coalesce(count(distinct video_id), 0)
      ) from roster_facts
    ),

    'newVideo', (
      select jsonb_build_object(
        'gmv30d',    coalesce(sum(gmv)                   filter (where post_date::date > p_end - 30), 0),
        'videos30d', coalesce(count(distinct video_id)   filter (where post_date::date > p_end - 30), 0),
        'totalGmv',  coalesce(sum(gmv), 0),
        'unknownPostDateGmv', coalesce(sum(gmv) filter (where post_date is null), 0)
      ) from roster_facts
    ),

    'vintage', coalesce((
      select jsonb_agg(jsonb_build_object(
               'label',  to_char(v.posted_month, 'Mon YYYY'),
               'videos', v.videos,
               'gmv',    v.gmv
             ) order by v.posted_month desc)
      from vintage v
      where v.posted_month in (select posted_month from top3)
    ), '[]'::jsonb),

    'vintageOlder', (
      select jsonb_build_object(
        'videos', coalesce(sum(videos), 0),
        'gmv',    coalesce(sum(gmv), 0)
      )
      from vintage
      where posted_month is null
         or posted_month < (select min(posted_month) from top3)
    ),

    'netNew', (
      select jsonb_build_object(
        'netNewGmv',  coalesce(sum(pc.net_new_gmv), 0),
        'preCcGmv',   coalesce(sum(pc.gmv) - sum(pc.net_new_gmv), 0),
        'totalGmv',   coalesce(sum(pc.gmv), 0)
      ) from per_creator pc
    ),

    /* All five keys always, so the renderer never has to guess whether a
       missing key means zero or means "not computed". */
    'vintageAge', (
      select jsonb_build_object(
        'd0_30',    jsonb_build_object('videos', coalesce(sum(videos) filter (where bucket = 'd0_30'),    0), 'gmv', coalesce(sum(gmv) filter (where bucket = 'd0_30'),    0)),
        'd30_60',   jsonb_build_object('videos', coalesce(sum(videos) filter (where bucket = 'd30_60'),   0), 'gmv', coalesce(sum(gmv) filter (where bucket = 'd30_60'),   0)),
        'd60_90',   jsonb_build_object('videos', coalesce(sum(videos) filter (where bucket = 'd60_90'),   0), 'gmv', coalesce(sum(gmv) filter (where bucket = 'd60_90'),   0)),
        'd90_plus', jsonb_build_object('videos', coalesce(sum(videos) filter (where bucket in ('d90_180','d180_plus')), 0), 'gmv', coalesce(sum(gmv) filter (where bucket in ('d90_180','d180_plus')), 0)),
        'd90_180', jsonb_build_object('videos', coalesce(sum(videos) filter (where bucket = 'd90_180'),0), 'gmv', coalesce(sum(gmv) filter (where bucket = 'd90_180'),0)),
        'd180_plus', jsonb_build_object('videos', coalesce(sum(videos) filter (where bucket = 'd180_plus'),0), 'gmv', coalesce(sum(gmv) filter (where bucket = 'd180_plus'),0)),
        'unknown',  jsonb_build_object('videos', coalesce(sum(videos) filter (where bucket = 'unknown'),  0), 'gmv', coalesce(sum(gmv) filter (where bucket = 'unknown'),  0))
      )
      from vintage_age
    ),

    'creators', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name',           r.display_name,
               'creatorId',      r.creator_id,
               'agreement',      case when r.agreement is null then null else r.agreement || jsonb_build_object(
                  'reportPeriodComparable', coalesce(
                    (r.agreement->>'periodStart')::date=p_start
                    and (r.agreement->>'periodEnd')::date=(date_trunc('month',p_start)+interval '1 month - 1 day')::date
                    and p_end<=(r.agreement->>'periodEnd')::date
                    and not coalesce((r.agreement->'snapshot'->>'paymentReviewRequired')::boolean,true)
                    and jsonb_array_length(r.agreement->'snapshot'->'segments')=1
                    and r.agreement->'snapshot'->'segments'->0->'terms'->>'payment'='prorated_posts',false)
                ) end,
               'realName',       r.real_name,
               'role',           r.role,
               'handle',         coalesce(th.handle, hc.handles[1], r.col_handles[1]),
               'handles',        coalesce(to_jsonb(hc.handles), '[]'::jsonb),
               'handleCount',    coalesce(array_length(hc.handles, 1), 0),
               'isAffiliate',    r.retainer = 0,
               'retainer',       case when r.archived_on is null then r.retainer else 0 end,
               'quota',          case when r.archived_on is null then r.quota end,
               'departed',       r.archived_on is not null,
               'postsPublished', coalesce(pc.posts_published, 0),
               'videosEarning',  coalesce(pc.videos_earning, 0),
               'gmv',            coalesce(pc.gmv, 0),
               'windowPostGmv',  coalesce(pc.window_post_gmv, 0),
               'netNewGmv',      coalesce(pc.net_new_gmv, 0),
               'ccStartDate',    r.cc_start_date,
               'orders',         coalesce(pc.orders, 0),
               'units',          case when pc.creator_id is null then 0 else pc.units end
             ) order by coalesce(pc.gmv, 0) desc, r.display_name)
      from roster r
      left join per_creator pc on pc.creator_id = r.id
      left join top_handle  th on th.creator_id = r.id
      left join handles_by_creator hc on hc.id = r.id
    ), '[]'::jsonb)
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_brand_client_report_managed_split_workspace(p_tenant_id uuid, p_data_slugs text[], p_roster_slugs text[], p_start date, p_end date, p_prior_start date, p_prior_end date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET plan_cache_mode TO 'force_custom_plan'
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '60s'
AS $function$
WITH scoped_creator_performance AS NOT MATERIALIZED (SELECT * FROM public.creator_performance WHERE tenant_id = p_tenant_id),
scoped_managed_creators AS NOT MATERIALIZED (SELECT * FROM public.managed_creators WHERE tenant_id = p_tenant_id),
scoped_tiktok_accounts AS NOT MATERIALIZED (SELECT * FROM public.tiktok_accounts WHERE tenant_id = p_tenant_id), src as (
    select mc.id, mc.archived_at, mc.reporting_start_date,
           lower(btrim(regexp_replace(h.handle, '^@', ''))) as handle
    from scoped_managed_creators mc
      cross join lateral (values
        (mc.account_1), (mc.account_2), (mc.account_3), (mc.account_4), (mc.account_5),
        (mc.account_6), (mc.account_7), (mc.account_8), (mc.account_9), (mc.account_10)
      ) h(handle)
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and h.handle is not null and btrim(h.handle) <> ''
    union all
    select mc.id, mc.archived_at, mc.reporting_start_date,
           lower(btrim(regexp_replace(t.tiktok_username, '^@', '')))
    from scoped_managed_creators mc
    join scoped_tiktok_accounts t on t.creator_id = mc.creator_id
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and mc.creator_id is not null
      and t.tiktok_username is not null and btrim(t.tiktok_username) <> ''
  ),
  mem as materialized (
    select handle,
           range_agg(case when reporting_start_date >= archived_at::date then 'empty'::daterange else daterange(reporting_start_date, archived_at::date, '[)') end) as managed_days
    from src group by 1
  ),
  per_handle as materialized (
    select lower(btrim(regexp_replace(cp.creator_name, '^@', ''))) as handle,
           (cp.report_date between p_start       and p_end)        as in_cur,
           (cp.report_date between p_prior_start and p_prior_end)  as in_pri,
           (m.handle is not null
             and (m.managed_days @> cp.report_date)) as is_managed,
           sum(cp.gmv)::numeric                           as gmv,
           sum(coalesce(cp.items_sold, 0))::bigint as items, sum(cp.orders)::bigint                         as orders,
           sum(cp.est_commission)::numeric                as commission,
           sum(coalesce(cp.video_gmv, 0))::numeric        as video_gmv,
           sum(coalesce(cp.live_gmv, 0))::numeric         as live_gmv,
           sum(coalesce(cp.product_card_gmv, 0))::numeric as card_gmv,
           sum(coalesce(cp.live_streams, 0))::bigint      as live_streams
    from scoped_creator_performance cp
    left join mem m
      on m.handle = lower(btrim(regexp_replace(cp.creator_name, '^@', '')))
    where cp.period_type = 'daily'
      and (p_data_slugs is null or cp.brand = any(p_data_slugs))
      and cp.report_date between least(p_start, p_prior_start) and greatest(p_end, p_prior_end)
      and cp.creator_name is not null and btrim(cp.creator_name) <> ''
    group by 1, 2, 3, 4
  ),
  agg as (
    select
      coalesce(sum(gmv)        filter (where in_cur and is_managed), 0)      as m_gmv,
      coalesce(sum(orders)     filter (where in_cur and is_managed), 0)      as m_orders, coalesce(sum(items) filter (where in_cur and is_managed), 0) as m_items,
      coalesce(sum(commission) filter (where in_cur and is_managed), 0)      as m_comm,
      count(distinct handle)   filter (where in_cur and is_managed)          as m_creators,
      coalesce(sum(gmv)        filter (where in_cur and not is_managed), 0)  as o_gmv,
      coalesce(sum(orders)     filter (where in_cur and not is_managed), 0)  as o_orders,
      count(distinct handle)   filter (where in_cur and not is_managed)      as o_creators,
      coalesce(sum(gmv)        filter (where in_pri and is_managed), 0)      as p_gmv,
      coalesce(sum(orders)     filter (where in_pri and is_managed), 0)      as p_orders, coalesce(sum(items) filter (where in_pri and is_managed), 0) as p_items,
      count(distinct handle)   filter (where in_pri and is_managed)          as p_creators,
      coalesce(sum(video_gmv)    filter (where in_cur and is_managed), 0)    as m_video,
      coalesce(sum(live_gmv)     filter (where in_cur and is_managed), 0)    as m_live,
      coalesce(sum(card_gmv)     filter (where in_cur and is_managed), 0)    as m_card,
      coalesce(sum(live_streams) filter (where in_cur and is_managed), 0)    as m_streams,
      coalesce(sum(video_gmv)    filter (where in_cur), 0)                   as s_video,
      coalesce(sum(live_gmv)     filter (where in_cur), 0)                   as s_live,
      coalesce(sum(card_gmv)     filter (where in_cur), 0)                   as s_card,
      coalesce(sum(live_streams) filter (where in_cur), 0)                   as s_streams
    from per_handle
  ),
  top_live as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'handle', handle, 'liveGmv', live_gmv, 'lives', live_streams
           ) order by live_gmv desc), '[]'::jsonb) as j
    from (
      select handle,
             sum(live_gmv)     as live_gmv,
             sum(live_streams) as live_streams
      from per_handle
      where in_cur and is_managed
      group by handle
      having sum(live_gmv) > 0
      order by 2 desc
      limit 6
    ) t
  )
  select jsonb_build_object(
    'managed', jsonb_build_object(
      'gmv', m_gmv, 'orders', m_orders, 'items', m_items, 'commission', m_comm, 'creators', m_creators
    ),
    'organic', jsonb_build_object(
      'gmv', o_gmv, 'orders', o_orders, 'creators', o_creators
    ),
    'managed_prior', jsonb_build_object(
      'gmv', p_gmv, 'orders', p_orders, 'items', p_items, 'creators', p_creators
    ),
    'channels', jsonb_build_object(
      'rosterVideoGmv', m_video, 'rosterLiveGmv', m_live,
      'rosterCardGmv',  m_card,  'rosterLiveStreams', m_streams,
      'storeVideoGmv',  s_video, 'storeLiveGmv',  s_live,
      'storeCardGmv',   s_card,  'storeLiveStreams',  s_streams
    ),
    'top_live', (select j from top_live)
  )
  from agg;
$function$;

CREATE OR REPLACE FUNCTION public.get_brand_client_report_movers_workspace(p_tenant_id uuid, p_data_slugs text[], p_roster_slugs text[], p_start date, p_end date, p_prior_start date, p_prior_end date, p_limit integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET plan_cache_mode TO 'force_custom_plan'
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '60s'
AS $function$
WITH scoped_creator_performance AS NOT MATERIALIZED (SELECT * FROM public.creator_performance WHERE tenant_id = p_tenant_id),
scoped_managed_creators AS NOT MATERIALIZED (SELECT * FROM public.managed_creators WHERE tenant_id = p_tenant_id),
scoped_tiktok_accounts AS NOT MATERIALIZED (SELECT * FROM public.tiktok_accounts WHERE tenant_id = p_tenant_id), src as (
    select mc.id, mc.archived_at, mc.reporting_start_date,
           nullif(btrim(mc.real_name), '') as real_name,
           lower(btrim(regexp_replace(h.handle, '^@', ''))) as handle
    from scoped_managed_creators mc
      cross join lateral (values
        (mc.account_1), (mc.account_2), (mc.account_3), (mc.account_4), (mc.account_5),
        (mc.account_6), (mc.account_7), (mc.account_8), (mc.account_9), (mc.account_10)
      ) h(handle)
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and h.handle is not null and btrim(h.handle) <> ''
    union all
    select mc.id, mc.archived_at, mc.reporting_start_date, nullif(btrim(mc.real_name), ''),
           lower(btrim(regexp_replace(t.tiktok_username, '^@', '')))
    from scoped_managed_creators mc
    join scoped_tiktok_accounts t on t.creator_id = mc.creator_id
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and mc.creator_id is not null
      and t.tiktok_username is not null and btrim(t.tiktok_username) <> ''
  ),
  mem as materialized (
    select handle,
           range_agg(case when reporting_start_date >= archived_at::date then 'empty'::daterange else daterange(reporting_start_date, archived_at::date, '[)') end) as managed_days,
           -- One name per handle so the lookup cannot multiply rows.
           (array_agg(real_name) filter (where real_name is not null))[1] as real_name
    from src group by 1
  ),
  per_handle as (
    select lower(btrim(regexp_replace(cp.creator_name, '^@', ''))) as handle,
           sum(cp.gmv) filter (where cp.report_date between p_start and p_end)::numeric             as cur,
           sum(cp.gmv) filter (where cp.report_date between p_prior_start and p_prior_end)::numeric as pri
    from scoped_creator_performance cp
    join mem m
      on m.handle = lower(btrim(regexp_replace(cp.creator_name, '^@', '')))
     -- Membership on the ROW's date, not today.
     and (m.managed_days @> cp.report_date)
    where cp.period_type = 'daily'
      and (p_data_slugs is null or cp.brand = any(p_data_slugs))
      and cp.report_date between least(p_start, p_prior_start) and greatest(p_end, p_prior_end)
      and cp.creator_name is not null and btrim(cp.creator_name) <> ''
    group by 1
  ),
  moved as (
    select ph.handle,
           m.real_name,
           coalesce(ph.cur, 0) as cur,
           coalesce(ph.pri, 0) as pri,
           coalesce(ph.cur, 0) - coalesce(ph.pri, 0) as change
    from per_handle ph
    left join mem m on m.handle = ph.handle
    where coalesce(ph.cur, 0) > 0 or coalesce(ph.pri, 0) > 0
  )
  select jsonb_build_object(
    -- The two forces, kept apart.
    'gained',       coalesce((select sum(change) from moved where change > 0), 0),
    'lost',         coalesce((select sum(change) from moved where change < 0), 0),
    'netChange',    coalesce((select sum(change) from moved), 0),
    'started',      (select count(*) from moved where pri = 0 and cur > 0),
    'stopped',      (select count(*) from moved where cur = 0 and pri > 0),
    'movers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'handle', handle,
               'name',   real_name,
               'cur',    cur,
               'prior',  pri,
               'change', change,
               -- 'new' and 'stopped' are facts about presence, not a % of zero.
               'movement', case when pri = 0 and cur > 0 then 'new'
                                when cur = 0 and pri > 0 then 'stopped'
                                else 'changed' end
             ) order by abs(change) desc)
      from (select * from moved order by abs(change) desc limit greatest(coalesce(p_limit, 8), 1)) t
    ), '[]'::jsonb)
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_brand_roster_weekly_workspace(p_tenant_id uuid, p_data_slugs text[], p_roster_slugs text[], p_through date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET plan_cache_mode TO 'force_custom_plan'
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '60s'
AS $function$
WITH scoped_creator_performance AS NOT MATERIALIZED (SELECT * FROM public.creator_performance WHERE tenant_id = p_tenant_id),
scoped_managed_creators AS NOT MATERIALIZED (SELECT * FROM public.managed_creators WHERE tenant_id = p_tenant_id),
scoped_tiktok_accounts AS NOT MATERIALIZED (SELECT * FROM public.tiktok_accounts WHERE tenant_id = p_tenant_id), src as (
    select mc.id, mc.archived_at, mc.reporting_start_date,
           lower(btrim(regexp_replace(h.handle, '^@', ''))) as handle
    from scoped_managed_creators mc
      cross join lateral (values
        (mc.account_1), (mc.account_2), (mc.account_3), (mc.account_4), (mc.account_5),
        (mc.account_6), (mc.account_7), (mc.account_8), (mc.account_9), (mc.account_10)
      ) h(handle)
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and h.handle is not null and btrim(h.handle) <> ''
    union all
    select mc.id, mc.archived_at, mc.reporting_start_date,
           lower(btrim(regexp_replace(t.tiktok_username, '^@', '')))
    from scoped_managed_creators mc
    join scoped_tiktok_accounts t on t.creator_id = mc.creator_id
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and mc.creator_id is not null
      and t.tiktok_username is not null and btrim(t.tiktok_username) <> ''
  ),
  mem as materialized (
    select handle,
           range_agg(case when reporting_start_date >= archived_at::date then 'empty'::daterange else daterange(reporting_start_date, archived_at::date, '[)') end) as managed_days
    from src group by 1
  ),
  per as materialized (
    select ((p_through - cp.report_date) / 7)::int as wk,
           (m.handle is not null
             and (m.managed_days @> cp.report_date)) as is_managed,
           sum(cp.gmv)::numeric as gmv
    from scoped_creator_performance cp
    left join mem m
      on m.handle = lower(btrim(regexp_replace(cp.creator_name, '^@', '')))
    where cp.period_type = 'daily'
      and (p_data_slugs is null or cp.brand = any(p_data_slugs))
      and cp.report_date between p_through - 83 and p_through
      and cp.creator_name is not null and btrim(cp.creator_name) <> ''
    group by 1, 2
  ),
  wk as (
    select wk,
           coalesce(sum(gmv) filter (where is_managed), 0)::numeric as roster_gmv,
           coalesce(sum(gmv), 0)::numeric                           as store_gmv
    from per
    where wk between 0 and 11
    group by 1
  )
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'week_end',   (p_through - wk.wk * 7),
      'roster_gmv', wk.roster_gmv,
      'store_gmv',  wk.store_gmv
    ) order by wk.wk desc), '[]'::jsonb)
  from wk;
$function$;
