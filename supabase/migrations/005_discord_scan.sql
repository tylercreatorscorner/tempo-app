-- Discord Match Queue: stores scan results for review
CREATE TABLE IF NOT EXISTS discord_match_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  discord_username TEXT NOT NULL,
  discord_display_name TEXT,
  discord_avatar_url TEXT,
  matched_creator_id INTEGER REFERENCES managed_creators(id),
  match_type TEXT NOT NULL CHECK (match_type IN ('exact', 'fuzzy', 'none')),
  match_confidence NUMERIC(3,2),
  match_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'skipped')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE INDEX idx_discord_match_queue_status ON discord_match_queue(status);
CREATE INDEX idx_discord_match_queue_guild ON discord_match_queue(guild_id);
-- Prevent duplicate scans of same user in same guild
CREATE UNIQUE INDEX idx_discord_match_queue_unique ON discord_match_queue(guild_id, discord_user_id);
