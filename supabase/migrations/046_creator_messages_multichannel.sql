-- Make creator_messages channel-agnostic for the send abstraction.
-- Applied to production via Supabase MCP; this file documents state.
--
-- Adds:
--   creator_uuid        — canonical FK to creators_v2 (legacy integer
--                         creator_id retained for back-compat)
--   medium              — 'discord' | 'email' | 'sms' (authoritative
--                         channel-agnostic field the rebuilt inbox reads)
--   provider_message_id — Twilio SID / Resend id / Discord msg id for
--                         delivery tracking + inbound webhook matching
-- and widens the legacy channel CHECK so channel can mirror medium.

ALTER TABLE public.creator_messages
  ADD COLUMN IF NOT EXISTS creator_uuid uuid REFERENCES public.creators_v2(id),
  ADD COLUMN IF NOT EXISTS medium text,
  ADD COLUMN IF NOT EXISTS provider_message_id text;

CREATE INDEX IF NOT EXISTS creator_messages_creator_uuid_idx
  ON public.creator_messages (creator_uuid);
CREATE INDEX IF NOT EXISTS creator_messages_provider_message_id_idx
  ON public.creator_messages (provider_message_id);

COMMENT ON COLUMN public.creator_messages.creator_uuid IS
  'Canonical link to creators_v2. New code uses this; legacy integer creator_id retained for back-compat.';
COMMENT ON COLUMN public.creator_messages.medium IS
  'Channel-agnostic medium: discord | email | sms. The rebuilt Messages inbox reads this.';
COMMENT ON COLUMN public.creator_messages.provider_message_id IS
  'Provider message id (Twilio SID / Resend id / Discord msg id) for delivery tracking + inbound matching.';

-- Existing rows are all Discord DMs.
UPDATE public.creator_messages SET medium = 'discord' WHERE medium IS NULL;

-- Backfill the canonical link via the discord_id bridge where possible.
UPDATE public.creator_messages m
SET creator_uuid = cv.id
FROM public.creators_v2 cv
WHERE m.creator_uuid IS NULL
  AND m.discord_user_id IS NOT NULL
  AND cv.discord_id = m.discord_user_id;

-- Widen the channel CHECK so email/sms rows can set channel = medium.
ALTER TABLE public.creator_messages
  DROP CONSTRAINT IF EXISTS creator_messages_channel_check;
ALTER TABLE public.creator_messages
  ADD CONSTRAINT creator_messages_channel_check
  CHECK (channel = ANY (ARRAY['dm', 'channel', 'bulk', 'email', 'sms']));
