-- Compass offline-export task ledger.
--
-- NOT APPLIED. Written as a file only — no TikTok shop has authorized yet, so
-- nothing that reads or writes this table has ever run.
--
-- WHY A TABLE AND NOT A LOCAL VARIABLE. Creating a Compass export returns a
-- task id, and that id is the ONLY handle to the file. The task-list endpoint
-- is ~7 days deep, unpaginated, and reportedly carries no timestamps, so a lost
-- id cannot be recovered by scanning: with ~14 brands × ~3 reports a day there
-- is no way to tell which of ~42 tasks was ours, and picking "the newest" would
-- eventually download another brand-day's file and write it under this brand.
--
-- The row is inserted the moment create returns, BEFORE the first poll — same
-- reasoning as ingestion_runs' 'running' row (migration 116). A function killed
-- mid-poll then leaves the id behind instead of stranding a built file that
-- nothing will ever fetch.
--
-- This is an OPERATIONS ledger, not the freshness ledger. "Did brand X receive
-- rows?" is answered by ingestion_runs; this answers "which TikTok task was
-- that, and what did it claim to be?".

BEGIN;

CREATE TABLE IF NOT EXISTS public.tiktok_compass_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Deliberately NOT a foreign key, for the same reason migration 116 avoids
  -- one: this is evidence. A task created against a misspelled or retired slug
  -- is exactly the failure worth recording, and an FK would reject the write at
  -- the moment it matters most.
  brand_slug  text NOT NULL,

  -- What we ASKED for. Kept separate from echoed_type below on purpose.
  module_type text NOT NULL,
  window_type text NOT NULL,
  -- The `end_day` the task was anchored on, as a real date. Computed in the
  -- shop's MARKET timezone (America/Los_Angeles), never UTC — a naive UTC
  -- "yesterday" names the wrong day for up to 8 hours every night.
  end_day     date NOT NULL,

  -- TikTok's task id. Nullable only so a create that failed before returning an
  -- id can still leave a row if a future caller wants that.
  task_id text,

  -- Our lifecycle, not TikTok's: created → downloaded → verified_dry_run |
  -- ingested | partial | failed.
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'downloaded', 'verified_dry_run', 'ingested', 'partial', 'failed')),

  -- TikTok's own status string, stored verbatim and unconstrained. The status
  -- vocabulary is UNVERIFIED (see SUCCEEDED_STATUSES in src/lib/tiktok/compass.ts);
  -- a CHECK here would reject the very evidence needed to pin it down.
  raw_status text,

  -- What the API said the task/file WAS, versus module_type above. The create
  -- parameter is module_type and the list returns doc_type, and TikTok's own
  -- example passes a doc_type outside the published enum — an unsupported value
  -- may be silently coerced into a task that succeeds carrying the wrong
  -- report. This column is the record of that; the column-header sniff is what
  -- actually blocks the write.
  echoed_type text,

  -- What arrived. file_format is the magic-byte verdict ('zip', 'json',
  -- 'unknown', …) — the artifact format has never been confirmed against a real
  -- shop, so the first live values here are the point of the whole exercise.
  file_name   text,
  file_format text,
  file_bytes  bigint,

  poll_count   int,
  rows_written int,
  error        text,

  -- The ingestion_runs row this task fed, when there was one. NULL for a dry
  -- run, which writes no fact rows and so must not appear in the freshness
  -- ledger at all. No FK, same evidence-log reasoning as brand_slug.
  ingestion_run_id uuid,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per TikTok task. Partial so the several rows that may exist with a
-- NULL task_id (create failed before an id came back) do not collide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_compass_tasks_task_id
  ON public.tiktok_compass_tasks (task_id)
  WHERE task_id IS NOT NULL;

-- "What did we ask for, for this brand-day?" — the re-run / recovery lookup.
CREATE INDEX IF NOT EXISTS idx_compass_tasks_brand_day
  ON public.tiktok_compass_tasks (brand_slug, end_day DESC, module_type);

-- "What is stuck?" — a row still at 'created'/'downloaded' hours later is a
-- task whose file was built and never collected.
CREATE INDEX IF NOT EXISTS idx_compass_tasks_status
  ON public.tiktok_compass_tasks (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.tiktok_compass_tasks_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tiktok_compass_tasks_touch ON public.tiktok_compass_tasks;
CREATE TRIGGER trg_tiktok_compass_tasks_touch
  BEFORE UPDATE ON public.tiktok_compass_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tiktok_compass_tasks_touch();

-- RLS on with no policy + an EXPLICIT revoke. House rule from migrations
-- 095/100/106/114/116/121: under Supabase default privileges a GRANT list that
-- merely OMITS anon revokes NOTHING. Service-role only — the ingest job writes
-- it, admin server code reads it.
ALTER TABLE public.tiktok_compass_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tiktok_compass_tasks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tiktok_compass_tasks TO service_role;

REVOKE ALL ON FUNCTION public.tiktok_compass_tasks_touch() FROM PUBLIC, anon, authenticated;

COMMIT;
