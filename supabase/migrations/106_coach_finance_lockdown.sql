-- ============================================================
-- MIGRATION 106: the review findings mig 104 missed
-- ============================================================
-- Adversarial review of the Coach role (all verified live in prod):
--
-- 1) user_profiles_role_check did NOT include 'coach' — inviting a coach
--    would fail at the DB. Widened.
-- 2) segments: internal_full_access excluded only brand/brand_contact/
--    creator/manager, so a coach passed it — FULL tenant read+write on
--    segments, MORE privilege than the manager it mirrors, and segments
--    feed broadcast audiences. Coach joins the exclusion + gets the
--    manager-shaped scoped policy.
-- 3) THE CRITICAL: the finance tables the coach lock is actually about
--    (invoices, team_members, brand_settings, payment_audit_log,
--    brand_compensation, marketing_gmv) were RLS-OFF with full CRUD
--    granted to anon AND authenticated — any authenticated session could
--    read/rewrite every invoice straight through PostgREST, sidestepping
--    every app-layer gate. All app access to these goes through the
--    service-role client (the one session-client read, brands/[slug]'s
--    brand_settings goal read, moves to the admin client in this commit).
--    RLS on + explicit REVOKEs, modeled on mig 105's earnings_ledger.
--    This also closes the PRE-EXISTING finance-blind-manager exposure.
--    (managed_creators/video_performance carry similar grants but have
--    session-client readers — tracked for the house-wide sweep, not
--    flipped blind here.)
-- ============================================================

-- 1) Role check
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check
  CHECK (role = ANY (ARRAY[
    'owner','admin','manager','coach','analyst','brand_contact','brand',
    'creator','pending','viewer','content_lead','payments','automations','va'
  ]::text[]));

-- 2) segments policies
DROP POLICY IF EXISTS internal_full_access ON segments;
CREATE POLICY internal_full_access ON segments
  FOR ALL USING (
    tenant_id = public.get_tenant_id()
    AND public.get_user_role() NOT IN ('brand', 'brand_contact', 'creator', 'manager', 'coach')
  );
DROP POLICY IF EXISTS coach_scoped_access ON segments;
CREATE POLICY coach_scoped_access ON segments
  FOR ALL USING (
    tenant_id = public.get_tenant_id()
    AND public.get_user_role() = 'coach'
    AND (
      brand_id IN (SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid())
      OR created_by = auth.uid()
    )
  );

-- 3) Finance tables: service-role only.
DO $mig$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'invoices', 'team_members', 'brand_settings', 'payment_audit_log',
    'brand_compensation', 'marketing_gmv'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END
$mig$;
