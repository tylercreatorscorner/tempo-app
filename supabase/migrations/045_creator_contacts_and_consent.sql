-- Multi-channel contact + consent foundation for the messaging rebuild.
-- Applied to production via Supabase MCP; this file documents state.
--
-- creator_contacts        — canonical per-channel contact store (one row per
--                           creator + channel + value). Supersedes
--                           creators_v2.email/phone/discord_id (legacy mirror).
-- creator_consent_events  — append-only TCPA audit log.
-- creators_v2.contact_onboarding_at — "prompted for contact info" flag.
--
-- Consent model:
--   sms     → TCPA opt-IN. 'pending' until explicit express consent → 'opted_in'.
--   email   → CAN-SPAM opt-OUT + business relationship → 'not_applicable'.
--   discord → inbound-initiated → 'not_applicable'.

CREATE TABLE IF NOT EXISTS public.creator_contacts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id           uuid NOT NULL REFERENCES public.creators_v2(id) ON DELETE CASCADE,
  tenant_id            uuid,
  channel              text NOT NULL CHECK (channel IN ('email', 'sms', 'discord')),
  value                text NOT NULL,
  is_primary           boolean NOT NULL DEFAULT true,
  verified_at          timestamptz,
  consent_status       text NOT NULL DEFAULT 'pending'
                         CHECK (consent_status IN ('opted_in', 'opted_out', 'pending', 'not_applicable')),
  consent_at           timestamptz,
  consent_source       text,
  consent_text_version text,
  consent_ip           text,
  consent_user_agent   text,
  opted_out_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_id, channel, value)
);

CREATE INDEX IF NOT EXISTS creator_contacts_creator_id_idx
  ON public.creator_contacts (creator_id);
CREATE INDEX IF NOT EXISTS creator_contacts_channel_value_idx
  ON public.creator_contacts (channel, lower(value));

CREATE TABLE IF NOT EXISTS public.creator_consent_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id           uuid NOT NULL REFERENCES public.creators_v2(id) ON DELETE CASCADE,
  contact_id           uuid REFERENCES public.creator_contacts(id) ON DELETE SET NULL,
  channel              text NOT NULL,
  value                text,
  event                text NOT NULL CHECK (event IN ('opt_in', 'opt_out', 'verify', 'update', 'import')),
  consent_text_version text,
  source               text,
  ip                   text,
  user_agent           text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creator_consent_events_creator_id_idx
  ON public.creator_consent_events (creator_id);

ALTER TABLE public.creator_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_consent_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.creator_contacts IS
  'Canonical per-channel contact store + consent state. Supersedes creators_v2.email/phone/discord_id (legacy mirror).';
COMMENT ON TABLE public.creator_consent_events IS
  'Append-only TCPA audit log: every opt-in/opt-out/verify/import.';

-- "Prompted for contact info" flag — verify route redirects to onboarding once
-- when null; set on save OR skip.
ALTER TABLE public.creators_v2
  ADD COLUMN IF NOT EXISTS contact_onboarding_at timestamptz;

COMMENT ON COLUMN public.creators_v2.contact_onboarding_at IS
  'When the creator completed or skipped contact-collection onboarding. NULL = never prompted.';

-- ── Backfill from creators_v2 (legacy mirror → canonical) ────────────────
INSERT INTO public.creator_contacts (creator_id, tenant_id, channel, value, consent_status, consent_source)
SELECT id, tenant_id, 'email', lower(btrim(email)), 'not_applicable', 'import'
FROM public.creators_v2 WHERE email IS NOT NULL AND btrim(email) <> ''
ON CONFLICT (creator_id, channel, value) DO NOTHING;

INSERT INTO public.creator_contacts (creator_id, tenant_id, channel, value, consent_status, consent_source)
SELECT id, tenant_id, 'sms', btrim(phone), 'pending', 'import'
FROM public.creators_v2 WHERE phone IS NOT NULL AND btrim(phone) <> ''
ON CONFLICT (creator_id, channel, value) DO NOTHING;

INSERT INTO public.creator_contacts (creator_id, tenant_id, channel, value, consent_status, consent_source)
SELECT id, tenant_id, 'discord', btrim(discord_id), 'not_applicable', 'import'
FROM public.creators_v2 WHERE discord_id IS NOT NULL AND btrim(discord_id) <> ''
ON CONFLICT (creator_id, channel, value) DO NOTHING;
