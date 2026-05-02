-- ============================================================
-- MIGRATION 022: Brand-Scoped Access for Client Users
-- ============================================================
-- Adds the user_brand_access junction table and replaces the
-- existing tenant-only RLS policies on all v2 data tables with
-- two-tier policies:
--   • Internal users (owner/admin/manager/etc.) — full access
--     within their tenant (same as before)
--   • Brand users (role = 'brand') — read-only, scoped to
--     the specific brand(s) assigned via user_brand_access
-- ============================================================

-- ============================================================
-- 1. user_brand_access table
-- ============================================================
-- Maps a brand-role user to the brand(s) they can see.
-- Managed exclusively by admins via the service role (RLS
-- SELECT policy below is for user-facing reads only).

CREATE TABLE IF NOT EXISTS user_brand_access (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id   UUID NOT NULL REFERENCES brands_v2(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, brand_id)
);

CREATE INDEX IF NOT EXISTS idx_uba_user   ON user_brand_access(user_id);
CREATE INDEX IF NOT EXISTS idx_uba_brand  ON user_brand_access(brand_id);
CREATE INDEX IF NOT EXISTS idx_uba_tenant ON user_brand_access(tenant_id);

ALTER TABLE user_brand_access ENABLE ROW LEVEL SECURITY;

-- Users can see their own rows; admins/owners can see all in their tenant
DO $$ BEGIN
  CREATE POLICY uba_select ON user_brand_access FOR SELECT USING (
    user_id = auth.uid()
    OR (
      public.get_tenant_id() = tenant_id
      AND public.get_user_role() IN ('owner', 'admin', 'manager')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. Helper: get the current user's role
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
  SELECT role FROM public.user_profiles WHERE user_id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- 3. Replace RLS on v2 tables with brand-scoped policies
-- ============================================================
-- Pattern per table:
--   Policy A (FOR ALL)    — non-brand users, full tenant access
--   Policy B (FOR SELECT) — brand users, read-only, brand-scoped
--
-- We drop all pre-existing policies (from migrations 010 & 019)
-- before creating the new ones.
-- ============================================================

-- ---- brands_v2 ----
DROP POLICY IF EXISTS "tenant_isolation" ON brands_v2;
DROP POLICY IF EXISTS tenant_isolation_brands ON brands_v2;

DO $$ BEGIN
  CREATE POLICY internal_full_access ON brands_v2
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() != 'brand'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY brand_read_access ON brands_v2
    FOR SELECT USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() = 'brand'
      AND id IN (
        SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---- creator_brands ----
DROP POLICY IF EXISTS "tenant_isolation" ON creator_brands;
DROP POLICY IF EXISTS tenant_iso_creator_brands ON creator_brands;

DO $$ BEGIN
  CREATE POLICY internal_full_access ON creator_brands
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() != 'brand'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY brand_read_access ON creator_brands
    FOR SELECT USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() = 'brand'
      AND brand_id IN (
        SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---- creators_v2 ----
-- No direct brand_id; scoped via creator_brands junction.
DROP POLICY IF EXISTS "tenant_isolation" ON creators_v2;
DROP POLICY IF EXISTS tenant_iso_creators ON creators_v2;

DO $$ BEGIN
  CREATE POLICY internal_full_access ON creators_v2
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() != 'brand'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY brand_read_access ON creators_v2
    FOR SELECT USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() = 'brand'
      AND id IN (
        SELECT cb.creator_id
        FROM public.creator_brands cb
        JOIN public.user_brand_access uba ON cb.brand_id = uba.brand_id
        WHERE uba.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---- tiktok_accounts ----
DROP POLICY IF EXISTS "tenant_isolation" ON tiktok_accounts;
DROP POLICY IF EXISTS tenant_iso_tiktok ON tiktok_accounts;

DO $$ BEGIN
  CREATE POLICY internal_full_access ON tiktok_accounts
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() != 'brand'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY brand_read_access ON tiktok_accounts
    FOR SELECT USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() = 'brand'
      AND brand_id IN (
        SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---- daily_creator_stats ----
DROP POLICY IF EXISTS "tenant_isolation" ON daily_creator_stats;
DROP POLICY IF EXISTS tenant_iso_daily_creator ON daily_creator_stats;

DO $$ BEGIN
  CREATE POLICY internal_full_access ON daily_creator_stats
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() != 'brand'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY brand_read_access ON daily_creator_stats
    FOR SELECT USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() = 'brand'
      AND brand_id IN (
        SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---- daily_video_stats ----
DROP POLICY IF EXISTS "tenant_isolation" ON daily_video_stats;
DROP POLICY IF EXISTS tenant_iso_daily_video ON daily_video_stats;

DO $$ BEGIN
  CREATE POLICY internal_full_access ON daily_video_stats
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() != 'brand'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY brand_read_access ON daily_video_stats
    FOR SELECT USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() = 'brand'
      AND brand_id IN (
        SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---- daily_product_stats ----
DROP POLICY IF EXISTS "tenant_isolation" ON daily_product_stats;
DROP POLICY IF EXISTS tenant_iso_daily_product ON daily_product_stats;

DO $$ BEGIN
  CREATE POLICY internal_full_access ON daily_product_stats
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() != 'brand'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY brand_read_access ON daily_product_stats
    FOR SELECT USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() = 'brand'
      AND brand_id IN (
        SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---- daily_video_product_stats ----
DROP POLICY IF EXISTS "tenant_isolation" ON daily_video_product_stats;
DROP POLICY IF EXISTS tenant_iso_daily_vp ON daily_video_product_stats;

DO $$ BEGIN
  CREATE POLICY internal_full_access ON daily_video_product_stats
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() != 'brand'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY brand_read_access ON daily_video_product_stats
    FOR SELECT USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() = 'brand'
      AND brand_id IN (
        SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Done. Verify with:
--
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
--
-- Expected: each v2 table has 'internal_full_access' (ALL)
-- and 'brand_read_access' (SELECT). user_brand_access has
-- 'uba_select' (SELECT).
-- ============================================================
