-- 026_invoice_creator_breakdown.sql
--
-- Snapshots the per-creator GMV + commission breakdown onto the invoice at
-- generation time. The breakdown shows up on the PDF as a line-by-line table
-- of which creators contributed to that month's commission.
--
-- Stored as JSONB for flexibility — array of objects with shape:
--   [{ "name": "@nicole", "gmv": 12345.67, "rate": 5.0, "commission": 617.28 }, ...]
--
-- We snapshot rather than re-query at PDF time because:
--   1. Source data can change (refunds, late uploads) after the invoice is sent
--   2. Per-creator rate overrides can be edited going forward
--   3. Historical PDFs should always reflect what the invoice was sent with

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS creator_breakdown JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN invoices.creator_breakdown IS
  'Snapshot of per-creator GMV + commission at generation time. Array of
   { name, gmv, rate, commission }. Frozen on creation — does not update
   if upstream creator_performance is later corrected.';
