-- Ingestion observability spine — built FIRST, not last.
--
-- The xlsx upload path writes activity_log, so when six brands stopped
-- uploading on 7/9 there was at least a trail to find. The API path had NO
-- write-side record at all, which is how a pipeline can go dark for ten days
-- while every dashboard keeps rendering confident, stale numbers. This table is
-- the single write-side ledger for BOTH paths ('api' and 'upload'), so the
-- freshness question — "when did brand X last actually receive rows?" — has one
-- answer instead of two half-answers.
--
-- THE POINT OF THE 'running' ROW: the row is written BEFORE the work begins.
-- A serverless function that is killed mid-flight (timeout, OOM, deploy) writes
-- no completion record and no error — it simply never returns. Rows created up
-- front leave a 'running' row that never advanced, which is visible evidence of
-- a death. A table written only on success can never distinguish "nothing to
-- ingest" from "the job died", and that ambiguity is exactly what hid the
-- ten-day outage.
--
-- rows_expected alongside rows_written is the partial-write detector: equal
-- means clean, short means the run truncated (the PostgREST 1000-row cap, a
-- chunk that 413'd, a paged read that stopped early).

BEGIN;

CREATE TABLE IF NOT EXISTS public.ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  source text NOT NULL CHECK (source IN ('api', 'upload')),

  -- Deliberately NOT a foreign key. This is an evidence log: a run for a brand
  -- slug that is misspelled, retired, or not yet in brands_v2 is precisely the
  -- kind of failure worth recording. An FK here would reject the write and
  -- destroy the evidence at the moment it matters most.
  brand_slug   text NOT NULL,
  target_table text NOT NULL,
  report_date  date,

  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'complete', 'failed', 'partial')),

  rows_written  int,
  rows_expected int,
  error         text,

  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

-- "What is the freshest run for this brand?" — the staleness banner query.
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_brand_date
  ON public.ingestion_runs (brand_slug, report_date DESC);

-- "What is broken or stuck right now?" — the ops sweep. A 'running' row whose
-- started_at is hours old is a dead function, and this index finds it.
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_status
  ON public.ingestion_runs (status, started_at DESC);

-- RLS enabled with no policy + explicit REVOKE (house rule from migrations
-- 095/100/106/114: omitting anon from a GRANT list revokes NOTHING under
-- Supabase default privileges). Service-role only — the ingest jobs write it,
-- admin server code reads it.
ALTER TABLE public.ingestion_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ingestion_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ingestion_runs TO service_role;

COMMIT;
