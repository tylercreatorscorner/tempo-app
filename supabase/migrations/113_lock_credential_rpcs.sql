-- EMERGENCY LOCKDOWN (2026-07-24). public.get_credential was a SECURITY DEFINER
-- decryption oracle over vault.decrypted_secrets, EXECUTE-granted to PUBLIC,
-- anon and authenticated with no authorization check of any kind. Because the
-- Supabase anon key ships in the browser bundle, anyone on the internet could
-- POST /rest/v1/rpc/get_credential and read plaintext credentials by name.
-- Verified live during the 2026-07-24 TikTok integration audit: calling it as
-- anon returned a real plaintext password. store_/delete_/list_credential were
-- equally exposed (write + enumerate).
--
-- Zero callers exist in the application codebase (grep across src/ and
-- scripts/), so revoking cannot break a code path. service_role retains
-- EXECUTE for server-side use.
--
-- NOTE: revoking access does NOT undo prior exposure — every secret reachable
-- through these functions must be rotated. Exposed since 2026-02-27:
--   global/capsolver_api_key, jiyu/imap_app_password, jiyu/imap_user,
--   jiyu/tiktok_email, jiyu/tiktok_password
REVOKE ALL ON FUNCTION public.get_credential(text, text, uuid)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_credential(text, text, text, uuid)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_credential(text, text, uuid)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_credentials(text, uuid)              FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_credential(text, text, uuid)         TO service_role;
GRANT EXECUTE ON FUNCTION public.store_credential(text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_credential(text, text, uuid)      TO service_role;
GRANT EXECUTE ON FUNCTION public.list_credentials(text, uuid)             TO service_role;
