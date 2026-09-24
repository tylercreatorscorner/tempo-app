-- Plan against the selected tenant, brands and dates. The previous SQL-language
-- body used a generic plan for optional array filters and scanned unrelated history.
-- Preserve every calculation, privilege, and the 60s statement budget.
CREATE OR REPLACE FUNCTION public.get_brand_report_extras_workspace(p_tenant_id uuid, p_data_slugs text[], p_start date, p_end date, p_prior_start date, p_prior_end date, p_video_ids text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY INVOKER
 SET plan_cache_mode TO 'force_custom_plan'
 SET search_path TO 'public'
 SET statement_timeout TO '60s'
AS $function$
BEGIN
RETURN (
WITH scoped_creator_performance AS NOT MATERIALIZED (SELECT * FROM public.creator_performance WHERE tenant_id = p_tenant_id),
scoped_video_performance AS NOT MATERIALIZED (SELECT * FROM public.video_performance WHERE tenant_id = p_tenant_id), vday AS MATERIALIZED (
    -- One row per (video, day) across prior..current window.
    SELECT vp.video_id, vp.report_date, MAX(vp.views)::bigint AS day_views
    FROM scoped_video_performance vp
    WHERE vp.period_type = 'daily'
      AND vp.report_date BETWEEN LEAST(p_prior_start, p_start) AND p_end
      AND (p_data_slugs IS NULL OR vp.brand = ANY(p_data_slugs))
      AND vp.video_id IS NOT NULL AND vp.video_id <> ''
    GROUP BY vp.video_id, vp.report_date
  ),
  views_agg AS (
    SELECT SUM(day_views) FILTER (WHERE report_date BETWEEN p_start AND p_end)             AS cur_views,
           SUM(day_views) FILTER (WHERE report_date BETWEEN p_prior_start AND p_prior_end) AS prior_views
    FROM vday
  ),
  video_views AS (
    SELECT video_id, SUM(day_views)::bigint AS views
    FROM vday
    WHERE p_video_ids IS NOT NULL AND video_id = ANY(p_video_ids)
      AND report_date BETWEEN p_start AND p_end
    GROUP BY video_id
    HAVING SUM(day_views) IS NOT NULL
  ),
  -- Whole-history weekly GMV buckets anchored to p_end (bucket 0 = the 7 days
  -- ending p_end). One scan yields the 12-week trend, lifetime GMV, best
  -- week, and first earning date.
  life_w AS MATERIALIZED (
    SELECT ((p_end - cp.report_date) / 7)::int AS wk,
           SUM(cp.gmv)::numeric AS gmv,
           MIN(cp.report_date) FILTER (WHERE cp.gmv > 0) AS first_earn
    FROM scoped_creator_performance cp
    WHERE cp.period_type = 'daily'
      AND cp.report_date <= p_end
      AND (p_data_slugs IS NULL OR cp.brand = ANY(p_data_slugs))
    GROUP BY 1
  ),
  life_videos AS (
    SELECT COUNT(DISTINCT vp.video_id)::bigint AS videos
    FROM scoped_video_performance vp
    WHERE vp.period_type = 'daily'
      AND vp.report_date <= p_end
      AND (p_data_slugs IS NULL OR vp.brand = ANY(p_data_slugs))
      AND vp.video_id IS NOT NULL AND vp.video_id <> ''
  )
  SELECT jsonb_build_object(
    'views',       (SELECT cur_views FROM views_agg),
    'prior_views', (SELECT prior_views FROM views_agg),
    'video_views', COALESCE((SELECT jsonb_agg(jsonb_build_object('video_id', v.video_id, 'views', v.views)) FROM video_views v), '[]'::jsonb),
    'weekly',      COALESCE((SELECT jsonb_agg(jsonb_build_object(
                       'week_end', (p_end - w.wk * 7),
                       'gmv', w.gmv) ORDER BY w.wk DESC)
                     FROM life_w w WHERE w.wk BETWEEN 0 AND 11), '[]'::jsonb),
    'lifetime',    (SELECT jsonb_build_object(
                       'gmv', COALESCE(SUM(w.gmv), 0),
                       'best_week', MAX(w.gmv),
                       'first_date', MIN(w.first_earn))
                     FROM life_w w),
    'lifetime_videos', (SELECT videos FROM life_videos)
  ));
END;
$function$;
REVOKE ALL ON FUNCTION public.get_brand_report_extras_workspace(uuid, text[], date, date, date, date, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_brand_report_extras_workspace(uuid, text[], date, date, date, date, text[]) TO service_role;
