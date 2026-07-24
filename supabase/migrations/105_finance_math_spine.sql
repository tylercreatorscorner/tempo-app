-- 105_finance_math_spine.sql
--
-- Phase 1 of the Finance overhaul (math spine).
--
-- 1) Invoice-number uniqueness — the concurrency guard the generate route's
--    new INSERT-retry loop (POST /api/invoices) leans on. Verified against
--    prod 2026-07-24: invoices ALREADY carries a unique index on
--    invoice_number (`invoices_invoice_number_key`, from the original table
--    DDL) and there are zero duplicate numbers. A plain
--    `CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_number` would still
--    create a SECOND, redundant index (IF NOT EXISTS matches on NAME, not
--    definition), so the guard below creates one only when NO single-column
--    unique index on invoice_number exists — a no-op in prod, the real guard
--    in any environment built without it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
    WHERE n.nspname = 'public'
      AND t.relname = 'invoices'
      AND i.indisunique
      AND i.indnatts = 1
      AND a.attname = 'invoice_number'
  ) THEN
    CREATE UNIQUE INDEX idx_invoices_number ON public.invoices (invoice_number);
  END IF;
END $$;

-- 2) Earnings-freeze ledger. On invoice generation the full earnings BrandRow
--    that produced the invoice is frozen here (and re-frozen on refresh), so
--    Phase 2 can render invoiced months from the FROZEN snapshot instead of
--    recomputing live — late data uploads stop silently rewriting history.
--    One row per (brand, month, payee); regenerating/refreshing upserts.
CREATE TABLE IF NOT EXISTS public.earnings_ledger (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_slug     text NOT NULL,
  period_month   text NOT NULL CHECK (period_month ~ '^[0-9]{4}-[0-9]{2}$'),
  team_member_id uuid NOT NULL REFERENCES public.team_members (id),
  snapshot       jsonb NOT NULL,
  -- SET NULL, not CASCADE: deleting a pending invoice must not destroy the
  -- frozen earnings record — the freeze outlives the invoice that caused it.
  invoice_id     uuid REFERENCES public.invoices (id) ON DELETE SET NULL,
  frozen_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT earnings_ledger_brand_period_member_key
    UNIQUE (brand_slug, period_month, team_member_id)
);

COMMENT ON TABLE public.earnings_ledger IS
  'Frozen earnings snapshots, one per (brand, month, payee). Written on invoice generation and refresh (POST /api/invoices, /api/invoices/[id]/refresh). Service-role only: RLS enabled with NO policies, plus explicit REVOKEs.';
COMMENT ON COLUMN public.earnings_ledger.snapshot IS
  'The full earnings BrandRow (src/lib/data/earnings.ts) that produced the linked invoice: GMV, rates, commission, retainer, fees, total, creator breakdown.';
COMMENT ON COLUMN public.earnings_ledger.period_month IS 'YYYY-MM.';

CREATE INDEX IF NOT EXISTS earnings_ledger_invoice_id_idx
  ON public.earnings_ledger (invoice_id);

-- Service-role only. RLS with zero policies already denies anon/authenticated,
-- but Supabase DEFAULT PRIVILEGES grant them table access at creation — and a
-- GRANT list that omits a role revokes nothing (house rule from the reporting
-- RPCs). Revoke explicitly so a future "disable RLS" fat-finger exposes nothing.
ALTER TABLE public.earnings_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.earnings_ledger FROM anon, authenticated;
