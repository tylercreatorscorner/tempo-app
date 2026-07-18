-- Distribution tracking for claim-link DMs (Discord). Lets the send job be
-- resumable + idempotent: each token row records who it's for and whether the DM
-- was delivered, so a re-run skips 'sent' and retries 'pending'/'failed'.

ALTER TABLE public.creator_claim_tokens
  ADD COLUMN IF NOT EXISTS discord_id text,
  ADD COLUMN IF NOT EXISTS dm_status  text NOT NULL DEFAULT 'pending', -- pending|sent|blocked|failed
  ADD COLUMN IF NOT EXISTS dm_at      timestamptz,
  ADD COLUMN IF NOT EXISTS dm_error   text;

CREATE INDEX IF NOT EXISTS idx_creator_claim_tokens_dm_queue
  ON public.creator_claim_tokens (dm_status)
  WHERE consumed_at IS NULL;
