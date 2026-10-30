-- A report can freeze the complete identity set behind "Videos published".
-- Canonical mode mirrors get_published_video_counts_workspace eligibility;
-- reconstruction mode uses only explicitly frozen handles and data stores.
-- No report snapshots or source facts are modified by this service-only read.
CREATE FUNCTION public.get_report_published_video_evidence_workspace(
  p_tenant_id uuid, p_roster_slugs text[], p_data_slugs text[],
  p_start date, p_end date, p_frozen_handles text[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path=public,pg_temp
SET plan_cache_mode=force_custom_plan
SET statement_timeout='20s'
AS $function$
DECLARE result jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_roster_slugs IS NULL OR p_start IS NULL OR p_end IS NULL
    OR p_start>p_end OR p_end-p_start>800
    OR (p_frozen_handles IS NOT NULL AND p_data_slugs IS NULL) THEN
    RAISE EXCEPTION 'Video evidence scope or dates are invalid';
  END IF;
  IF (p_frozen_handles IS NULL AND EXISTS (
      SELECT 1 FROM unnest(p_roster_slugs) r(slug) WHERE NOT EXISTS (
        SELECT 1 FROM public.brands_v2 b WHERE b.tenant_id=p_tenant_id AND b.slug=r.slug)))
    OR (p_data_slugs IS NOT NULL AND EXISTS (
      SELECT 1 FROM unnest(p_data_slugs) r(slug) WHERE NOT EXISTS (
        SELECT 1 FROM public.brands_v2 b WHERE b.tenant_id=p_tenant_id AND b.slug=r.slug))) THEN
    RAISE EXCEPTION 'Video evidence brand scope is invalid';
  END IF;
  WITH requested AS MATERIALIZED (
    SELECT b.id,b.slug,b.is_umbrella FROM public.brands_v2 b
    WHERE p_frozen_handles IS NULL AND b.tenant_id=p_tenant_id AND b.slug=ANY(p_roster_slugs)
  ), stores AS MATERIALIZED (
    SELECT r.slug AS roster_slug,d.slug AS data_slug FROM requested r
    JOIN public.brands_v2 d ON d.tenant_id=p_tenant_id
      AND (CASE WHEN r.is_umbrella AND EXISTS (
        SELECT 1 FROM public.brands_v2 child WHERE child.tenant_id=p_tenant_id AND child.parent_brand_id=r.id
      ) THEN d.parent_brand_id=r.id ELSE d.id=r.id END)
      AND (p_data_slugs IS NULL OR d.slug=ANY(p_data_slugs))
    UNION ALL
    SELECT b.slug,b.slug FROM public.brands_v2 b
    WHERE p_frozen_handles IS NOT NULL AND b.tenant_id=p_tenant_id AND b.slug=ANY(p_data_slugs)
  ), roster AS MATERIALIZED (
    SELECT DISTINCT s.roster_slug,s.data_slug,mc.id,mc.creator_id,mc.reporting_start_date,mc.archived_at,mc.tags,
      mc.account_1,mc.account_2,mc.account_3,mc.account_4,mc.account_5,
      mc.account_6,mc.account_7,mc.account_8,mc.account_9,mc.account_10
    FROM stores s
    JOIN public.managed_creators mc ON mc.tenant_id=p_tenant_id AND mc.brand IN (s.roster_slug,s.data_slug)
    WHERE p_frozen_handles IS NULL
  ), member_exclusions AS MATERIALIZED (
    SELECT r.roster_slug,r.data_slug,coalesce(r.creator_id::text,'row:'||r.id::text) AS member_key,
      bool_or(coalesce(r.tags,ARRAY[]::text[]) @> ARRAY['reporting-exclude:'||to_char(p_end,'YYYY-MM')]) AS excluded
    FROM roster r GROUP BY 1,2,3
  ), effective_roster AS MATERIALIZED (
    SELECT r.*,e.excluded FROM roster r JOIN member_exclusions e
      ON e.roster_slug=r.roster_slug AND e.data_slug=r.data_slug
      AND e.member_key=coalesce(r.creator_id::text,'row:'||r.id::text)
  ), raw_handles AS MATERIALIZED (
    SELECT r.roster_slug,r.data_slug,r.reporting_start_date,r.archived_at,r.excluded,
      lower(regexp_replace(btrim(h.handle),'^@+','')) AS handle
    FROM effective_roster r CROSS JOIN LATERAL (VALUES
      (r.account_1),(r.account_2),(r.account_3),(r.account_4),(r.account_5),
      (r.account_6),(r.account_7),(r.account_8),(r.account_9),(r.account_10)
    ) h(handle) WHERE nullif(btrim(h.handle),'') IS NOT NULL
    UNION
    SELECT r.roster_slug,r.data_slug,r.reporting_start_date,r.archived_at,r.excluded,
      lower(regexp_replace(btrim(t.tiktok_username),'^@+',''))
    FROM effective_roster r JOIN public.tiktok_accounts t ON t.tenant_id=p_tenant_id AND t.creator_id=r.creator_id
    WHERE nullif(btrim(t.tiktok_username),'') IS NOT NULL
  ), handles AS MATERIALIZED (
    SELECT h.roster_slug,h.data_slug,h.reporting_start_date,h.archived_at,h.handle,
      bool_or(h.excluded) OVER(PARTITION BY h.roster_slug,h.data_slug,h.handle) AS excluded
    FROM raw_handles h
  ), posts AS MATERIALIZED (
    SELECT DISTINCT s.roster_slug,btrim(vp.video_id) AS video_id,vp.post_date::date AS posted,
      lower(regexp_replace(btrim(vp.creator_name),'^@+','')) AS handle,vp.brand AS data_slug
    FROM stores s JOIN public.video_performance vp ON vp.tenant_id=p_tenant_id AND vp.brand=s.data_slug
    WHERE vp.period_type='daily' AND nullif(btrim(vp.video_id),'') IS NOT NULL
      AND vp.post_date IS NOT NULL AND vp.post_date>=p_start AND vp.post_date<p_end+1
  ), qualified AS MATERIALIZED (
    SELECT p.* FROM posts p JOIN handles h ON h.roster_slug=p.roster_slug AND h.data_slug=p.data_slug AND h.handle=p.handle
      AND(h.reporting_start_date IS NULL OR p.posted>=h.reporting_start_date)
      AND(h.archived_at IS NULL OR p.posted<h.archived_at::date)
    WHERE p_frozen_handles IS NULL AND NOT h.excluded
    UNION ALL
    SELECT p.* FROM posts p WHERE p_frozen_handles IS NOT NULL AND p.handle IN (
      SELECT lower(regexp_replace(btrim(h),'^@+','')) FROM unnest(p_frozen_handles) h
      WHERE nullif(btrim(h),'') IS NOT NULL
    )
  ), identities AS MATERIALIZED (
    SELECT q.video_id,min(q.posted) AS published,
      (array_agg(q.handle ORDER BY q.posted,q.handle))[1] AS handle,
      array_agg(DISTINCT q.handle ORDER BY q.handle) AS qualifying_handles,
      array_agg(DISTINCT q.data_slug) AS data_brands
    FROM qualified q GROUP BY q.video_id LIMIT 250001
  ), evidence AS MATERIALIZED (
    SELECT i.*,left(nullif(btrim(m.video_name),''),240) AS title,
      CASE WHEN i.video_id ~ '^[0-9]+$' THEN
        CASE WHEN m.video_link ~ ('^https://(www[.]|m[.])?tiktok[.]com/@[A-Za-z0-9._]+/video/'||i.video_id||'([/?#]|$)')
          THEN m.video_link
          WHEN i.handle ~ '^[a-z0-9._]+$' THEN 'https://www.tiktok.com/@'||i.handle||'/video/'||i.video_id
          ELSE NULL END
        ELSE NULL END AS watch_url
    FROM identities i LEFT JOIN LATERAL (
      SELECT v.video_name,v.video_link FROM public.videos v
      WHERE v.tenant_id=p_tenant_id AND v.video_id=i.video_id AND v.brand=ANY(i.data_brands)
      ORDER BY v.post_date DESC NULLS LAST,v.brand LIMIT 1
    ) m ON true
  ) SELECT jsonb_build_object(
    'v',1,'capturedAt',statement_timestamp(),'periodStart',p_start,'periodEnd',p_end,'scope','managed-published',
    'total',count(*),'videos',coalesce(jsonb_agg(jsonb_build_object(
      'videoId',video_id,'creatorHandle',handle,'qualifyingHandles',qualifying_handles,
      'publishedAt',published,'watchUrl',watch_url,'title',title
    ) ORDER BY published DESC,video_id DESC),'[]'::jsonb)
  ) INTO result FROM evidence;
  IF (result->>'total')::integer>250000 THEN
    RAISE EXCEPTION 'Video evidence exceeds the safe export limit; use a smaller report period';
  END IF;
  RETURN result;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_report_published_video_evidence_workspace(uuid,text[],text[],date,date,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_report_published_video_evidence_workspace(uuid,text[],text[],date,date,text[]) TO service_role;
COMMENT ON FUNCTION public.get_report_published_video_evidence_workspace(uuid,text[],text[],date,date,text[]) IS
  'Complete distinct published-video evidence for report snapshots, or reconstruction from explicit frozen handles. No financial, private contact or source-file fields; service-only and tenant-scoped.';
