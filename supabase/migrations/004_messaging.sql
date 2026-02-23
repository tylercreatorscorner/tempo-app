-- 004_messaging.sql — Creator messages and reminders tables
-- NOTE: Run this manually in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS creator_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  creator_id INTEGER REFERENCES managed_creators(id),
  discord_user_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  channel TEXT NOT NULL CHECK (channel IN ('dm', 'channel', 'bulk')),
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'blocked')),
  sent_by TEXT, -- who initiated (manager name or 'system')
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('creator', 'role', 'channel')),
  target_id TEXT NOT NULL,
  content TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_creator ON creator_messages(creator_id);
CREATE INDEX idx_messages_tenant ON creator_messages(tenant_id);
CREATE INDEX idx_reminders_scheduled ON reminders(scheduled_for) WHERE status = 'pending';
