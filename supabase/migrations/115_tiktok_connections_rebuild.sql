-- TikTok Shop connection storage — destructive rebuild (2026-07-24 audit).
--
-- Both tables are EMPTY (0 rows, verified), and the shape they had could not
-- express the product:
--
--   1) `brand_id integer REFERENCES brands(id)` pointed at the LEGACY `brands`
--      table (6 rows) while brands_v2 — the canonical registry — holds 29 active
--      brands. 23 brands including cosrx, dr_dent and m3 were literally
--      unreferenceable. The column was dead on arrival.
--   2) There was no shop_id at all. The only natural key was
--      UNIQUE(brand_id, open_id), and open_id identifies the authorizing SELLER
--      ACCOUNT, not a shop. LeeFar is one umbrella over THREE store shops
--      (leefar_nutrition / leefar_supplements / leefar_us); if one seller
--      account owns all three, open_id cannot tell them apart and the three
--      shops collapse into a single row.
--
-- So: drop and recreate rather than patch. Nothing is lost.
--
-- GRAIN. `brand_slug` is the DATA-STORE slug — the same grain the fact tables
-- (creator_performance / video_performance / videos / product_performance) key
-- on via their `brand text` column. One TikTok shop maps to exactly ONE store
-- slug, NEVER an umbrella: there is no umbrella row in any fact table, so a row
-- written under 'leefar' would be invisible to every read path in the product
-- forever. The trigger below makes that impossible at the DB level; the app
-- gate is src/lib/tiktok/brand-resolution.ts.

BEGIN;

-- Re-run guard. This migration is safe TODAY only because the tables are empty.
-- Applied a second time after shops are connected it would silently destroy
-- every merchant's OAuth tokens and force a re-authorization of all of them.
-- Fail loudly instead.
DO $$
DECLARE n bigint;
BEGIN
  IF to_regclass('public.tiktok_shop_connections') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.tiktok_shop_connections' INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'Refusing to re-run 115: tiktok_shop_connections holds % row(s). Dropping it would destroy live merchant OAuth tokens.', n;
    END IF;
  END IF;
END $$;

-- The two dependent FKs are dropped EXPLICITLY rather than via DROP ... CASCADE,
-- so the dependency is visible in this file instead of silently disappearing.
-- tiktok_api_cache and tiktok_webhook_events are both empty and are not read by
-- any application code today; they are left in place and re-attached below.
ALTER TABLE IF EXISTS public.tiktok_api_cache
  DROP CONSTRAINT IF EXISTS tiktok_api_cache_connection_id_fkey;
ALTER TABLE IF EXISTS public.tiktok_webhook_events
  DROP CONSTRAINT IF EXISTS tiktok_webhook_events_connection_id_fkey;

DROP TABLE IF EXISTS public.tiktok_shop_connections;
DROP TABLE IF EXISTS public.tiktok_oauth_states;

-- ── Connections ─────────────────────────────────────────────────────────────
CREATE TABLE public.tiktok_shop_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- DATA-STORE slug from brands_v2 (leefar_nutrition, cosrx, dr_dent, ...).
  -- Umbrella slugs are FORBIDDEN here — see the header and trg_tiktok_conn_brand.
  brand_slug text NOT NULL,

  -- TikTok's shop identity. shop_cipher is required on every Shop API call and
  -- is per-shop, so it lives beside shop_id.
  shop_id     text NOT NULL,
  shop_cipher text NOT NULL,
  shop_name   text,

  -- The authorizing SELLER account. Deliberately NOT unique and NOT part of any
  -- key: one seller account can own several shops (LeeFar's three), so open_id
  -- repeats across rows. It is provenance, not identity.
  open_id            text,
  seller_name        text,
  seller_base_region text,

  -- TOKENS AT REST: ciphertext only. Encryption is AES-256-GCM at the APP layer
  -- (src/lib/tiktok/token-crypto.ts, key in env TIKTOK_TOKEN_ENC_KEY) so the
  -- database never holds the key and a DB-only compromise yields nothing usable.
  -- Writing a plaintext token into these columns is a security incident, not a
  -- shortcut. The `_encrypted` suffix is load-bearing: it makes a plaintext
  -- write look wrong at every call site.
  access_token_encrypted   text NOT NULL,
  refresh_token_encrypted  text NOT NULL,
  access_token_expires_at  timestamptz NOT NULL,
  refresh_token_expires_at timestamptz NOT NULL,
  granted_scopes           jsonb,

  is_active boolean NOT NULL DEFAULT true,

  last_token_refresh timestamptz,
  last_api_call      timestamptz,
  last_error         text,
  connected_at       timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  -- Strict 1:1 between a Tempo store brand and a TikTok shop, enforced from
  -- both directions:
  --   UNIQUE (shop_id)    — one shop cannot be claimed by two brands, which
  --                         would double-count its GMV across the agency.
  --   UNIQUE (brand_slug) — one brand cannot have two shops, which would make
  --                         "which connection do I pull for cosrx?" ambiguous
  --                         and let a stale connection silently win.
  -- A merchant with several shops (LeeFar) gets several ROWS, one per store
  -- slug — which is exactly why the old UNIQUE(brand_id, open_id) failed.
  CONSTRAINT tiktok_shop_connections_shop_id_key    UNIQUE (shop_id),
  CONSTRAINT tiktok_shop_connections_brand_slug_key UNIQUE (brand_slug)
);

