-- Comms hub Phase A (approved mockup 2026-07-24): broadcast-to-segment with
-- a per-recipient delivery log, drained by a cron queue (a few hundred DMs
-- at ~1/s outlives any single serverless request). RLS enabled with NO
-- policies on both tables: service-role only, same model as client_reports.
CREATE TABLE IF NOT EXISTS broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  segment_id uuid,                   -- saved segment, when one was picked
  audience_label text NOT NULL,      -- human label frozen at create ("Top Creators (10K+ GMV)")
  criteria jsonb NOT NULL,           -- SegmentFilterCriteria snapshot
  channel text NOT NULL CHECK (channel IN ('discord_dm','email','sms')),
  template_key text,
  body text NOT NULL,                -- the un-personalized template body
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','done','failed','canceled')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_broadcasts_created ON broadcasts (created_at DESC);

CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  creator_id uuid,                   -- creators_v2 id when known
  handle text,
  display_name text,
  channel text NOT NULL,
  contact_value text,                -- discord snowflake / email / E.164 (resolved at enqueue)
  resolved_body text,                -- personalized message frozen at enqueue
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','delivered','failed','blocked','skipped')),
  skip_reason text,                  -- 'no_contact' | 'opted_out' | ...
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_drain ON broadcast_recipients (broadcast_id, status);
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_recipients ENABLE ROW LEVEL SECURITY;

-- Widen creator_messages.channel for the later email/sms channels now, while
-- nothing depends on it (adding allowed values is backward compatible; doing
-- it mid-Phase-C would be a change under a live consumer). Constraint name
-- resolved dynamically - it predates migration files.
DO $$
DECLARE con_name text;
BEGIN
  SELECT conname INTO con_name FROM pg_constraint
  WHERE conrelid = 'creator_messages'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%channel%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE creator_messages DROP CONSTRAINT %I', con_name);
  END IF;
  ALTER TABLE creator_messages ADD CONSTRAINT creator_messages_channel_check
    CHECK (channel IN ('dm','channel','bulk','sms','email'));
END $$;

-- Bot liveness: the DM pipeline died silently in March (last creator_messages
-- row 2026-03-01) and nothing surfaced it - the Jen-incident lesson applied
-- to Discord. The bot upserts this row on ready + every few minutes; the
-- Comms inbox shows "bot offline since X" when it goes stale.
CREATE TABLE IF NOT EXISTS bot_status (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  version text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE bot_status ENABLE ROW LEVEL SECURITY;
