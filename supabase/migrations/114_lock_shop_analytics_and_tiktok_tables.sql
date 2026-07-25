-- Cross-tenant leak + defence-in-depth (2026-07-24 audit).
--
-- 1) shop_analytics carried policy "Authenticated users can read" USING
--    (auth.role() = 'authenticated'), so ANY logged-in user — including
--    brand-portal client users, who are customers of a single brand — could
--    read every brand's shop-level revenue (147 rows, ~$5.97M GMV) straight
--    from PostgREST, bypassing every brand-scoping gate in the app. No
--    application code reads this table (grep over src/), so closing it cannot
--    break a surface.
--
-- 2) The tiktok_* tables are about to hold live OAuth tokens + shop_cipher for
--    ~16 merchant shops. They are RLS-enabled today, but anon and authenticated
--    still hold full DML + TRUNCATE via Supabase default privileges — the
--    migration 095/100/106 house rule: a GRANT list that merely omits anon
--    revokes NOTHING. One future permissive policy would expose every token.
--    Remove the grants so RLS is not the only thing standing in the way.
DROP POLICY IF EXISTS "Authenticated users can read" ON public.shop_analytics;
ALTER TABLE public.shop_analytics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.shop_analytics FROM anon, authenticated;

REVOKE ALL ON TABLE public.tiktok_shop_connections FROM anon, authenticated;
REVOKE ALL ON TABLE public.tiktok_oauth_states     FROM anon, authenticated;
REVOKE ALL ON TABLE public.tiktok_api_cache        FROM anon, authenticated;
REVOKE ALL ON TABLE public.tiktok_webhook_events   FROM anon, authenticated;
