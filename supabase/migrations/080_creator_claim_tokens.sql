-- Claim-link tokens for creator-portal onboarding at scale.
--
-- Email/phone coverage on creators_v2 is ~1%, so email magic-link can't onboard
-- the roster. Instead the Discord bot DMs each creator a signed, single-creator
-- claim link; the /creator-claim route validates the JTI here, sets the normal
-- creator session, and marks the token consumed (single-use). A leaked link only
-- ever exposes that one creator's own portal — never another creator's or any
-- agency internals.
--
-- Mirrors creator_magic_link_tokens (JTI replay protection) but longer-lived.

CREATE TABLE IF NOT EXISTS public.creator_claim_tokens (
  jti          text PRIMARY KEY,
  creator_id   uuid NOT NULL REFERENCES public.creators_v2(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_by   text          -- what minted it (e.g. 'bulk-invite', a manager id)
);

CREATE INDEX IF NOT EXISTS idx_creator_claim_tokens_creator
  ON public.creator_claim_tokens (creator_id);

-- Only the service role touches this table (bot/API mints; the /creator-claim
-- route reads + consumes). Enable RLS with no policies so anon/authenticated
-- roles get nothing; service_role bypasses RLS.
ALTER TABLE public.creator_claim_tokens ENABLE ROW LEVEL SECURITY;
