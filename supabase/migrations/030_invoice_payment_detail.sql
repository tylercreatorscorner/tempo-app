-- 030_invoice_payment_detail.sql
--
-- Capture detail when an invoice is marked paid: method, reference, the
-- exact amount received (which may differ from total_amount due to wire
-- fees, partial payments, currency conversion), and notes.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_method          TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference       TEXT,
  ADD COLUMN IF NOT EXISTS amount_received         NUMERIC,
  ADD COLUMN IF NOT EXISTS payment_received_notes  TEXT;

COMMENT ON COLUMN invoices.payment_method         IS 'How payment was received: wire, ach, check, zelle, paypal, stripe, other';
COMMENT ON COLUMN invoices.payment_reference      IS 'Reference / transaction / check number for reconciliation';
COMMENT ON COLUMN invoices.amount_received        IS 'Actual amount received (may differ from total_amount: fees, partial, conversion).';
COMMENT ON COLUMN invoices.payment_received_notes IS 'Free-form notes about the payment (e.g. wire fee deducted, partial, FX rate).';
