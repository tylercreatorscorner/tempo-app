-- 129_compass_tasks_schema_drift.sql
--
-- Reconcile tiktok_compass_tasks with the schema its own code writes.
--
-- ⚠️ THE LIVE TABLE AND MIGRATION 122's FILE HAD DIVERGED. 122 declares
-- file_format / file_bytes / poll_count / ingestion_run_id; the table that
-- actually exists in production has detected_format / magic_bytes /
-- byte_length and NONE of those four. Whatever was applied through the MCP
-- migration tool was not what landed in the committed file.
--
-- The consequence was total and silent. compass-ingest.ts names
-- ingestion_run_id in its create-time insert and file_format / file_bytes /
-- poll_count in its completion update, so PostgREST rejected BOTH writes with
-- "column not found in schema cache" — and recordTask catches that, logs to a
-- console nobody reads, and returns null, because it is deliberately
-- best-effort ("failing an otherwise healthy run because a recovery aid could
-- not be written would be the wrong trade").
--
-- So the ledger built to guarantee that "a killed function leaves evidence"
-- has never recorded a single row. The first live Compass run created a real
-- TikTok task (01KYMMXK7Q) whose id is now unrecoverable, and the only reason
-- anyone noticed is that the table was queried by hand.
--
-- Additive only. The three columns the live table has and the file does not
-- (detected_format, magic_bytes, byte_length) are LEFT IN PLACE: dropping
-- columns is destructive, they cost nothing, and a future reader deserves to
-- see the drift rather than have it quietly erased.

BEGIN;

ALTER TABLE public.tiktok_compass_tasks
  -- The ingestion_runs row this task fed, when there was one. NULL for a dry
  -- run, which writes no fact rows and so must not appear in the freshness
  -- ledger at all. No FK, matching 122's evidence-log reasoning for brand_slug:
  -- an evidence table must still be writable when the thing it references is
  -- the thing that broke.
  ADD COLUMN IF NOT EXISTS ingestion_run_id uuid,
  -- How many polls it took. The signal for whether the 40s budget is anywhere
  -- near right, which is currently a guess.
  ADD COLUMN IF NOT EXISTS poll_count       int,
  -- The magic-byte verdict ('zip', 'json', 'unknown'). The artifact format has
  -- never been confirmed against a real shop; these are the first live values.
  ADD COLUMN IF NOT EXISTS file_format      text,
  ADD COLUMN IF NOT EXISTS file_bytes       bigint;

-- Re-assert the house lockdown. 122 set it, but this table's history is
-- exactly why that should be verified rather than assumed — and a REVOKE is
-- not redundant with a GRANT: Supabase's default privileges hand anon and
-- authenticated the full arwdDxtm set on every new table in public, so a GRANT
-- list that merely omits anon revokes nothing.
ALTER TABLE public.tiktok_compass_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tiktok_compass_tasks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tiktok_compass_tasks TO service_role;

COMMIT;
