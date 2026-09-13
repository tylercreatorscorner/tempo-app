-- Aggregate only rows the caller can already SELECT. Never bypass RLS.
CREATE OR REPLACE FUNCTION public.get_creator_video_history(p_handles text[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'brands', COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
      'tiktok_username', tiktok_username, 'brand_id', brand_id
    )) FILTER (WHERE brand_id IS NOT NULL), '[]'::jsonb),
    'total_videos', count(DISTINCT video_id) FILTER (WHERE video_id <> ''),
    'first_active_date', min(report_date)
  )
  FROM public.daily_video_product_stats
  WHERE tiktok_username = ANY(p_handles);
$$;
REVOKE ALL ON FUNCTION public.get_creator_video_history(text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_creator_video_history(text[]) TO authenticated,service_role;
