-- Add UUID-based creator reference to discord_match_queue for v2 schema compatibility.
-- The original matched_creator_id is an INTEGER FK to managed_creators (legacy).
-- The bot now resolves creators via creators_v2 (UUID PKs), so we add a parallel column.

ALTER TABLE discord_match_queue
  ADD COLUMN IF NOT EXISTS matched_creator_v2_id UUID REFERENCES creators_v2(id);

CREATE INDEX IF NOT EXISTS idx_discord_match_queue_v2_creator
  ON discord_match_queue(matched_creator_v2_id);
