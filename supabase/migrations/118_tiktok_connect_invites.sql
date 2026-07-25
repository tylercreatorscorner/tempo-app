-- Shareable client connect links — the artifact that survives an email.
--
-- ── Why this table exists ───────────────────────────────────────────────────
-- TikTok refuses an authorization from a sub-account: "Sub-accounts are unable
-- to authorize. To authorize, log out and retry with your main seller account."
-- So for every one of the ~16 brands, the person who must click Connect is the
-- CLIENT (the shop's main seller account), not the agency admin. The connect
-- flow built in migrations 115/117 assumes both halves happen in one sitting:
-- the OAuth state nonce lives TEN MINUTES, which cannot survive "email the link
-- to the shop owner, they click it tomorrow morning".
--
-- The fix is deliberately NOT a longer state TTL. That nonce is the only thing
-- authenticating TikTok's inbound callback (there is no session, no signature,
-- no shared secret on that request), so stretching it to 72 hours would hand a
-- leaked state a three-day replay window against the single check the callback
-- has. Instead the long-lived artifact is OURS and carries no OAuth meaning:
-- a row here is a claim ticket we can revoke, expire and audit, and it mints a
-- normal ten-minute state only at the moment the client actually clicks
-- through. Nothing in this table is accepted by TikTok, and nothing in it can
-- be replayed against TikTok.
--
-- ── What it is NOT ─────────────────────────────────────────────────────────
-- Not an authorization, and not a shortcut past the confirm step. Redeeming an
-- invite gets the client exactly as far as TikTok's consent screen; the
-- resulting pending authorization still lands in tiktok_oauth_states for an
-- authenticated admin to bind to a shop by hand. That separation is the
-- security control: a client can grant access, only an operator can decide
-- which storefront becomes which brand's numbers.
--
-- ── Grain ──────────────────────────────────────────────────────────────────
-- brand_slug is the DATA-STORE slug, the same discipline as
-- tiktok_shop_connections (migration 115): one TikTok shop maps to exactly one
-- store slug, NEVER an umbrella — the fact tables have no umbrella row, so a
-- connection written under 'leefar' would be invisible to every read path
-- forever. No trigger is added here on purpose: an invite writes no connection,
-- and trg_tiktok_conn_brand on tiktok_shop_connections is the ultimate guard.
-- The app gate at issue time is resolveExplicitBrandSlug (the same call
-- /api/tiktok/connections/start makes).

BEGIN;

CREATE TABLE IF NOT EXISTS public.tiktok_connect_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- THE SHAREABLE PART. 32 CSPRNG bytes, base64url, generated in the app
  -- (node:crypto — the same generator as the OAuth state nonce) and never
  -- derived from a uuid, a timestamp or Math.random.
  --
  -- No DB default on purpose: encode(gen_random_bytes(32), 'base64') yields
  -- '+', '/' and '=' characters, which are not path-safe, and a default that
  -- silently produced an unusable URL would be worse than no default at all.
  -- NOT NULL forces the app to supply one.
  token text NOT NULL UNIQUE,

  -- Store-grain slug. See the header: umbrellas are not valid here.
  brand_slug text NOT NULL,

  -- Admin identity, recorded as the user's email — same convention as
  -- client_reports.created_by (migration 097). Operator attribution, and the
  -- address the "a client just authorized" notice goes to. Never shown to the
  -- client.
  created_by text,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- 72 hours: long enough that a link emailed on a Friday still works Monday
  -- morning, short enough that a forwarded email is not a standing invitation
  -- to authorize a shop months later.
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),

  -- ── Redemption is BOUNDED, not single-use ────────────────────────────────
  -- The first draft stamped consumed_at the instant the client pressed
  -- Continue and refused every later attempt. That kills the link on the most
  -- likely path this feature exists for: the client is signed in to Seller
  -- Center as a sub-account, presses Continue, TikTok refuses them, they sign
  -- out, sign back in as the owner, re-open the emailed link — and find it
  -- dead. Same for bailing at TikTok's login wall, an in-app mail browser, a
  -- dropped connection, or a double submit.
  --
  -- A COUNTER fixes that without giving up the property that mattered. The
  -- reason redemption had to be bounded at all is that each one mints a row in
  -- tiktok_oauth_states from an unauthenticated request; capping at 5 bounds
  -- that by construction (five state rows per invite, ever) while leaving four
  -- retries for a human having a bad morning. The cap is enforced inside
  -- tiktok_redeem_connect_invite() below, in the same statement as the
  -- increment, so it cannot be raced.
  --
  -- The app mirrors this number as INVITE_MAX_REDEMPTIONS in
  -- src/lib/tiktok/connect-invites-core.ts (it drives the "used up" label).
  -- Change both together.
  redeem_count     int NOT NULL DEFAULT 0,
  last_redeemed_at timestamptz,

  -- A COMPLETED authorization — set only once the callback has exchanged the
  -- code and parked a pending authorization for a state minted from this
  -- invite. Deliberately NOT set at the click: "pressed Continue" and "granted
  -- access" are different facts, and reporting the first as the second is how
  -- this product ended up claiming a working TikTok sync for months off a
  -- backfilled boolean. This is the operator panel's only evidence-backed
  -- "authorized" signal.
  consumed_at timestamptz,

  -- Operator kill switch. An invite that reaches the wrong inbox is revoked
  -- here, and revocation is checked in the same predicate as expiry.
  revoked_at timestamptz,

  -- "Did the client ever open the link?" — the question the operator actually
  -- asks before chasing someone. open_count is CAPPED by
  -- tiktok_open_connect_invite() below: this row is reachable from a public
  -- URL, so an uncapped counter is a write the internet controls.
  last_opened_at timestamptz,
  open_count int NOT NULL DEFAULT 0
);

