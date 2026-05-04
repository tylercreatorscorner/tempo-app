-- Tempo Bot v2 — foundation tables
-- 1. brand_discord_config: per-brand Discord settings (channels, roles, feature flags)
-- 2. creators_v2.private_channel_id: links a creator to their Ticket Tool ticket channel

-- ============================================================
-- brand_discord_config
-- ============================================================

CREATE TABLE IF NOT EXISTS brand_discord_config (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                 UUID NOT NULL REFERENCES brands_v2(id),
  guild_id                 TEXT NOT NULL UNIQUE,

  -- People
  head_coach_discord_id    TEXT,        -- pinged for new videos / coaching events

  -- Channel mappings
  daily_brief_channel_id   TEXT,
  weekly_recap_channel_id  TEXT,
  wins_channel_id          TEXT,        -- milestone celebrations
  errors_channel_id        TEXT,        -- bot-internal error reports
  ticket_category_id       TEXT,        -- Ticket Tool category to watch

  -- Feature flags (per-guild kill switches)
  enable_daily_brief       BOOLEAN DEFAULT true,
  enable_weekly_recap      BOOLEAN DEFAULT true,
  enable_milestones        BOOLEAN DEFAULT true,
  enable_video_feed        BOOLEAN DEFAULT true,
  enable_auto_welcome      BOOLEAN DEFAULT true,

  -- Cron timing (UTC)
  daily_brief_hour_utc     INTEGER DEFAULT 14 CHECK (daily_brief_hour_utc BETWEEN 0 AND 23),

  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bdc_guild ON brand_discord_config(guild_id);
CREATE INDEX IF NOT EXISTS idx_bdc_brand ON brand_discord_config(brand_id);

ALTER TABLE brand_discord_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON brand_discord_config FOR ALL USING (true);

-- ============================================================
-- creators_v2: link to Ticket Tool private channel
-- ============================================================

ALTER TABLE creators_v2 ADD COLUMN IF NOT EXISTS private_channel_id TEXT;
ALTER TABLE creators_v2 ADD COLUMN IF NOT EXISTS private_channel_guild_id TEXT;
CREATE INDEX IF NOT EXISTS idx_cv2_private_channel ON creators_v2(private_channel_id);

-- ============================================================
-- Backfill: seed brand_discord_config from brands_v2.discord_guild_id
-- where the column already has values (catakor, jiyu, physicians_choice, toplux)
-- ============================================================

INSERT INTO brand_discord_config (brand_id, guild_id)
SELECT id, discord_guild_id
FROM brands_v2
WHERE discord_guild_id IS NOT NULL
ON CONFLICT (guild_id) DO NOTHING;
