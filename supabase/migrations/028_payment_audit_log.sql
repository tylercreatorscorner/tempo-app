-- 028_payment_audit_log.sql
--
-- Audit log of changes to financial state (retainers, commission rates,
-- payment statuses, invoice statuses). Surfaced on the Payments page as
-- the "Recent Activity" feed.
--
-- Currently no endpoint writes to this table — it's set up so that future
-- admin actions (e.g. retainer edits, commission rate bumps, invoice
-- status flips) can log their changes via INSERTs without another
-- migration. The Payments UI reads from it; missing entries just mean
-- the audit log is empty.

CREATE TABLE IF NOT EXISTS payment_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   TEXT NOT NULL,        -- e.g. 'retainer', 'commission_rate', 'payment_status', 'invoice_status'
  entity_id     TEXT NOT NULL,        -- the id (or composite key) of the record changed
  creator_name  TEXT,                 -- creator handle if applicable
  brand         TEXT,                 -- brand slug if applicable
  field_changed TEXT NOT NULL,        -- name of the field changed
  old_value     TEXT,                 -- previous value, stringified
  new_value     TEXT,                 -- new value, stringified
  changed_by    TEXT NOT NULL,        -- email or user_id of the actor
  reason        TEXT,                 -- optional human-written reason
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE payment_audit_log IS
  'Append-only audit trail of changes to financial state. Read by the Payments page.';

CREATE INDEX IF NOT EXISTS payment_audit_log_created_at_idx ON payment_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS payment_audit_log_brand_idx      ON payment_audit_log (brand);
CREATE INDEX IF NOT EXISTS payment_audit_log_entity_idx     ON payment_audit_log (entity_type, entity_id);