-- Added after the first draft of this migration; guarded so a partially applied
-- 118 converges rather than half-existing.
ALTER TABLE public.tiktok_connect_invites
  ADD COLUMN IF NOT EXISTS redeem_count     int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_redeemed_at timestamptz;

COMMENT ON TABLE public.tiktok_connect_invites IS
  'Shareable client connect links. Carries NO credential — it mints a short-lived OAuth state on redemption and nothing more.';
COMMENT ON COLUMN public.tiktok_connect_invites.token IS
  '32 CSPRNG bytes base64url, app-generated. The URL secret; treat as sensitive even though it authorizes nothing by itself.';
COMMENT ON COLUMN public.tiktok_connect_invites.brand_slug IS
  'DATA-STORE slug (never an umbrella) — same grain as tiktok_shop_connections.brand_slug.';
COMMENT ON COLUMN public.tiktok_connect_invites.redeem_count IS
  'Bounded retries (max 5, enforced in tiktok_redeem_connect_invite). Each redemption mints at most one oauth state row.';
COMMENT ON COLUMN public.tiktok_connect_invites.consumed_at IS
  'A COMPLETED authorization came back for a state minted from this invite. Never set by a mere click.';

-- The admin panel lists outstanding invites per brand, newest first.
CREATE INDEX IF NOT EXISTS idx_tiktok_invites_brand
  ON public.tiktok_connect_invites (brand_slug, created_at DESC);
-- Drives the expiry sweep below.
CREATE INDEX IF NOT EXISTS idx_tiktok_invites_expiry
  ON public.tiktok_connect_invites (expires_at);
-- Token lookup rides the UNIQUE constraint's index: one indexed equality per
-- open and per redemption, which is also what keeps the public route's work
-- identical for an unknown token and a dead one.

