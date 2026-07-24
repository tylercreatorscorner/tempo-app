-- Loud backstop for the settle race (adversarial-review fix #2).
--
-- Settling writes one creator_prizes row per (contest, place), but mig 108
-- shipped the table with NO unique constraint — two concurrent settles could
-- interleave their five autocommit statements into TWO full sets of 'owed'
-- prize rows (double-paying every winner once Automated Payouts consumes the
-- ledger). The settle route now claims the settled flip via compare-and-set
-- before any prize write; this index makes any residual double-write fail
-- LOUD instead of silently double-owing.
--
-- Partial: contest_id is nullable (ON DELETE SET NULL preserves paid history
-- when a contest is deleted, and future non-contest prizes may not carry
-- one) — only contest-attached rows are constrained.
create unique index if not exists idx_creator_prizes_contest_place
  on public.creator_prizes (contest_id, place)
  where contest_id is not null;
