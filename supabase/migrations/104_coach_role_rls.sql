-- ============================================================
-- MIGRATION 104: Coach role — brand-scoped RLS (defense-in-depth)
-- ============================================================
-- New internal role 'coach': a staffer who works creators for assigned
-- brands, WITHOUT Finance or Products. App-layer scope mirrors manager
-- (user_brand_access); this migration is the RLS mirror of migration 040.
--
-- ⚠️ Without this, the tenant-wide internal_full_access policies
-- (get_user_role() NOT IN ('brand','manager')) would silently grant a
-- coach FULL tenant read+write under RLS — the exact landmine the July
-- role-model audit flagged for any new role. Pattern per table:
--   internal_full_access  — now excludes coach too
--   coach_scoped_access   — coach, only user_brand_access brands
-- ============================================================

-- Brand-keyed tables share one shape; creators_v2 scopes via creator_brands.
DO $mig$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'brands_v2', 'creator_brands', 'tiktok_accounts',
    'daily_creator_stats', 'daily_video_stats', 'daily_product_stats',
    'daily_video_product_stats'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS internal_full_access ON %I', t);
    EXECUTE format($p$
      CREATE POLICY internal_full_access ON %I
        FOR ALL USING (
          tenant_id = public.get_tenant_id()
          AND public.get_user_role() NOT IN ('brand', 'manager', 'coach')
        )
    $p$, t);
    EXECUTE format('DROP POLICY IF EXISTS coach_scoped_access ON %I', t);
    EXECUTE format($p$
      CREATE POLICY coach_scoped_access ON %I
        FOR ALL USING (
          tenant_id = public.get_tenant_id()
          AND public.get_user_role() = 'coach'
          AND %s IN (SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid())
        )
    $p$, t, CASE WHEN t = 'brands_v2' THEN 'id' ELSE 'brand_id' END);
  END LOOP;
END
$mig$;

-- creators_v2: no direct brand_id — scope via creator_brands, same as the
-- manager policy in migration 040.
DROP POLICY IF EXISTS internal_full_access ON creators_v2;
CREATE POLICY internal_full_access ON creators_v2
  FOR ALL USING (
    tenant_id = public.get_tenant_id()
    AND public.get_user_role() NOT IN ('brand', 'manager', 'coach')
  );
DROP POLICY IF EXISTS coach_scoped_access ON creators_v2;
CREATE POLICY coach_scoped_access ON creators_v2
  FOR ALL USING (
    tenant_id = public.get_tenant_id()
    AND public.get_user_role() = 'coach'
    AND id IN (
      SELECT cb.creator_id
      FROM public.creator_brands cb
      JOIN public.user_brand_access uba ON cb.brand_id = uba.brand_id
      WHERE uba.user_id = auth.uid()
    )
  );
