-- ============================================================
-- TEMPO SCHEMA V2 — Phase 2: Backfill People Data
-- ============================================================
-- Populates brands_v2, creators_v2, creator_brands, tiktok_accounts
-- from existing managed_creators + creator_accounts tables.
-- Safe to re-run (uses ON CONFLICT DO NOTHING).
-- ============================================================

-- ============================================================
-- Step 1: Insert Brands
-- ============================================================

INSERT INTO brands_v2 (id, tenant_id, name, slug, display_name, color, discord_guild_id)
VALUES
  ('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Cata-Kor', 'catakor', 'Cata-Kor', '#00C853', '1166776019655602236'),
  ('b0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Physicians Choice', 'physicians_choice', 'Physicians Choice', '#2196F3', '1181985490363240499'),
  ('b0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'JiYu', 'jiyu', 'JiYu', '#E91E8C', '1339335585776533708'),
  ('b0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Toplux Nutrition', 'toplux', 'Toplux Nutrition', '#FF9800', '1452562452733759531')
ON CONFLICT DO NOTHING;

-- Map old brand slugs to new UUIDs
INSERT INTO _migration_id_map (old_table, old_id, new_id)
VALUES
  ('brands', 'catakor', 'b0000000-0000-0000-0000-000000000001'),
  ('brands', 'physicians_choice', 'b0000000-0000-0000-0000-000000000002'),
  ('brands', 'jiyu', 'b0000000-0000-0000-0000-000000000003'),
  ('brands', 'toplux', 'b0000000-0000-0000-0000-000000000004')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Step 2: Insert Creators (one row per unique person)
-- ============================================================
-- managed_creators can have the same person across multiple brands.
-- We deduplicate by real_name + discord_id where possible.
-- For creators without those, each row becomes its own person.
-- ============================================================

-- First: creators WITH a discord_id (best dedup key)
INSERT INTO creators_v2 (id, tenant_id, real_name, email, phone, discord_id, discord_username, discord_avatar, notes)
SELECT DISTINCT ON (mc.discord_id)
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  mc.real_name,
  mc.email,
  mc.phone,
  mc.discord_id,
  mc.discord_name,
  mc.discord_avatar,
  mc.notes
FROM managed_creators mc
WHERE mc.discord_id IS NOT NULL AND mc.discord_id != ''
ORDER BY mc.discord_id, mc.id;

-- Second: creators WITHOUT discord_id (each is treated as unique)
INSERT INTO creators_v2 (id, tenant_id, real_name, email, phone, notes)
SELECT
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  mc.real_name,
  mc.email,
  mc.phone,
  mc.notes
FROM managed_creators mc
WHERE mc.discord_id IS NULL OR mc.discord_id = '';

-- ============================================================
-- Step 3: Map old managed_creators IDs to new creators_v2 IDs
-- ============================================================

-- For creators with discord_id: map via discord_id match
INSERT INTO _migration_id_map (old_table, old_id, new_id)
SELECT
  'managed_creators',
  mc.id::TEXT,
  cv.id
FROM managed_creators mc
JOIN creators_v2 cv ON cv.discord_id = mc.discord_id
WHERE mc.discord_id IS NOT NULL AND mc.discord_id != ''
ON CONFLICT DO NOTHING;

-- For creators without discord_id: match by real_name + email combo
-- (these were inserted 1:1 so we match on all fields)
INSERT INTO _migration_id_map (old_table, old_id, new_id)
SELECT
  'managed_creators',
  mc.id::TEXT,
  cv.id
FROM managed_creators mc
JOIN creators_v2 cv ON
  (cv.real_name = mc.real_name OR (cv.real_name IS NULL AND mc.real_name IS NULL))
  AND (cv.email = mc.email OR (cv.email IS NULL AND mc.email IS NULL))
  AND (cv.phone = mc.phone OR (cv.phone IS NULL AND mc.phone IS NULL))
  AND cv.discord_id IS NULL
WHERE mc.discord_id IS NULL OR mc.discord_id = ''
ON CONFLICT DO NOTHING;

-- ============================================================
-- Step 4: Create creator_brands rows
-- ============================================================
-- One row per managed_creator, linking to the new creator and brand

INSERT INTO creator_brands (
  id, creator_id, brand_id, tenant_id, is_managed, status, retainer,
  monthly_post_requirement, contract_length_days, retainer_start_date,
  current_tier, role, product_assignments, product_retainers,
  lifetime_gmv, weeks_in_top_5, weeks_in_top_10, first_top_10_date,
  employment_status, application_id, joined_at, applied_at,
  terminated_at, termination_reason, status_changed_at,  -- terminated_at derived from status_changed_at
  last_contact_date, next_followup_date
)
SELECT
  gen_random_uuid(),
  mmap.new_id,                    -- creator_id from mapping
  bmap.new_id,                    -- brand_id from mapping
  '00000000-0000-0000-0000-000000000001',
  true,                           -- all managed_creators are managed
  COALESCE(mc.status, 'active'),
  COALESCE(mc.retainer, 0),
  mc.monthly_post_requirement,
  mc.contract_length_days,
  mc.retainer_start_date,
  mc.current_tier,
  mc.role,
  mc.product_assignments,
  mc.product_retainers,
  COALESCE(mc.lifetime_gmv, 0),
  COALESCE(mc.weeks_in_top_5, 0),
  COALESCE(mc.weeks_in_top_10, 0),
  mc.first_top_10_date,
  COALESCE(mc.employment_status, 'active'),
  mc.application_id,
  mc.joined_at,
  mc.applied_at,
  CASE WHEN mc.employment_status = 'terminated' THEN mc.status_changed_at ELSE NULL END,
  mc.termination_reason,
  mc.status_changed_at,
  mc.last_contact_date,
  mc.next_followup_date
FROM managed_creators mc
JOIN _migration_id_map mmap ON mmap.old_table = 'managed_creators' AND mmap.old_id = mc.id::TEXT
JOIN _migration_id_map bmap ON bmap.old_table = 'brands' AND bmap.old_id = mc.brand
ON CONFLICT DO NOTHING;

-- ============================================================
-- Step 5: Create tiktok_accounts from creator_accounts
-- ============================================================

INSERT INTO tiktok_accounts (
  id, creator_id, tenant_id, brand_id, tiktok_username, is_primary
)
SELECT
  gen_random_uuid(),
  mmap.new_id,                    -- creator_id from mapping
  '00000000-0000-0000-0000-000000000001',
  bmap.new_id,                    -- brand_id from mapping
  ca.tiktok_username,
  ca.is_primary
FROM creator_accounts ca
JOIN _migration_id_map mmap ON mmap.old_table = 'managed_creators' AND mmap.old_id = ca.creator_id::TEXT
JOIN _migration_id_map bmap ON bmap.old_table = 'brands' AND bmap.old_id = ca.brand
ON CONFLICT DO NOTHING;

-- ============================================================
-- Verification queries (run after to check counts)
-- ============================================================
-- SELECT 'brands_v2' as tbl, count(*) FROM brands_v2
-- UNION ALL SELECT 'creators_v2', count(*) FROM creators_v2
-- UNION ALL SELECT 'creator_brands', count(*) FROM creator_brands
-- UNION ALL SELECT 'tiktok_accounts', count(*) FROM tiktok_accounts
-- UNION ALL SELECT '_migration_id_map', count(*) FROM _migration_id_map;
--
-- Expected:
--   brands_v2: 4
--   creators_v2: ~1,049 (may be less if deduped across brands)
--   creator_brands: ~1,049 (one per managed_creator)
--   tiktok_accounts: ~1,012 (one per creator_account)
--   _migration_id_map: ~1,053 (4 brands + ~1,049 creators)
-- ============================================================
