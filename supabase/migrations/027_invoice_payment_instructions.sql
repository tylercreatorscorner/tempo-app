-- 027_invoice_payment_instructions.sql
--
-- Adds editable "Payment Instructions" copy to invoices.
--
-- Two-tier:
--   - brand_settings.payment_instructions  → per-brand default (e.g. "Wire to X")
--   - invoices.payment_instructions        → snapshot at generation, editable
--                                            per-invoice. Renders on the PDF.
--
-- A code-side global fallback in src/lib/invoices/pdf.tsx kicks in when the
-- brand has nothing set (avoids forcing the user to fill in every brand
-- before the first invoice can be sent).

ALTER TABLE brand_settings
  ADD COLUMN IF NOT EXISTS payment_instructions TEXT;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_instructions TEXT;

COMMENT ON COLUMN brand_settings.payment_instructions IS
  'Default payment instructions text (multi-line) used when generating invoices for this brand. Snapshotted onto invoices.payment_instructions at creation time.';

COMMENT ON COLUMN invoices.payment_instructions IS
  'Payment instructions shown on the invoice PDF. Snapshotted from brand_settings at creation, editable per-invoice in the detail drawer.';
