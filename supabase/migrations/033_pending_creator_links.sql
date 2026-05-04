-- pending_creator_links: when a creator runs /link with a handle that doesn't
-- match anything in tiktok_accounts (typo, brand-new creator, unmatched account),
-- we capture the request here for admin review instead of silently failing.

CREATE TABLE IF NOT EXISTS pending_creator_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands_v2(id),
  guild_id          TEXT NOT NULL,
  discord_user_id   TEXT NOT NULL,
  discord_username  TEXT,
  requested_handle  TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  notes             TEXT,
  reviewed_by       TEXT,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pcl_brand_status
  ON pending_creator_links(brand_id, status);
CREATE INDEX IF NOT EXISTS idx_pcl_discord_user
  ON pending_creator_links(discord_user_id);

-- A user can only have one open pending request per brand at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_pcl_unique_pending
  ON pending_creator_links(brand_id, discord_user_id)
  WHERE status = 'pending';

ALTER TABLE pending_creator_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON pending_creator_links FOR ALL USING (true);
