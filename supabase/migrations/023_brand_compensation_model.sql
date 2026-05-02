-- 023_brand_compensation_model.sql
--
-- Generalizes earnings computation by replacing three hardcoded specials in
-- src/lib/data/earnings.ts:
--   1. UMBRELLA_BRAND_SLUGS = new Set(['leefar'])
--   2. if (brand === 'toplux') { MAX(retainer, 5% × GMV) }
--   3. const marketingCommission = marketingGmv * 0.02
--
-- After this:
--   - brand_settings.compensation_model selects how retainer + commission combine
--   - brand_settings.marketing_commission_rate replaces the 2% magic number
--   - brands_v2.is_umbrella replaces the leefar exclusion list
--
-- Also fixes a quiet bug: per-creator rate overrides (creator_commission_rates)
-- are now correctly applied on revshare_max brands. The old `gmv * 0.05` formula
-- ignored them.

-- ── 1. compensation_model enum ──────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE compensation_model_enum AS ENUM (
    'standard',
    'revshare_max',
    'commission_only',
    'retainer_only'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. brand_settings columns ───────────────────────────────────────
ALTER TABLE brand_settings
  ADD COLUMN IF NOT EXISTS compensation_model compensation_model_enum NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS marketing_commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.02;

COMMENT ON COLUMN brand_settings.compensation_model IS
  'How monthly earnings combine retainer + commission for this brand:
   - standard: retainer + commission (both apply, additive). Default.
   - revshare_max: MAX(retainer, commission). Whichever is higher wins; the other goes to 0.
   - commission_only: commission only, no retainer.
   - retainer_only: flat retainer, no commission.
   Per-creator rate overrides (creator_commission_rates) are factored into
   the commission calculation regardless of model.';

COMMENT ON COLUMN brand_settings.marketing_commission_rate IS
  'Commission rate on manually-entered marketing GMV (decimal, not percent).
   Default 0.02 = 2%. Replaces the previously-hardcoded 2% in earnings.ts.';

-- ── 3. brands_v2.is_umbrella flag ───────────────────────────────────
ALTER TABLE brands_v2
  ADD COLUMN IF NOT EXISTS is_umbrella BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN brands_v2.is_umbrella IS
  'Umbrella brand grouping multiple child brands (e.g. "leefar" groups
   leefar_nutrition + leefar_supplements). Umbrella rows have no
   creator_performance data of their own and are excluded from earnings.';

-- ── 4. Backfill existing data ───────────────────────────────────────
-- leefar is the umbrella that groups leefar_nutrition + leefar_supplements
UPDATE brands_v2
   SET is_umbrella = true
 WHERE slug = 'leefar';

-- Toplux uses MAX(retainer, X% × GMV). The X% is its existing commission_rate.
UPDATE brand_settings
   SET compensation_model = 'revshare_max'
 WHERE brand = 'toplux';
