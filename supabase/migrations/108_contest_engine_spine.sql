-- Contest engine Phase 1 (approved mockup + owner calls: creator+Discord
-- surfaces only, single AND multi-place prizes, raffle entry rule chosen per
-- contest). A contest = leaderboard + window + prize. RLS-no-policy on all
-- four tables: service-role only (admin APIs + portal server code), the
-- client_reports model.
CREATE TABLE IF NOT EXISTS contests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  name text NOT NULL,
  scope_kind text NOT NULL CHECK (scope_kind IN ('brand','segment','all')),
  brand_slug text,                    -- scope_kind='brand'
  segment_id uuid,                    -- scope_kind='segment' (provenance only)
  criteria jsonb,                     -- frozen SegmentFilterCriteria at launch
  scoring text NOT NULL CHECK (scoring IN ('gmv','posts','manual','raffle')),
  -- Raffle entry accrual, chosen in the builder per contest:
  raffle_entry_rule text CHECK (raffle_entry_rule IN ('per_posting_day','per_post','per_gmv_step','one_per_creator')),
  raffle_gmv_step numeric,            -- dollars per entry when per_gmv_step
  window_start date NOT NULL,
  window_end date NOT NULL,
  -- [{place:1,label:'$1,000',amount:1000}] - amount null for non-cash prizes
  prizes jsonb NOT NULL DEFAULT '[]'::jsonb,
  announce_discord boolean NOT NULL DEFAULT false,
  announce_wins boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','live','closed','settled')),
  settled_through date,               -- the data cutoff the settle scored against
  raffle_seed_hash text,              -- commit (published at close)
  raffle_seed text,                   -- reveal (published at draw)
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  launched_at timestamptz,
  closed_at timestamptz,
  settled_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_contests_status ON contests (status, window_end);

-- Entrants FROZEN at launch (fair: the cohort locks when the gun goes off;
-- a segment edited mid-contest must not change who competes). One row per
-- HUMAN (multi-handle people deduped at resolve time); handles array carries
-- every handle that scores for them.
CREATE TABLE IF NOT EXISTS contest_entrants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  creator_id uuid,
  handles text[] NOT NULL,
  display_name text,
  UNIQUE (contest_id, creator_id)
);
CREATE INDEX IF NOT EXISTS idx_contest_entrants ON contest_entrants (contest_id);

CREATE TABLE IF NOT EXISTS contest_winners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  place int NOT NULL,
  creator_id uuid,
  handle text,
  display_name text,
  score numeric,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contest_id, place)
);

-- The payouts-ledger seed: settling a contest writes each winner's prize as
-- OWED. The Automated Payouts station consumes these; until then paid is a
-- manual stamp. announced_at = the announce-once idempotency (mig 035's
-- creator_milestones pattern) for the future #wins post.
CREATE TABLE IF NOT EXISTS creator_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid REFERENCES contests(id) ON DELETE SET NULL,
  creator_id uuid,
  handle text,
  display_name text,
  brand_slug text,
  place int,
  amount numeric,                     -- null for non-cash prizes
  label text NOT NULL,                -- '$1,000' / '$250 + featured'
  status text NOT NULL DEFAULT 'owed' CHECK (status IN ('owed','paid')),
  awarded_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  announced_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_creator_prizes_status ON creator_prizes (status, awarded_at DESC);

ALTER TABLE contests ENABLE ROW LEVEL SECURITY;
ALTER TABLE contest_entrants ENABLE ROW LEVEL SECURITY;
ALTER TABLE contest_winners ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_prizes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON contests, contest_entrants, contest_winners, creator_prizes FROM anon, authenticated;
