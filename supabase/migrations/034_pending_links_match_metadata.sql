-- Enhance pending_creator_links to support both /link (user-typed handle) and
-- /scan (admin fuzzy-match against unlinked creators). One unified review queue.

ALTER TABLE pending_creator_links
  ALTER COLUMN requested_handle DROP NOT NULL;

ALTER TABLE pending_creator_links
  ADD COLUMN IF NOT EXISTS matched_creator_id   UUID REFERENCES creators_v2(id),
  ADD COLUMN IF NOT EXISTS match_type           TEXT
    CHECK (match_type IN ('exact', 'fuzzy', 'none', 'manual')),
  ADD COLUMN IF NOT EXISTS match_confidence     NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS match_reason         TEXT,
  ADD COLUMN IF NOT EXISTS source               TEXT NOT NULL DEFAULT 'user_link'
    CHECK (source IN ('user_link', 'admin_scan', 'manual')),
  ADD COLUMN IF NOT EXISTS discord_display_name TEXT,
  ADD COLUMN IF NOT EXISTS discord_avatar_url   TEXT;

CREATE INDEX IF NOT EXISTS idx_pcl_match_type
  ON pending_creator_links(brand_id, match_type) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pcl_source
  ON pending_creator_links(brand_id, source) WHERE status = 'pending';
