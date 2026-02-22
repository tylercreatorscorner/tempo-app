-- 003_creator_portal.sql
-- Creator accounts junction, invites, and auth support

-- ============================================
-- 1. creator_accounts junction table
-- ============================================
CREATE TABLE IF NOT EXISTS creator_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id INT NOT NULL REFERENCES managed_creators(id) ON DELETE CASCADE,
  tiktok_username TEXT NOT NULL,
  brand TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_accounts_unique
  ON creator_accounts(tiktok_username, brand, tenant_id);
CREATE INDEX IF NOT EXISTS idx_creator_accounts_creator
  ON creator_accounts(creator_id);

ALTER TABLE creator_accounts ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. invites table
-- ============================================
CREATE TABLE IF NOT EXISTS invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  brand TEXT NOT NULL,
  created_by TEXT, -- admin email or name
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  max_uses INT DEFAULT 100,
  current_uses INT DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invites_code ON invites(code);
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. creator_sessions table (magic link tokens)
-- ============================================
CREATE TABLE IF NOT EXISTS creator_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id INT NOT NULL REFERENCES managed_creators(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_sessions_hash ON creator_sessions(token_hash);
ALTER TABLE creator_sessions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. Backfill: migrate account_1-10 into creator_accounts
-- ============================================
-- This inserts all non-null account columns as separate rows.
-- Run once after table creation.

INSERT INTO creator_accounts (creator_id, tiktok_username, brand, is_primary, verified, tenant_id)
SELECT id, lower(trim(acct)), brand, (rn = 1), true, tenant_id
FROM (
  SELECT id, brand, tenant_id,
    unnest(ARRAY[account_1, account_2, account_3, account_4, account_5,
                 account_6, account_7, account_8, account_9, account_10]) AS acct,
    unnest(ARRAY[1,2,3,4,5,6,7,8,9,10]) AS rn
  FROM managed_creators
  WHERE tenant_id IS NOT NULL
) sub
WHERE acct IS NOT NULL AND trim(acct) <> ''
ON CONFLICT (tiktok_username, brand, tenant_id) DO NOTHING;
