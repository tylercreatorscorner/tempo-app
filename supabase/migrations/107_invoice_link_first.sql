-- Invoice revamp Phase A (approved mockup): the link becomes the invoice.
-- viewed_at = first real client open (client-side beacon, same bot-proof
-- pattern as client_reports - unfurl bots must never stamp it);
-- last_nudged_at/nudge_count = the one-click overdue reminder log;
-- share_note = the optional personal line rendered on the public page.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS viewed_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_nudged_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS nudge_count int NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS share_note text;
