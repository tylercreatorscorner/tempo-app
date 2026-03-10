-- ============================================================
-- MIGRATION 017: Add onboarding step tracking to tenants
-- ============================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tiktok_connected BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS creators_added BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS discord_connected BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- Set existing tenant (Tyler's) as fully onboarded
UPDATE tenants 
SET tiktok_connected = true, 
    creators_added = true, 
    discord_connected = true,
    plan = 'agency'
WHERE id = '00000000-0000-0000-0000-000000000001';
