-- SECURITY HOTFIX (2026-07-25), applied ahead of migration 120's RPC replace.
--
-- The three upload RPCs were SECURITY DEFINER with EXECUTE granted to PUBLIC,
-- anon AND authenticated. Their first act under p_overwrite is:
--     DELETE FROM <fact table> WHERE brand = ... AND report_date = ...
-- so any caller holding the anon key — which ships in the browser bundle —
-- could have wiped an arbitrary brand-day of performance data, or written
-- fabricated rows, straight through PostgREST. Destructive capability exposed
-- to the internet, not merely a read leak.
--
-- Only caller: POST /api/upload/run (route.ts:57-59) via createAdminClient()
-- = service_role, so revoking cannot break a code path.
--
-- Third instance of this class found in one day (get_credential,
-- upload_videos_atomic, these three). House rule, migrations 095/100/106/114:
-- under Supabase default privileges a GRANT list that merely OMITS anon
-- revokes NOTHING — the REVOKE must be explicit.
REVOKE ALL ON FUNCTION public.upload_creator_performance_atomic(text, date, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upload_video_performance_atomic(text, date, jsonb, boolean)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upload_product_performance_atomic(text, date, jsonb, boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.upload_creator_performance_atomic(text, date, jsonb, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.upload_video_performance_atomic(text, date, jsonb, boolean)   TO service_role;
GRANT EXECUTE ON FUNCTION public.upload_product_performance_atomic(text, date, jsonb, boolean) TO service_role;
