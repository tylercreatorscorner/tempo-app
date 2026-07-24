-- Adversarial-review finding (verified empirically): Supabase's default
-- privileges grant EXECUTE on every new function to anon/authenticated/
-- service_role, so a GRANT list that merely omits anon revokes nothing -
-- has_function_privilege('anon', ...) returned TRUE for all four new
-- SECURITY DEFINER RPCs. Anyone with the public anon key (it ships in the
-- login page's JS bundle) could pull the cross-brand creator-GMV
-- leaderboard, the Daily Drop game data, and the client-report extras with
-- NULL brand filters, straight through PostgREST.
--
-- Scope: the FOUR functions new in this branch only. The deployed prod code
-- never calls them, so this cannot break anything mid-deploy; after the
-- merge they are reached as authenticated (admin UI session) or service_role
-- (the discord-posts data functions now use the admin client - the cron
-- schedule runner has no session and previously rode the anon default
-- grant). The pre-existing v1 RPCs (whos_cooking_agg, get_daily_drop_agg,
-- whats_cooking_agg, get_video_day_leaders, dcs_gmv_sum, ...) keep their
-- anon access for now: prod's cron path still calls them as anon until this
-- branch merges. The house-wide anon-RPC sweep is tracked in the July
-- security audit.
REVOKE EXECUTE ON FUNCTION public.whos_cooking_agg_v2(uuid[], date, date, date, date, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_daily_drop_extras(text[], date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_roster_rookie(text[], date, date, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_brand_report_extras(text[], date, date, date, date, text[]) FROM PUBLIC, anon;
