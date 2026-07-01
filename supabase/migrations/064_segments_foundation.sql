-- ============================================================
-- MIGRATION 064: Segments foundation
-- ============================================================
-- A "segment" is a saved snapshot of the roster's filter state — a
-- reusable audience/cohort (e.g. "Top Creators 10K+ GMV", the "CC
-- June" cohort Tyler hand-rolls today). Segments resolve to a creator
-- list by replaying filter_criteria through the existing /api/roster
-- path — NO new aggregation. Prebuilt lifecycle segments live in app
-- code (src/lib/data/prebuilt-segments.ts); this table stores the
-- CUSTOM, user-saved ones.
--
-- Scoping mirrors creator_brands / user_brand_access (migration 040):
--   tenant_id — owning tenant (always set)
--   brand_id  — a specific brand, or NULL = all brands in the tenant
-- Managers see only segments for their assigned brands or ones they
-- created; internal roles (owner/admin/viewer) see the whole tenant.
-- As with the rest of the v2 tables the app reaches this via the
-- service-role client, so RLS is defense-in-depth — app-layer scoping
-- in /api/segments is the primary control.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.segments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  brand_id        uuid REFERENCES brands_v2(id),       -- NULL = all brands in tenant
  name            text NOT NULL,
  description     text,
  kind            text NOT NULL DEFAULT 'custom'
                    CHECK (kind IN ('prebuilt', 'custom')),
  prebuilt_key    text,                                -- stable id when a prebuilt is pinned; NULL for custom
  filter_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,  -- serialized roster filter state
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'archived')),
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, brand_id, name)
);

CREATE INDEX IF NOT EXISTS idx_segments_tenant_brand ON public.segments(tenant_id, brand_id);
CREATE INDEX IF NOT EXISTS idx_segments_active ON public.segments(tenant_id) WHERE status = 'active';

-- keep updated_at fresh on edit (drives the "last modified" column)
CREATE OR REPLACE FUNCTION public.segments_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_segments_touch ON public.segments;
CREATE TRIGGER trg_segments_touch
  BEFORE UPDATE ON public.segments
  FOR EACH ROW EXECUTE FUNCTION public.segments_touch_updated_at();

-- ---- RLS (defense-in-depth; app scopes via the service-role client) ----
ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY internal_full_access ON public.segments
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() NOT IN ('brand', 'brand_contact', 'creator', 'manager')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY manager_scoped_access ON public.segments
    FOR ALL USING (
      tenant_id = public.get_tenant_id()
      AND public.get_user_role() = 'manager'
      AND (
        brand_id IN (SELECT brand_id FROM public.user_brand_access WHERE user_id = auth.uid())
        OR created_by = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- Verify:
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE schemaname='public' AND tablename='segments';
-- ============================================================
