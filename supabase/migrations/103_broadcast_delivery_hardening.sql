-- Adversarial-review hardening for the broadcast pipeline (all confirmed
-- against the shipped code):
-- 1) 'enqueuing': the create route inserted the shell as 'queued' BEFORE the
--    recipient chunks - a mid-window cron tick could find zero pending rows
--    and finalize the whole broadcast 'done' while its recipients were still
--    inserting (stranded forever). Shells are now born non-claimable and flip
--    to 'queued' only after the last chunk commits.
-- 2) idempotency_key: a timed-out create + operator retry created a SECOND
--    identical broadcast (everyone DMed twice). The client mints a uuid per
--    review step; the unique index turns a retry into "return the existing
--    broadcast".
ALTER TABLE broadcasts DROP CONSTRAINT IF EXISTS broadcasts_status_check;
ALTER TABLE broadcasts ADD CONSTRAINT broadcasts_status_check
  CHECK (status IN ('enqueuing','queued','sending','done','failed','canceled'));
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcasts_idempotency
  ON broadcasts (idempotency_key) WHERE idempotency_key IS NOT NULL;
