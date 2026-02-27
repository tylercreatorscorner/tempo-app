-- ============================================================================
-- Supabase Vault for Credential Storage
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Enable the vault extension (already available in Supabase, just needs activation)
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- Create a table for brand credentials (encrypted via Vault)
-- This stores TikTok login credentials, API keys, etc. per brand
CREATE TABLE IF NOT EXISTS brand_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands_v2(id),
  brand_slug TEXT NOT NULL,
  credential_type TEXT NOT NULL,  -- 'tiktok_email', 'tiktok_password', 'api_key', 'imap_user', 'imap_password'
  credential_value TEXT NOT NULL, -- will be encrypted via vault.secrets
  tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT DEFAULT 'system',
  UNIQUE(brand_slug, credential_type, tenant_id)
);

-- RLS policies (service role only - no client access ever)
ALTER TABLE brand_credentials ENABLE ROW LEVEL SECURITY;

-- No public access policies. Only service role key can read/write.
-- This means credentials are NEVER accessible from client-side code.

-- Create a helper function to store a credential securely
CREATE OR REPLACE FUNCTION store_credential(
  p_brand_slug TEXT,
  p_credential_type TEXT,
  p_credential_value TEXT,
  p_tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
  v_secret_id UUID;
  v_brand_id UUID;
BEGIN
  -- Look up brand UUID
  SELECT id INTO v_brand_id FROM brands_v2 WHERE slug = p_brand_slug AND tenant_id = p_tenant_id;
  
  -- Store the actual secret in vault.secrets (encrypted at rest)
  INSERT INTO vault.secrets (secret, name, description)
  VALUES (
    p_credential_value,
    p_brand_slug || '/' || p_credential_type,
    'Brand credential: ' || p_credential_type || ' for ' || p_brand_slug
  )
  RETURNING id INTO v_secret_id;
  
  -- Store reference in our table (the value here is the vault secret ID, not plaintext)
  INSERT INTO brand_credentials (brand_id, brand_slug, credential_type, credential_value, tenant_id)
  VALUES (v_brand_id, p_brand_slug, p_credential_type, v_secret_id::TEXT, p_tenant_id)
  ON CONFLICT (brand_slug, credential_type, tenant_id) 
  DO UPDATE SET 
    credential_value = v_secret_id::TEXT,
    updated_at = now()
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a helper function to retrieve a credential
CREATE OR REPLACE FUNCTION get_credential(
  p_brand_slug TEXT,
  p_credential_type TEXT,
  p_tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'
) RETURNS TEXT AS $$
DECLARE
  v_secret_id UUID;
  v_secret TEXT;
BEGIN
  -- Get the vault secret ID from our table
  SELECT credential_value::UUID INTO v_secret_id
  FROM brand_credentials
  WHERE brand_slug = p_brand_slug 
    AND credential_type = p_credential_type
    AND tenant_id = p_tenant_id;
  
  IF v_secret_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Decrypt from vault
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE id = v_secret_id;
  
  RETURN v_secret;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to list credentials for a brand (without revealing values)
CREATE OR REPLACE FUNCTION list_credentials(
  p_brand_slug TEXT,
  p_tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'
) RETURNS TABLE(credential_type TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ) AS $$
BEGIN
  RETURN QUERY
  SELECT bc.credential_type, bc.created_at, bc.updated_at
  FROM brand_credentials bc
  WHERE bc.brand_slug = p_brand_slug AND bc.tenant_id = p_tenant_id
  ORDER BY bc.credential_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to delete a credential
CREATE OR REPLACE FUNCTION delete_credential(
  p_brand_slug TEXT,
  p_credential_type TEXT,
  p_tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'
) RETURNS BOOLEAN AS $$
DECLARE
  v_secret_id UUID;
BEGIN
  -- Get and delete from our table
  DELETE FROM brand_credentials
  WHERE brand_slug = p_brand_slug 
    AND credential_type = p_credential_type
    AND tenant_id = p_tenant_id
  RETURNING credential_value::UUID INTO v_secret_id;
  
  -- Delete from vault
  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- After running this migration, store credentials like this:
--
-- SELECT store_credential('jiyu', 'tiktok_email', 'email@example.com');
-- SELECT store_credential('jiyu', 'tiktok_password', 'secretpassword');
-- SELECT store_credential('jiyu', 'imap_user', 'email@gmail.com');
-- SELECT store_credential('jiyu', 'imap_app_password', 'xxxx xxxx xxxx xxxx');
--
-- Retrieve:
-- SELECT get_credential('jiyu', 'tiktok_email');
-- SELECT get_credential('jiyu', 'tiktok_password');
--
-- List (no values shown):
-- SELECT * FROM list_credentials('jiyu');
--
-- Delete:
-- SELECT delete_credential('jiyu', 'tiktok_password');
-- ============================================================================