-- ── Linking a state back to the invite that minted it ───────────────────────
-- Two facts have to survive the round trip to TikTok, because the callback that
-- comes back holds nothing but a state nonce:
--
--   invite_id           — so a completed authorization stamps consumed_at on
--                         the right invite, and so the "a client just
--                         authorized" notice reaches whoever issued the link.
--   confirm_deadline_at — how long the operator gets to bind a shop, decided at
--                         MINT time. NULL means the admin-initiated flow and
--                         its 15-minute window.
--
-- WHY THE WINDOW HAS TO DIFFER. Migration 117 gave pending authorizations a
-- 15-minute confirm window, which is right for the synchronous flow: the admin
-- authorizes and confirms in one sitting. It is catastrophic for this one. The
-- client clicks at 8am while the operator is asleep; fifteen minutes later
-- tiktok_sweep_oauth_states() erases the tokens, the client authorized for
-- nothing, and nobody is told.
--
-- Lengthening the window for invite-originated authorizations is a POLICY
-- choice, not a weakening of any cryptographic property: the parked tokens are
-- AES-256-GCM ciphertext (src/lib/tiktok/token-crypto.ts) in a service-role-
-- only, RLS-on table whose key lives in the environment and never in the
-- database. What the 15 minutes actually buys is exposure TIME, and the trade
-- is explicit — up to 72 hours of ciphertext at rest, in exchange for a flow
-- that works at all. The security half does NOT regress: the sweep still
-- erases at whatever boundary applies, so an ABANDONED authorization is still
-- erased, just at its own class's deadline rather than everyone's.
ALTER TABLE public.tiktok_oauth_states
  ADD COLUMN IF NOT EXISTS invite_id uuid
    REFERENCES public.tiktok_connect_invites(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirm_deadline_at timestamptz;

COMMENT ON COLUMN public.tiktok_oauth_states.invite_id IS
  'The client connect link this state was minted from, if any. NULL = admin-initiated flow.';
COMMENT ON COLUMN public.tiktok_oauth_states.confirm_deadline_at IS
  'Confirm window decided at mint time. NULL = the 15-minute admin default. Independent of invite_id, which the sweep may null out.';

-- ── Opening a link ──────────────────────────────────────────────────────────
-- One round trip that classifies the invite AND stamps the open, so the public
-- page cannot be turned into a read-then-write race.
--
-- 'missing' is returned for a token that does not exist, but the page renders
-- the SAME message for every non-live status — the classification exists for
-- the server log, not for the visitor. Telling a prober "that token existed but
-- expired" is the one thing this route must never do.
--
-- OUT parameters are prefixed so no plpgsql variable can shadow a column
-- reference inside the body.
CREATE OR REPLACE FUNCTION public.tiktok_open_connect_invite(p_token text)
RETURNS TABLE (invite_brand_slug text, invite_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand  text;
  v_status text;
BEGIN
  SELECT i.brand_slug,
         CASE
           WHEN i.revoked_at   IS NOT NULL THEN 'revoked'
           WHEN i.expires_at   <= now()    THEN 'expired'
           -- A completed authorization ends the link's usefulness, and so does
           -- exhausting the retry budget. Both are dead ends, rendered
           -- identically to every other failure.
           WHEN i.consumed_at  IS NOT NULL THEN 'consumed'
           WHEN i.redeem_count >= 5        THEN 'exhausted'
           ELSE 'live'
         END
    INTO v_brand, v_status
    FROM public.tiktok_connect_invites i
   WHERE i.token = p_token;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::text, 'missing'::text;
    RETURN;
  END IF;

  IF v_status = 'live' THEN
    UPDATE public.tiktok_connect_invites i
       SET last_opened_at = now(),
           open_count     = i.open_count + 1
     WHERE i.token = p_token
       -- HARD CAP. Past 50 opens the row stops being written to entirely
       -- (last_opened_at freezes too): the operator only ever needs
       -- "opened / not opened", and this is an unauthenticated write path, so
       -- the counter must not be an unbounded write amplifier on one row.
       AND i.open_count < 50;
  END IF;

  RETURN QUERY SELECT v_brand, v_status;
END;
$$;

COMMENT ON FUNCTION public.tiktok_open_connect_invite(text) IS
  'Classify + stamp an invite open in one statement. Writes only for a LIVE invite, and only while open_count < 50.';

-- ── Redeeming a link ────────────────────────────────────────────────────────
-- The increment and the cap are ONE statement: Postgres takes a row lock and
-- re-evaluates redeem_count < 5 against the updated row, so two clicks racing
-- the same link cannot both pass the check. A read-then-write would let them.
CREATE OR REPLACE FUNCTION public.tiktok_redeem_connect_invite(p_token text)
RETURNS TABLE (invite_id uuid, invite_brand_slug text, invite_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.tiktok_connect_invites i
     SET redeem_count     = i.redeem_count + 1,
         last_redeemed_at = now()
   WHERE i.token = p_token
     AND i.redeem_count < 5
     AND i.revoked_at IS NULL
     -- Already authorized: the client has nothing left to do here, and letting
     -- them through would park a second credential nobody asked for.
     AND i.consumed_at IS NULL
     AND i.expires_at > now()
  RETURNING i.id, i.brand_slug, i.expires_at;
END;
$$;

COMMENT ON FUNCTION public.tiktok_redeem_connect_invite(text) IS
  'Atomic bounded redemption (max 5). Zero rows = revoked, expired, exhausted, already authorized, or never issued — the caller must not tell those apart to the visitor.';

-- ── Sweep ───────────────────────────────────────────────────────────────────
-- Folded into the existing tiktok_sweep_oauth_states() rather than given its
-- own job, so there is ONE place that reasons about connect-flow TTLs and one
-- pg_cron entry to keep alive. The return type gains a column, which
-- CREATE OR REPLACE cannot do — hence the DROP. The scheduled command text
-- ('select public.tiktok_sweep_oauth_states()') is unchanged, so the existing
-- job keeps working; the app reads the row's named fields and ignores extras.
DROP FUNCTION IF EXISTS public.tiktok_sweep_oauth_states();

CREATE FUNCTION public.tiktok_sweep_oauth_states()
RETURNS TABLE (pending_cleared bigint, rows_deleted bigint, invites_deleted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cleared bigint;
  v_deleted bigint;
  v_invites bigint;
BEGIN
  -- The security half, unchanged from migration 117 and still driven by
  -- pending_expires_at alone: whatever deadline was written for this
  -- authorization's CLASS (15 minutes admin-initiated, up to 72 hours
  -- invite-originated), the credential is erased once it passes. An abandoned
  -- authorization is still erased — only the boundary moved.
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

  -- An invite carries NO CREDENTIAL. There is no token pair in it, no
  -- shop_cipher, nothing that could be replayed against TikTok — it is a claim
  -- ticket whose only power was to mint a ten-minute state, and past expires_at
  -- it cannot even do that. So unlike a lapsed pending authorization (which
  -- must be ERASED at its TTL and only deleted much later, so consumed_at
  -- survives to fail a late replay closed), an expired invite is simply
  -- deleted. A replayed token after deletion resolves to 'missing', which the
  -- public page renders identically to 'expired'.
  --
  -- Safe against an authorization still in flight: invite_id on
  -- tiktok_oauth_states is ON DELETE SET NULL, and confirm_deadline_at was
  -- copied onto the state row at mint time, so an authorization whose invite
  -- has been reaped keeps its full confirm window.
  DELETE FROM public.tiktok_connect_invites
   WHERE expires_at < now();
  GET DIAGNOSTICS v_invites = ROW_COUNT;

  RETURN QUERY SELECT v_cleared, v_deleted, v_invites;
END;
$$;

-- Re-assert the schedule: harmless if it already exists (cron.schedule upserts
-- by job name), and it is what gives a fresh environment the sweep.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule('tiktok-sweep-oauth-states', '*/5 * * * *',
                        'select public.tiktok_sweep_oauth_states()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not configured (%) — schedule public.tiktok_sweep_oauth_states() externally', SQLERRM;
END $$;

-- ── Lockdown ────────────────────────────────────────────────────────────────
-- House rule (migrations 095/100/106/114/115/117): under Supabase's default
-- privileges anon and authenticated are granted on new public objects
-- automatically, so a GRANT list that merely OMITS them revokes NOTHING. Both
-- halves are required — RLS with no policy AND the explicit REVOKE.
--
-- A leaked invite token authorizes nothing on its own, but anon SELECT on this
-- table would hand out every outstanding token in the product at once, and anon
-- EXECUTE on these functions would let the internet drive the sweep, the open
-- counter and the redemption budget. The redemption path is public by URL; the
-- TABLE is not.
ALTER TABLE public.tiktok_connect_invites ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tiktok_connect_invites FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tiktok_connect_invites TO service_role;

REVOKE ALL ON FUNCTION public.tiktok_open_connect_invite(text)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tiktok_redeem_connect_invite(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tiktok_open_connect_invite(text)   TO service_role;
GRANT EXECUTE ON FUNCTION public.tiktok_redeem_connect_invite(text) TO service_role;

-- The DROP above took the old grants with it, so these are not belt-and-braces.
REVOKE ALL ON FUNCTION public.tiktok_sweep_oauth_states() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tiktok_sweep_oauth_states() TO service_role;

COMMIT;
