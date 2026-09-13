-- Existing RLS helpers reference public relations without schema qualification.
-- Built-ins resolve first; temporary objects resolve last. This remains INVOKER.
ALTER FUNCTION public.get_creator_video_history(text[])
  SET search_path = pg_catalog, public, pg_temp;
