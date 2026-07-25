-- TikTok Shop connect flow — carry tokens across the confirmation step, make
-- disconnect able to erase them, and stop a disconnected row from squatting a
-- shop it no longer uses.
--
-- ── 1. Why pending columns exist at all ─────────────────────────────────────
-- The OAuth callback receives an auth_code that is SINGLE USE. Exchanging it is
-- the only chance we get: if the exchange is deferred until after a human
-- confirms which shop to link, the code has expired and the merchant has to
-- re-authorize. So the callback exchanges immediately — and then has a token
-- pair in hand with nowhere legitimate to put it, because a connection row must
-- NOT be written until an operator has explicitly confirmed WHICH shop maps to
-- WHICH brand (a seller account can own several shops; LeeFar owns three, and
-- binding the wrong one silently corrupts every downstream number for that
-- client, forever, with no error anywhere).
--
-- These columns are that holding area. Three properties make it safe:
--   1. CIPHERTEXT ONLY. Same AES-256-GCM envelope as the connections table
--      (src/lib/tiktok/token-crypto.ts). A plaintext write here is a security
--      incident, not a shortcut — this row is far more exposed than the
--      connections row because it is created by an unauthenticated redirect.
--   2. SHORT TTL, ACTIVELY ENFORCED. pending_expires_at bounds the confirm
--      window, and tiktok_sweep_oauth_states() below actually ERASES the
--      ciphertext once it lapses. A TTL that is only a read filter is not a
--      TTL: the credential outlives it, unrevoked, for as long as the row sits
--      there. See section 4.
--   3. CLEARED ON USE. The confirm step nulls every pending_* column in the
--      same statement that it stops needing them.
--
-- pending_expires_at is deliberately a SECOND column rather than a bump of
-- expires_at: the two windows answer different questions ("may this state still
-- be redeemed?" vs "may this pending authorization still be confirmed?") and
-- collapsing them makes the redemption guard mutable, which is exactly the
-- property a single-use nonce must not have.

BEGIN;

ALTER TABLE public.tiktok_oauth_states
  ADD COLUMN IF NOT EXISTS pending_access_token_encrypted   text,
  ADD COLUMN IF NOT EXISTS pending_refresh_token_encrypted  text,
  ADD COLUMN IF NOT EXISTS pending_access_token_expires_at  timestamptz,
  ADD COLUMN IF NOT EXISTS pending_refresh_token_expires_at timestamptz,
  -- Provenance from the token response: the authorizing SELLER account.
  ADD COLUMN IF NOT EXISTS pending_open_id     text,
  ADD COLUMN IF NOT EXISTS pending_seller_name text,
  -- The RAW /authorization/{version}/shops payload, stored verbatim. Not a
  -- parsed subset: this is the first real response this integration has ever
  -- seen from that endpoint, and the ingestion phase needs captured reality to
  -- generate types from rather than hand-written guesses (see
  -- src/lib/tiktok/types.ts on why hand-written response types hid four bugs
  -- from tsc in the previous integration).
  ADD COLUMN IF NOT EXISTS pending_shops jsonb,
  ADD COLUMN IF NOT EXISTS pending_expires_at timestamptz;

COMMENT ON COLUMN public.tiktok_oauth_states.pending_access_token_encrypted IS
  'AES-256-GCM envelope (v1.iv.tag.ct) — NEVER a plaintext token. Cleared on confirm or by the sweep.';
COMMENT ON COLUMN public.tiktok_oauth_states.pending_refresh_token_encrypted IS
  'AES-256-GCM envelope (v1.iv.tag.ct) — NEVER a plaintext token. Cleared on confirm or by the sweep.';
COMMENT ON COLUMN public.tiktok_oauth_states.pending_expires_at IS
  'Confirm-step deadline, ENFORCED by tiktok_sweep_oauth_states(). Independent of expires_at, which guards state redemption.';

-- Drives both the admin surface ("which authorizations are waiting on a
-- human?") and the sweep ("which have lapsed?").
CREATE INDEX IF NOT EXISTS idx_tiktok_oauth_states_pending
  ON public.tiktok_oauth_states (pending_expires_at)
  WHERE pending_shops IS NOT NULL;

-- ── 2. Disconnect must be able to erase ─────────────────────────────────────
ALTER TABLE public.tiktok_shop_connections
  ALTER COLUMN access_token_encrypted  DROP NOT NULL,
  ALTER COLUMN refresh_token_encrypted DROP NOT NULL;

ALTER TABLE public.tiktok_shop_connections
  DROP CONSTRAINT IF EXISTS tiktok_conn_active_has_tokens;
ALTER TABLE public.tiktok_shop_connections
  ADD CONSTRAINT tiktok_conn_active_has_tokens
  CHECK (
    NOT is_active
    OR (access_token_encrypted IS NOT NULL AND refresh_token_encrypted IS NOT NULL)
  );

COMMENT ON CONSTRAINT tiktok_conn_active_has_tokens ON public.tiktok_shop_connections IS
  'Tokens are nullable only so disconnect can erase them; an ACTIVE row always has both.';

-- ── 3. A disconnected row must stop squatting its shop ──────────────────────
-- Migration 115 made UNIQUE(shop_id) UNCONDITIONAL. Disconnect sets
-- is_active = false but leaves shop_id populated, and there is no DELETE path,
-- so the dead row kept owning the shop forever:
--
--   connect leefar_nutrition to shop S  ->  wrong storefront, disconnect it
--   connect leefar_supplements to S     ->  409 "already connected to another
--                                            brand; disconnect it there first"
--
-- which is precisely what the operator just did. A dead end with no recovery
-- path in the product — the CORRECT binding becomes unreachable.
--
-- The invariant that actually matters is "no two LIVE brands claim one shop"
-- (that is the one that would double-count a shop's GMV across the agency).
-- A partial index says exactly that and nothing more. Two INACTIVE rows may now
-- share a shop_id, which is just history.
--
-- The name keeps the 'shop_id' substring on purpose: the app classifies unique
-- violations by matching the constraint name in the error text
-- (explainWriteFailure in src/lib/tiktok/connections.ts), and a name without it
-- would silently degrade every shop conflict to the generic message.
ALTER TABLE public.tiktok_shop_connections
  DROP CONSTRAINT IF EXISTS tiktok_shop_connections_shop_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tiktok_conn_active_shop_id
  ON public.tiktok_shop_connections (shop_id)
  WHERE is_active;

COMMENT ON INDEX public.idx_tiktok_conn_active_shop_id IS
  'One LIVE brand per shop. Inactive rows may repeat a shop_id — they are history, not a claim.';

-- UNIQUE(brand_slug) stays UNCONDITIONAL and is deliberately not touched: one
-- brand keeps exactly one row across every connect/disconnect cycle, which is
-- what lets the app upsert ON CONFLICT (brand_slug) and what keeps "which
-- connection do I pull for cosrx?" unambiguous.

-- ── 4. Enforce the pending TTL ──────────────────────────────────────────────
-- Without this, pending_expires_at was only a READ FILTER: an operator who
-- authorized and then closed the tab left an encrypted refresh token — multi-
-- month lifetime, unrevoked at TikTok — sitting in this table indefinitely,
-- while the header above claimed a short TTL.
--
-- Two statements, deliberately not merged:
--   * ERASE lapsed credentials at TTL. This is the security half, on the
--     15-minute window.
--   * DELETE the husk rows much later. Hygiene, and it can lag: keeping the row
--     preserves consumed_at, so a very late replay still fails closed against a
--     consumed nonce rather than against no row at all.
CREATE OR REPLACE FUNCTION public.tiktok_sweep_oauth_states()
RETURNS TABLE (pending_cleared bigint, rows_deleted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cleared bigint;
  v_deleted bigint;
BEGIN
  UPDATE public.tiktok_oauth_states
     SET pending_access_token_encrypted   = NULL,
         pending_refresh_token_encrypted  = NULL,
         pending_access_token_expires_at  = NULL,
         pending_refresh_token_expires_at = NULL,
         pending_open_id                  = NULL,
         pending_seller_name              = NULL,
         pending_shops                    = NULL,
         pending_expires_at               = NULL
   WHERE pending_expires_at IS NOT NULL
     AND pending_expires_at < now();
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  DELETE FROM public.tiktok_oauth_states
   WHERE expires_at < now() - interval '24 hours'
     -- Never delete a row that still holds a credential: erasing it is the
     -- other statement's job, and a DELETE racing it would destroy the evidence
     -- that a token was ever parked here.
     AND pending_access_token_encrypted IS NULL
     AND pending_refresh_token_encrypted IS NULL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_cleared, v_deleted;
END;
$$;

-- Runs with no operator action required. The app also calls this on the
-- Settings read and on connect — belt and braces, and so the erase still
-- happens in an environment without pg_cron — but neither is a SCHEDULE: an
-- operator who never opens Settings again must not leave a live token parked.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule('tiktok-sweep-oauth-states', '*/5 * * * *',
                        'select public.tiktok_sweep_oauth_states()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not configured (%) — schedule public.tiktok_sweep_oauth_states() externally', SQLERRM;
END $$;

-- ── 5. Lockdown ─────────────────────────────────────────────────────────────
-- Re-asserting the TABLE grants is belt-and-braces (ADD COLUMN does not change
-- privileges) but it is the house rule from migrations 095/100/106/114/115 and
-- it is cheap. The FUNCTION grant is NOT belt-and-braces: a new function is
-- EXECUTE-able by PUBLIC by default, and under Supabase's default privileges a
-- GRANT list that merely OMITS anon revokes NOTHING. Without the explicit
-- REVOKE, anon could call a SECURITY DEFINER function that writes to the table
-- holding every merchant's OAuth tokens.
ALTER TABLE public.tiktok_oauth_states     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_shop_connections ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tiktok_oauth_states     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tiktok_shop_connections FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tiktok_oauth_states     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tiktok_shop_connections TO service_role;

REVOKE ALL ON FUNCTION public.tiktok_sweep_oauth_states() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tiktok_sweep_oauth_states() TO service_role;

COMMIT;
