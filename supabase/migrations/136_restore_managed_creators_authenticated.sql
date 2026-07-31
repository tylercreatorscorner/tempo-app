-- 136_restore_managed_creators_authenticated.sql
--
-- REGRESSION FIX. Migration 130 broke live pages; this restores them.
--
-- 130 closed a real hole: managed_creators was readable with the PUBLIC ANON
-- KEY — 1,828 rows, 664 retainers, $891,177 of commitments, using the key that
-- ships in the login page's JS bundle. That part was right and STAYS CLOSED.
--
-- But 130 did TWO things at once — revoked grants AND enabled RLS — and the
-- safety check before applying it was insufficient. I verified that no
-- 'use client' file queried the table. That misses SERVER components using the
-- user-scoped createClient(), which run as `authenticated` rather than
-- service_role and lost access too.
--
-- Broken by it, found when the owner asked why two dashboard cards looked
-- wrong:
--   · dashboard/page.tsx  — fetchRetainerBySlug returned an empty map, so
--     "Retainers/mo" rendered $0 and ROI rendered N/A. A silent zero on a money
--     card, which is the exact failure mode this codebase has a standing rule
--     against.
--   · lib/data/creator-profile.ts (8 reads), lib/data/reports.ts (3),
--     brand-client-report.ts, discord-posts.ts
--
-- Enabling RLS was the riskier half and I underweighted it: the table's twelve
-- policies had been INERT, so switching RLS on changed row VISIBILITY for every
-- reader at the same moment the grants changed. Two variables at once, on a
-- table no test covers.
--
-- So this restores the pre-130 state for `authenticated` and keeps anon
-- revoked. anon was the actual exposure: it needs no account at all.
-- `authenticated` requires a real login — a different and much smaller risk,
-- and the state this table has been in for its entire existence.
--
-- ⚠️ A RESTORE, NOT THE FINAL ANSWER. The right fix is a SECURITY DEFINER RPC
-- for the retainer aggregate (the house rule for brand-wide fact reads), after
-- which `authenticated` can be revoked again deliberately — one caller at a
-- time, each surface verified before the next. A broken dashboard is not an
-- acceptable price for finishing that in one go.

ALTER TABLE public.managed_creators DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.managed_creators TO authenticated;

-- anon stays revoked. This is the line that mattered.
REVOKE ALL ON TABLE public.managed_creators FROM anon;
