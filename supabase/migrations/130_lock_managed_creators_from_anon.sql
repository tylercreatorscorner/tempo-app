-- 130_lock_managed_creators_from_anon.sql
--
-- 🚨 managed_creators was readable with the PUBLIC ANON KEY — the one that ships
-- in the login page's JS bundle. Measured live before the fix, running as anon:
-- 1,828 rows, 664 retainers, $891,177 of retainer commitments.
--
-- RLS was DISABLED on the table, which made its TWELVE policies inert — they
-- read like protection and enforced nothing. On top of that anon held SELECT
-- and authenticated held full DML.
--
-- Found while splitting creator-cost out of can_view_finance. That split is
-- application-level; it is meaningless while the table underneath answers to
-- the public key, so this lands with it.
--
-- Verified safe before revoking: no 'use client' file queries this table (the
-- three that mention it only reference the name in comments/strings), and every
-- server reader goes through createAdminClient (service_role), which bypasses
-- RLS and keeps its grants.

ALTER TABLE public.managed_creators ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.managed_creators FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.managed_creators TO service_role;

-- ⚠️ Revoking the TABLE is not enough on its own. A SECURITY DEFINER function
-- that reads it runs as its owner and bypasses both RLS and the revoke, so an
-- anon-executable DEFINER function is a hole straight through everything above.
--
-- Two of these were callable by anon and are called by NOTHING in the app.
-- migrate_managed_accounts_to_tiktok_accounts is a data-MIGRATION routine —
-- a write primitive that anyone with the public key could invoke.
--
-- Every live caller (creator-invite.ts, cohort-retention.ts) uses
-- createAdminClient, so service_role is the only grant any of them needs.
REVOKE ALL ON FUNCTION public.creator_brands()                             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_cohort_retention(text[])                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_creators_to_invite(integer)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.migrate_managed_accounts_to_tiktok_accounts() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_cohort_retention(text[])              TO service_role;
GRANT EXECUTE ON FUNCTION public.get_creators_to_invite(integer)           TO service_role;

-- Verified after applying: `set local role anon; select … from managed_creators`
-- returns "permission denied for table managed_creators", and all five
-- functions report anon=false / authenticated=false / service_role=true.
