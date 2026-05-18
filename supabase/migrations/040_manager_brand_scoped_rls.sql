-- ============================================================
-- MIGRATION 040: Manager role is brand-scoped (defense-in-depth)
-- ============================================================
-- Migration 022 made the `brand` role read-only + brand-scoped via
-- user_brand_access, but left `internal_full_access` as
-- (role != 'brand'), so `manager` still gets FULL tenant access
-- under RLS. Managers are agency operators scoped to a subset of
-- brands — this migration narrows the manager role the same way
-- 022 did for brands, except managers get FULL (read+write)
-- access to their assigned brands, not read-only.
--
-- NOTE: this is defense-in-depth only. The app reaches these
-- tables predominantly via the service-role client, which bypasses
-- RLS entirely; the primary manager-scoping control is the
-- application layer (getWorkspaceScope / getAllowedBrandsForUser).
-- This migration protects the minority of anon/auth-client paths
-- and any future code that forgets to scope.
--
-- Pattern per table:
--   internal_full_access  (FOR ALL)    — owner/admin/viewer, full tenant
--   manager_scoped_access (FOR ALL)    — manager, only user_brand_access brands
--   brand_read_access     (FOR SELECT) — unchanged from 022
-- ============================================================

-- Helpers public.get_tenant_id() / public.get_user_role() already
-- exist (migrations 019 / 022).

-- ---- brands_v2 ----
DROP POLICY IF EXISTS internal_full_access ON brands_v2;
DO $$ BEGIN
  CREATE POLICY internal_full_access ON brands_v2
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() NOT IN ('brand', 'manager')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY manager_scoped_access ON brands_v2
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() = 'manager'
      AND id IN (SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---- creator_brands ----
DROP POLICY IF EXISTS internal_full_access ON creator_brands;
DO $$ BEGIN
  CREATE POLICY internal_full_access ON creator_brands
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() NOT IN ('brand', 'manager')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY manager_scoped_access ON creator_brands
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() = 'manager'
      AND brand_id IN (SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---- creators_v2 (no direct brand_id; scoped via creator_brands) ----
DROP POLICY IF EXISTS internal_full_access ON creators_v2;
DO $$ BEGIN
  CREATE POLICY internal_full_access ON creators_v2
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() NOT IN ('brand', 'manager')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY manager_scoped_access ON creators_v2
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() = 'manager'
      AND id IN (
        SELECT cb.creator_id
        FROM public.creator_brands cb
        JOIN public.user_brand_access uba ON cb.brand_id = uba.brand_id
        WHERE uba.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---- tiktok_accounts ----
DROP POLICY IF EXISTS internal_full_access ON tiktok_accounts;
DO $$ BEGIN
  CREATE POLICY internal_full_access ON tiktok_accounts
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() NOT IN ('brand', 'manager')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY manager_scoped_access ON tiktok_accounts
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() = 'manager'
      AND brand_id IN (SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---- daily_creator_stats ----
DROP POLICY IF EXISTS internal_full_access ON daily_creator_stats;
DO $$ BEGIN
  CREATE POLICY internal_full_access ON daily_creator_stats
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() NOT IN ('brand', 'manager')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY manager_scoped_access ON daily_creator_stats
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() = 'manager'
      AND brand_id IN (SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---- daily_video_stats ----
DROP POLICY IF EXISTS internal_full_access ON daily_video_stats;
DO $$ BEGIN
  CREATE POLICY internal_full_access ON daily_video_stats
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() NOT IN ('brand', 'manager')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY manager_scoped_access ON daily_video_stats
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() = 'manager'
      AND brand_id IN (SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---- daily_product_stats ----
DROP POLICY IF EXISTS internal_full_access ON daily_product_stats;
DO $$ BEGIN
  CREATE POLICY internal_full_access ON daily_product_stats
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() NOT IN ('brand', 'manager')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY manager_scoped_access ON daily_product_stats
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() = 'manager'
      AND brand_id IN (SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---- daily_video_product_stats ----
DROP POLICY IF EXISTS internal_full_access ON daily_video_product_stats;
DO $$ BEGIN
  CREATE POLICY internal_full_access ON daily_video_product_stats
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() NOT IN ('brand', 'manager')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY manager_scoped_access ON daily_video_product_stats
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() = 'manager'
      AND brand_id IN (SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- Verify:
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE schemaname='public' AND policyname IN
--     ('internal_full_access','manager_scoped_access','brand_read_access')
--   ORDER BY tablename, policyname;
-- Expected per v2 table: internal_full_access (ALL),
-- manager_scoped_access (ALL), brand_read_access (SELECT).
-- ============================================================
