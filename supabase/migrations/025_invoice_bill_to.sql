-- 025_invoice_bill_to.sql
--
-- Invoicing support: per-brand bill-to info on brand_settings + snapshot
-- of bill-to + product_retainer on invoice rows so historical PDFs are
-- frozen at generation time.

-- ── Brand-level bill-to info (used as defaults when generating invoices)
ALTER TABLE brand_settings
  ADD COLUMN IF NOT EXISTS bill_to_name    TEXT,
  ADD COLUMN IF NOT EXISTS bill_to_email   TEXT,
  ADD COLUMN IF NOT EXISTS bill_to_address TEXT;

COMMENT ON COLUMN brand_settings.bill_to_name    IS 'Default invoice recipient name for this brand.';
COMMENT ON COLUMN brand_settings.bill_to_email   IS 'Default invoice recipient email for this brand.';
COMMENT ON COLUMN brand_settings.bill_to_address IS 'Default invoice recipient address for this brand. Multi-line text.';

-- ── Invoice schema additions
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS product_retainer NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bill_to_name    TEXT,
  ADD COLUMN IF NOT EXISTS bill_to_email   TEXT,
  ADD COLUMN IF NOT EXISTS bill_to_address TEXT;

COMMENT ON COLUMN invoices.product_retainer IS 'Product retainer line item (snapshot from brand_settings at generation).';
COMMENT ON COLUMN invoices.bill_to_name     IS 'Recipient name snapshot at generation time. Editable per-invoice.';
COMMENT ON COLUMN invoices.bill_to_email    IS 'Recipient email snapshot at generation time. Editable per-invoice.';
COMMENT ON COLUMN invoices.bill_to_address  IS 'Recipient address snapshot at generation time. Editable per-invoice.';

-- Helpful index for the common query: "invoices for a given brand+month" (used to detect duplicates on generate)
CREATE UNIQUE INDEX IF NOT EXISTS invoices_brand_period_unique ON invoices (brand, period_month);

-- And a lookup index for status filtering
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices (status);
