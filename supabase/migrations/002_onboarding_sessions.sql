-- ============================================================
-- MIGRATION 002: Onboarding Sessions
-- ============================================================
-- Stores pre-auth onboarding data before payment completes.
-- Run in Supabase SQL Editor manually.
-- ============================================================

CREATE TABLE IF NOT EXISTS onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('brand', 'agency')),
  agency_brand_count INTEGER,
  stripe_customer_id TEXT,
  stripe_session_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_sessions_email ON onboarding_sessions(email);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_stripe ON onboarding_sessions(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_status ON onboarding_sessions(status);

-- RLS: only service role should access this table
ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;
-- No policies = only service role key can access (which is what we want)
