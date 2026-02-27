CREATE TABLE IF NOT EXISTS payment_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- 'retainer', 'commission_rate', 'payment_status', 'invoice_status'
  entity_id TEXT, -- reference to the changed record
  creator_name TEXT,
  brand TEXT,
  field_changed TEXT NOT NULL, -- 'retainer', 'rate', 'status', etc.
  old_value TEXT,
  new_value TEXT,
  changed_by TEXT DEFAULT 'system',
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'
);

CREATE INDEX idx_payment_audit_brand ON payment_audit_log(brand);
CREATE INDEX idx_payment_audit_creator ON payment_audit_log(creator_name);
CREATE INDEX idx_payment_audit_created ON payment_audit_log(created_at DESC);
