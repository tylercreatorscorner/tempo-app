-- 056_brands_v2_parent_brand_id.sql
--
-- Phase 0 of retiring the hardcoded brand maps (BRAND_UUID_MAP / LEEFAR_STORE_SLUGS
-- / HIDDEN_FROM_PICKER / ACTIVE_BRANDS). Make the umbrella->store relationship a
-- real DB relationship so the umbrella->stores expansion, the "hide store from
-- picker" predicate, and the umbrella-grain active set can all be DERIVED from
-- brands_v2 instead of hand-maintained lists.
--
-- Derivations this enables:
--   expand umbrella -> stores   = children ORDER BY store_order
--   hidden from picker          = parent_brand_id IS NOT NULL
--   umbrella-grain active set   = NOT is_archived AND parent_brand_id IS NULL
--
-- ADDITIVE ONLY — no code reads these columns yet (the brand-registry.ts resolver
-- is introduced unused in this same PR; later phases swap call sites onto it,
-- money paths last and behind a parity harness). store_order is LOAD-BEARING: the
-- marketing-GMV editor parks the umbrella amount on store[0], which today is
-- leefar_nutrition (first in LEEFAR_STORE_SLUGS), so we seed nutrition=0.
--
-- Verified at apply time: DB expansion of 'leefar' = [leefar_nutrition,
-- leefar_supplements, leefar_us] (matches the legacy list order); every umbrella
-- has >=1 child; no child points at a non-umbrella; and brands_v2.id equals the
-- legacy BRAND_UUID_MAP value for all 9 seeded slugs (so the DB resolver returns
-- byte-identical uuids). Applied to prod via Supabase MCP; this is the record.

ALTER TABLE public.brands_v2 ADD COLUMN IF NOT EXISTS parent_brand_id uuid REFERENCES public.brands_v2(id);
ALTER TABLE public.brands_v2 ADD COLUMN IF NOT EXISTS store_order smallint;

-- Backfill the LeeFar umbrella's three stores (resolve the umbrella id by slug).
UPDATE public.brands_v2 SET parent_brand_id = (SELECT id FROM public.brands_v2 WHERE slug='leefar'), store_order = 0 WHERE slug='leefar_nutrition';
UPDATE public.brands_v2 SET parent_brand_id = (SELECT id FROM public.brands_v2 WHERE slug='leefar'), store_order = 1 WHERE slug='leefar_supplements';
UPDATE public.brands_v2 SET parent_brand_id = (SELECT id FROM public.brands_v2 WHERE slug='leefar'), store_order = 2 WHERE slug='leefar_us';
