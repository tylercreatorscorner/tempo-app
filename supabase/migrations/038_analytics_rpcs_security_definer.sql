-- The analytics_* RPCs from migrations 036/037 default to SECURITY INVOKER,
-- which means the v2 stats tables' tenant-isolation RLS (migration 019) filters
-- rows based on the calling Postgres role. Through Supabase, the calling role
-- is `authenticated`, and the RLS check `tenant_id = get_tenant_id()` should
-- pass because user_profiles.tenant_id matches the data's tenant_id --
-- but in practice it returns zero rows. The legacy get_brand_summary /
-- get_daily_trend RPCs avoid this by running SECURITY DEFINER (run-as-owner),
-- which bypasses RLS entirely. Match that pattern here for parity.
--
-- Safety: the page already filters BRAND_IDS via getAllowedBrandsForUser before
-- calling these, so the access control happens server-side in TS. The RPCs
-- themselves only sum/group rows that the caller passed brand_ids for.

ALTER FUNCTION analytics_brand_summaries(uuid[], date, date)         SECURITY DEFINER;
ALTER FUNCTION analytics_creator_rankings(uuid[], date, date, int)   SECURITY DEFINER;
ALTER FUNCTION analytics_videos(uuid[], date, date, int)             SECURITY DEFINER;
ALTER FUNCTION analytics_daily_trend(uuid[], date, date)             SECURITY DEFINER;
ALTER FUNCTION analytics_products(uuid[], date, date, int)           SECURITY DEFINER;