CREATE INDEX idx_tiktok_conn_active ON public.tiktok_shop_connections (brand_slug)
  WHERE is_active;
-- Drives the refresh sweep: "which live tokens expire soonest?"
CREATE INDEX idx_tiktok_conn_refresh ON public.tiktok_shop_connections (access_token_expires_at)
  WHERE is_active;

-- Defense in depth for the invariant in the header. The app resolves the slug
-- before writing, but a direct SQL write (a console session, a future job, a
-- migration) must not be able to park a connection on an umbrella or on a brand
-- that does not exist — either one produces rows no read path can ever see.
-- Fail-closed by design: if the writer cannot see brands_v2, the write is
-- rejected rather than allowed through unvalidated.
CREATE OR REPLACE FUNCTION public.tiktok_conn_assert_store_slug()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_umbrella boolean;
BEGIN
  SELECT b.is_umbrella INTO v_umbrella
    FROM public.brands_v2 b WHERE b.slug = NEW.brand_slug LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tiktok_shop_connections.brand_slug=% is not a brands_v2 slug', NEW.brand_slug;
  END IF;
  IF v_umbrella THEN
    RAISE EXCEPTION 'tiktok_shop_connections.brand_slug=% is an UMBRELLA; use a store slug (fact tables have no umbrella row)', NEW.brand_slug;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tiktok_conn_brand ON public.tiktok_shop_connections;
CREATE TRIGGER trg_tiktok_conn_brand
  BEFORE INSERT OR UPDATE OF brand_slug ON public.tiktok_shop_connections
  FOR EACH ROW EXECUTE FUNCTION public.tiktok_conn_assert_store_slug();

CREATE OR REPLACE FUNCTION public.tiktok_conn_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tiktok_conn_touch ON public.tiktok_shop_connections;
CREATE TRIGGER trg_tiktok_conn_touch
  BEFORE UPDATE ON public.tiktok_shop_connections
  FOR EACH ROW EXECUTE FUNCTION public.tiktok_conn_touch_updated_at();

-- ── OAuth state nonces ──────────────────────────────────────────────────────
-- One-time CSRF nonce for the authorize round trip. `state` IS the key (it is
-- the value TikTok echoes back), so it is the primary key — no surrogate id to
-- get out of sync with it. consumed_at makes the redemption single-use: the
-- callback claims the row with an UPDATE ... WHERE consumed_at IS NULL, so a
-- replayed callback claims nothing.
CREATE TABLE public.tiktok_oauth_states (
  state       text PRIMARY KEY,
  brand_slug  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- 10 minutes: long enough for a human to finish TikTok's consent screen,
  -- short enough that a leaked state is worthless by the time it is found.
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  consumed_at timestamptz
);

CREATE INDEX idx_tiktok_oauth_states_expiry ON public.tiktok_oauth_states (expires_at);

-- Re-attach the dependents dropped at the top.
ALTER TABLE IF EXISTS public.tiktok_api_cache
  ADD CONSTRAINT tiktok_api_cache_connection_id_fkey
  FOREIGN KEY (connection_id) REFERENCES public.tiktok_shop_connections(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS public.tiktok_webhook_events
  ADD CONSTRAINT tiktok_webhook_events_connection_id_fkey
  FOREIGN KEY (connection_id) REFERENCES public.tiktok_shop_connections(id) ON DELETE SET NULL;

-- ── Lockdown ────────────────────────────────────────────────────────────────
-- These rows are the highest-value secret in the product: live merchant OAuth
-- tokens and shop_cipher for every connected shop.
--
-- RLS is enabled with NO policy, so even a role holding a grant selects nothing.
-- The REVOKE is separate and load-bearing (house rule from migrations
-- 095/100/106/114): under Supabase default privileges anon and authenticated
-- are granted on new public tables automatically, and a GRANT list that merely
-- OMITS them revokes NOTHING. Both halves are required — one permissive policy
-- added later would otherwise expose every token.
ALTER TABLE public.tiktok_shop_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_oauth_states     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tiktok_shop_connections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tiktok_oauth_states     FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tiktok_shop_connections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tiktok_oauth_states     TO service_role;

-- Trigger functions: PostgreSQL checks EXECUTE on the trigger function against
-- the role performing the write, so service_role needs it back explicitly after
-- the revoke or every INSERT fails.
REVOKE ALL ON FUNCTION public.tiktok_conn_assert_store_slug() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tiktok_conn_touch_updated_at()  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tiktok_conn_assert_store_slug() TO service_role;
GRANT EXECUTE ON FUNCTION public.tiktok_conn_touch_updated_at()  TO service_role;

COMMIT;
