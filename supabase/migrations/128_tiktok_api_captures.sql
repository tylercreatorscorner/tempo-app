-- 128_tiktok_api_captures.sql
--
-- Raw TikTok API responses, stored verbatim for type generation and for the
-- one experiment that decides whether the API can replace the spreadsheet.
--
-- WHY A TABLE AND NOT A RETURN VALUE: src/lib/tiktok/types.ts records that the
-- DELETED previous module hand-wrote its response types and got FOUR of them
-- wrong (`data.shop_videos`, a `pagination` wrapper, `gmv: number`,
-- `video_post_time: number`) — and every file still compiled, so a dead
-- pipeline reported green forever. Types must be generated from responses we
-- actually received. That means the bytes have to land somewhere durable and
-- inspectable, not scroll past in a log or come back in an HTTP response an
-- operator would have to paste somewhere.
--
-- ⚠️ THIS TABLE HOLDS THIRD-PARTY PAYLOADS VERBATIM. It is a capture buffer for
-- a spike, NOT a fact table. Nothing reads it to compute money. The daily
-- rollup writes still go through the upload_*_atomic RPCs like every other
-- ingest path, so the API and manual paths cannot drift.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tiktok_api_captures (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid        NOT NULL,
  brand_slug    text        NOT NULL,
  -- The endpoint family, WITHOUT the version segment, plus the version beside
  -- it. Stored apart so a version bump is a filter and not a string edit —
  -- Compass just cost us six wrong guesses at exactly this segment.
  endpoint      text        NOT NULL,
  api_version   text        NOT NULL,
  -- Exactly what we sent, so a capture is reproducible a month from now.
  -- ⚠️ shop_cipher is injected by TikTokClient AFTER the caller's query and is
  -- deliberately NOT recorded here: it is a per-shop credential and this table
  -- is read by admin tooling, not by the signing path.
  request_params jsonb      NOT NULL DEFAULT '{}'::jsonb,
  -- 0-based. A capture is one row PER PAGE, never a concatenation: if the
  -- page loop is wrong, per-page rows make it visible instead of hiding it in
  -- a merged array.
  page_index    integer     NOT NULL,
  page_token    text,
  -- The envelope's `data`, verbatim and uninterpreted.
  response      jsonb       NOT NULL,
  -- What we THINK the row count is, recorded next to the payload so a wrong
  -- container-key guess shows up as a count that disagrees with the JSON.
  row_count     integer,
  request_id    text,
  captured_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tiktok_api_captures_page_nonneg CHECK (page_index >= 0)
);

-- One row per (run, endpoint, page). Re-running a capture with the same run_id
-- must not silently double the pages.
CREATE UNIQUE INDEX IF NOT EXISTS tiktok_api_captures_run_page_idx
  ON public.tiktok_api_captures (run_id, endpoint, api_version, page_index);

CREATE INDEX IF NOT EXISTS tiktok_api_captures_brand_time_idx
  ON public.tiktok_api_captures (brand_slug, captured_at DESC);

-- House lockdown, three statements in this order (migrations 095/100/106/113/
-- 114/116/117/118/121/122/123/125/126).
--
-- ⚠️ The REVOKE is NOT redundant with the GRANT. Supabase's default privileges
-- hand anon AND authenticated the full arwdDxtm set — INSERT/SELECT/UPDATE/
-- DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN — on every new table in public.
-- A GRANT list that merely omits anon therefore revokes NOTHING; this was found
-- empirically, not theorised. And RLS alone is not enough here: with the grants
-- left in place, one future permissive policy would open the whole table.
ALTER TABLE public.tiktok_api_captures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tiktok_api_captures FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tiktok_api_captures TO service_role;

COMMIT;
