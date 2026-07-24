-- Client report share page extras (approved mockup v3): windowed views for
-- the KPI band, per-video views for the watchable top-content cards, the
-- 12-week GMV trend strip, and the since-we-started lifetime strip.
--
-- Everything reads the SAME source tables as get_brand_client_report_agg
-- (creator_performance for money, video_performance for views) so the trend
-- and lifetime figures tie to the report's own headline numbers -
-- daily_creator_stats would be cheaper but disagrees with this report's GMV.
--
-- Views follow the mig-088/090 rule: video_performance rows repeat a video's
-- daily views once per product, so views = MAX per (video, day) then SUM
-- days - never SUM rows. NULL stays NULL (no engagement data ingested for
-- the window) so the caller can omit the Views KPI instead of showing 0.
CREATE OR REPLACE FUNCTION public.get_brand_report_extras(
  p_data_slugs text[],                -- creator/video_performance brand filter; NULL = all
  p_start date, p_end date,
  p_prior_start date, p_prior_end date,
  p_video_ids text[] DEFAULT NULL     -- top-video ids needing per-video window views
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
SET statement_timeout = '60s'
AS $$
  WITH vday AS MATERIALIZED (
    -- One row per (video, day) across prior..current window.
    SELECT vp.video_id, vp.report_date, MAX(vp.views)::bigint AS day_views
    FROM video_performance vp
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
    FROM creator_performance cp
    WHERE cp.period_type = 'daily'
      AND cp.report_date <= p_end
      AND (p_data_slugs IS NULL OR cp.brand = ANY(p_data_slugs))
    GROUP BY 1
  ),
  life_videos AS (
    SELECT COUNT(DISTINCT vp.video_id)::bigint AS videos
    FROM video_performance vp
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
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_brand_report_extras(text[], date, date, date, date, text[]) TO authenticated, service_role;
