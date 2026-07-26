-- 123_upload_coverage_ledger.sql
--
-- The data spine for the coverage ledger: "which brand-days do we actually
-- have, and which are lying to us?"
--
-- WHY THIS EXISTS
-- ---------------
-- Two failures the product could not see:
--
--   1. Six brands stopped uploading on 2026-07-09 and every dashboard kept
--      rendering confident, stale numbers for ten days. A zero-row brand-day is
--      indistinguishable from a quiet brand-day unless something asserts the day
--      was EXPECTED.
--   2. A per-chunk guard stranded partial days at exact 5,000-row multiples
--      (cosrx 7/15-7/21, lemme 7/14 + 7/21, jiyu 7/17). Those days have rows, so
--      every existing freshness signal — get_upload_coverage, the /upload matrix,
--      StaleBrandsBanner — reports them GREEN. A day with 5,000 of 40,606 rows is
--      worse than a missing day, because nothing tells you to go look.
--
-- This migration supplies the counts, the per-(brand,table) baseline those
-- counts get judged against, and nothing else. The status DECISION (complete /
-- partial / missing / not_expected) deliberately lives in TypeScript
-- (src/lib/data/upload-coverage.ts) so the policy is readable and unit-testable
-- in one place instead of buried in plpgsql string concatenation.
--
-- WHY A ROLLUP AND NOT A LIVE AGGREGATE
-- -------------------------------------
-- Measured on prod (2026-07-26, XL instance) for a 30-day GROUP BY (brand,
-- report_date):
--     creator_performance (2.68M rows)   396 ms
--     video_performance   (2.16M rows)   581 ms
--     product_performance (61.7K rows)    11 ms
-- The ledger needs 37 days (30 shown + a 7-day trailing baseline), which pushes
-- that past ~1.2 s warm and multiple seconds cold — for a page an operator opens
-- every single morning. So counts are materialized into upload_coverage_daily
-- and refreshed by pg_cron, the same pattern migration 059 used to take the
-- roster from 35 s to 0.25 s.
--
-- WHY THE ROLLUP ALONE IS NOT ENOUGH (the live overlay)
-- -----------------------------------------------------
-- A rollup that lags its cron tick would report a JUST-UPLOADED day as missing,
-- and the operator would re-upload a day that was already fine. That is exactly
-- the crying-wolf failure this surface exists to prevent, so
-- get_upload_coverage_matrix reads the freshest p_live_days directly from the
-- fact tables and only falls back to the rollup for older days. A 3-day direct
-- scan of video_performance — the worst of the three — measures 117 ms, which is
-- an affordable price for never lying about today.
--
-- SECURITY
-- --------
-- House rule (migrations 095/100/106/113/114/121): under Supabase default
-- privileges a GRANT list that merely OMITS anon revokes NOTHING. Every function
-- below gets an explicit REVOKE ALL ... FROM PUBLIC, anon, authenticated before
-- its GRANT. These RPCs are SECURITY DEFINER over every brand's fact tables;
-- an anon-executable one would be a cross-tenant read of the whole warehouse.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The rollup
-- ─────────────────────────────────────────────────────────────────────────────

-- One row per (brand, fact table, report_date) with the row count present.
-- Keyed by brand SLUG rather than uuid, matching the fact tables themselves, so
-- a brand slug that is misspelled or absent from brands_v2 still shows up — that
-- mismatch is a coverage failure worth seeing, not one worth silently dropping.
CREATE TABLE IF NOT EXISTS public.upload_coverage_daily (
  brand_slug   text NOT NULL,
  target_table text NOT NULL,
  report_date  date NOT NULL,
  row_count    integer NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_slug, target_table, report_date)
);

-- The matrix reads a date range across all brands for one table at a time.
CREATE INDEX IF NOT EXISTS idx_ucd_table_date
  ON public.upload_coverage_daily (target_table, report_date DESC);

ALTER TABLE public.upload_coverage_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.upload_coverage_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.upload_coverage_daily TO service_role;

COMMENT ON TABLE public.upload_coverage_daily IS
  'Precomputed row counts per (brand, fact table, report_date) for the /upload '
  'coverage ledger. Refreshed by pg_cron; the freshest days are read live from '
  'the fact tables by get_upload_coverage_matrix, so cron lag can never report '
  'a just-uploaded day as missing.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Median helper
-- ─────────────────────────────────────────────────────────────────────────────

-- Median of the positive entries of an int[], or NULL when fewer than
-- p_min_samples of them exist.
--
-- Why median and not mean: the thing we are measuring against is contaminated by
-- the very failures we are hunting. cosrx's trailing week contained 5,000,
-- 15,000 and 20,000-row stubs; their mean drags the baseline down toward the
-- broken values and hides the next stub. A median shrugs them off.
--
-- Why zeros are excluded: a missing day is a gap, not a "day with zero rows".
-- Counting the ten-day outage as ten zeros would drive lemme's baseline to 0 and
-- make every subsequent day look magnificent.
--
-- Why a minimum sample count: two neighbours is not a baseline, it is a
-- coincidence. Below the floor we return NULL and the caller reports
-- expectedRows: null rather than inventing an expectation.
CREATE OR REPLACE FUNCTION public.upload_coverage_median(
  p_counts      integer[],
  p_min_samples integer DEFAULT 3
) RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
           WHEN count(*) >= p_min_samples
           THEN (percentile_disc(0.5) WITHIN GROUP (ORDER BY v))::integer
         END
  FROM unnest(coalesce(p_counts, '{}'::integer[])) AS v
  WHERE v > 0;
$$;

REVOKE ALL ON FUNCTION public.upload_coverage_median(integer[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upload_coverage_median(integer[], integer) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Refresh
-- ─────────────────────────────────────────────────────────────────────────────

-- Recompute the rollup for the trailing p_days. Range-bounded so both the
-- frequent incremental tick and the nightly wider pass stay cheap.
--
-- The DELETE is not optional and not a micro-optimisation: if a brand-day's rows
-- are removed (a corrected re-upload with p_overwrite, a bad file rolled back), a
-- pure upsert would leave the old count frozen in the rollup forever and the
-- ledger would render a deleted day as complete. Delete-then-insert makes the
-- rollup a projection of the fact tables rather than an append-only memory of
-- them.
CREATE OR REPLACE FUNCTION public.refresh_upload_coverage(p_days integer DEFAULT 45)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from  date := current_date - coalesce(p_days, 400);
  v_to    date := current_date + 1;   -- exclusive; today is still accumulating
  v_count integer;
BEGIN
  DELETE FROM public.upload_coverage_daily
  WHERE report_date >= v_from AND report_date < v_to;

  INSERT INTO public.upload_coverage_daily (brand_slug, target_table, report_date, row_count)
  SELECT brand, 'creator_performance', report_date, count(*)::int
  FROM public.creator_performance
  WHERE report_date >= v_from AND report_date < v_to AND brand IS NOT NULL
  GROUP BY brand, report_date
  UNION ALL
  SELECT brand, 'video_performance', report_date, count(*)::int
  FROM public.video_performance
  WHERE report_date >= v_from AND report_date < v_to AND brand IS NOT NULL
  GROUP BY brand, report_date
  UNION ALL
  SELECT brand, 'product_performance', report_date, count(*)::int
  FROM public.product_performance
  WHERE report_date >= v_from AND report_date < v_to AND brand IS NOT NULL
  GROUP BY brand, report_date;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_upload_coverage(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_upload_coverage(integer) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The matrix RPC
-- ─────────────────────────────────────────────────────────────────────────────

-- Returns the facts for every (brand, table, day) in the window plus the two
-- baselines the partial detectors compare against. It does NOT return a status:
-- see the file header.
--
-- The two baselines are separate on purpose, because a single one gets the
-- 2026-07-12 TikTok export change wrong in one direction or the other:
--
--   trailing_median — the median of the 7 days BEFORE this one. This is the
--     honest comparator for "did today collapse?", and it is the one that keeps
--     catakor's 2026-07-11 (387 rows, the last day of the old export layout, the
--     day before counts jumped 10x to 4,397) from being flagged. A centred
--     window would have called that day 17% of normal and been flat wrong.
--
--   leading_median — the median of the 7 days AFTER. Needed for the mirror case:
--     lemme 2026-07-14 is a 5,000-row stub sitting immediately after the same
--     export change, so its trailing days are all ~277 rows and only the days
--     that follow reveal the real level (~8,600).
--
-- Callers combine them; see classifyCell() in src/lib/data/upload-coverage.ts.
--
-- p_live_days: days within this many of p_end are counted straight from the
-- fact tables instead of the rollup (see file header). 0 disables the overlay.
CREATE OR REPLACE FUNCTION public.get_upload_coverage_matrix(
  p_brands     text[],
  p_start      date,
  p_end        date,
  p_live_days  integer DEFAULT 2,
  p_window     integer DEFAULT 7
) RETURNS TABLE (
  brand_slug      text,
  target_table    text,
  report_date     date,
  row_count       integer,
  trailing_median integer,
  leading_median  integer,
  is_live         boolean,
  refreshed_at    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH cfg AS (
    -- The baseline window as an interval, materialised once. A window FRAME
    -- offset may not reference a query variable, so it is read back below as a
    -- scalar subquery — the form verified against this database before shipping.
    SELECT (greatest(coalesce(p_window, 7), 1) || ' days')::interval AS win
  ),
  bounds AS (
    SELECT
      -- Pull p_window extra days on each side so the OLDEST displayed day still
      -- has a trailing baseline and the NEWEST still has a leading one. Without
      -- this the first row of the ledger is permanently unjudgeable.
      (p_start - greatest(coalesce(p_window, 7), 1))::date AS scan_start,
      (p_end   + greatest(coalesce(p_window, 7), 1))::date AS scan_end,
      (p_end - greatest(coalesce(p_live_days, 0), 0))::date AS live_cut
  ),
  rolled AS (
    SELECT u.brand_slug, u.target_table, u.report_date, u.row_count,
           false AS is_live, u.refreshed_at
    FROM public.upload_coverage_daily u, bounds b
    WHERE u.report_date >= b.scan_start
      AND u.report_date <= b.scan_end
      AND u.report_date <= b.live_cut
  ),
  -- The live overlay deliberately does NOT filter on brand. These aggregates ride
  -- an index-only scan on the (brand, report_date, period_type) indexes; adding a
  -- ~30-element `brand = ANY(...)` makes the planner abandon it and seq-scan
  -- 2M+ rows. Aggregating every brand over 2-3 days is cheaper than filtering,
  -- and the brand restriction is applied once at the end.
  live AS (
    SELECT cp.brand AS brand_slug, 'creator_performance'::text AS target_table,
           cp.report_date, count(*)::int AS row_count, true AS is_live,
           now() AS refreshed_at
    FROM public.creator_performance cp, bounds b
    WHERE cp.report_date > b.live_cut AND cp.report_date <= b.scan_end
      AND cp.brand IS NOT NULL
    GROUP BY cp.brand, cp.report_date
    UNION ALL
    SELECT vp.brand, 'video_performance', vp.report_date, count(*)::int, true, now()
    FROM public.video_performance vp, bounds b
    WHERE vp.report_date > b.live_cut AND vp.report_date <= b.scan_end
      AND vp.brand IS NOT NULL
    GROUP BY vp.brand, vp.report_date
    UNION ALL
    SELECT pp.brand, 'product_performance', pp.report_date, count(*)::int, true, now()
    FROM public.product_performance pp, bounds b
    WHERE pp.report_date > b.live_cut AND pp.report_date <= b.scan_end
      AND pp.brand IS NOT NULL
    GROUP BY pp.brand, pp.report_date
  ),
  combined AS (
    SELECT * FROM rolled
    UNION ALL
    SELECT * FROM live
  ),
  windowed AS (
    SELECT c.*,
      -- RANGE (not ROWS) over the date, so a gap in the data is a gap in the
      -- window. With ROWS, a brand that went dark for ten days would silently
      -- compare today against rows from three weeks ago and call it normal.
      array_agg(c.row_count) OVER (
        PARTITION BY c.brand_slug, c.target_table ORDER BY c.report_date
        RANGE BETWEEN (SELECT win FROM cfg) PRECEDING
                  AND INTERVAL '1 day' PRECEDING
      ) AS trail_arr,
      array_agg(c.row_count) OVER (
        PARTITION BY c.brand_slug, c.target_table ORDER BY c.report_date
        RANGE BETWEEN INTERVAL '1 day' FOLLOWING
                  AND (SELECT win FROM cfg) FOLLOWING
      ) AS lead_arr
    FROM combined c
  )
  SELECT w.brand_slug, w.target_table, w.report_date, w.row_count,
         public.upload_coverage_median(w.trail_arr),
         public.upload_coverage_median(w.lead_arr),
         w.is_live, w.refreshed_at
  FROM windowed w
  WHERE w.report_date >= p_start
    AND w.report_date <= p_end
    AND (p_brands IS NULL OR w.brand_slug = ANY(p_brands));
$$;

REVOKE ALL ON FUNCTION public.get_upload_coverage_matrix(text[], date, date, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_upload_coverage_matrix(text[], date, date, integer, integer) TO service_role;

COMMENT ON FUNCTION public.get_upload_coverage_matrix IS
  'Coverage ledger matrix: row counts + trailing/leading medians per (brand, '
  'fact table, report_date). Reads the upload_coverage_daily rollup, overlaying '
  'the freshest p_live_days straight from the fact tables. Returns facts only — '
  'complete/partial/missing/not_expected is decided in classifyCell() '
  '(src/lib/data/upload-coverage.ts).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Per (brand, table) bounds
-- ─────────────────────────────────────────────────────────────────────────────

-- First/last day a brand ever produced rows in each table, plus a long-horizon
-- median for context in the detail drawer.
--
-- first_date is what makes `not_expected` honest for the left edge of the
-- ledger: a brand onboarded eight days ago must not show 22 red MISSING cells
-- for the days before it existed. That is the single fastest way to teach an
-- operator that red means nothing.
--
-- last_date is how a type is judged EXPECTED at all. A brand that has never
-- written product_performance gets no product cells, rather than a month of red
-- for a report it does not produce.
CREATE OR REPLACE FUNCTION public.get_upload_coverage_bounds(
  p_brands text[] DEFAULT NULL
) RETURNS TABLE (
  brand_slug   text,
  target_table text,
  first_date   date,
  last_date    date,
  median_rows  integer,
  days_present integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.brand_slug,
         u.target_table,
         min(u.report_date),
         max(u.report_date),
         public.upload_coverage_median(
           array_agg(u.row_count ORDER BY u.report_date DESC)
             FILTER (WHERE u.report_date >= current_date - 28)
         ),
         count(*)::int
  FROM public.upload_coverage_daily u
  WHERE u.row_count > 0
    AND (p_brands IS NULL OR u.brand_slug = ANY(p_brands))
  GROUP BY u.brand_slug, u.target_table;
$$;

REVOKE ALL ON FUNCTION public.get_upload_coverage_bounds(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_upload_coverage_bounds(text[]) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Export-layout probe (derived, never hardcoded)
-- ─────────────────────────────────────────────────────────────────────────────

-- TikTok is mid-migration: some brands ship the merged export, some still ship
-- the pre-merge split pair whose Video List half lands in `videos` carrying real
-- engagement numbers. The only durable signal is that layout difference itself —
-- so this returns, per brand, the last time a `videos` row arrived WITH
-- impressions, next to the last time any `videos` row arrived at all.
--
-- Both columns are needed because migration 110's dual-ingest writes an
-- impressions-free identity row into `videos` on EVERY video_performance upload.
-- So "wrote to videos recently" proves nothing; only "wrote impressions
-- recently" separates the layouts.
--
-- This is reported as metadata, NOT used to add or remove an expected report —
-- see the note in src/lib/data/upload-coverage.ts for why the caller refuses to
-- hang `expected` on a signal this fragile.
CREATE OR REPLACE FUNCTION public.get_upload_export_layout(
  p_brands text[] DEFAULT NULL
) RETURNS TABLE (
  brand_slug            text,
  last_videos_write     timestamptz,
  last_impressions_write timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT v.brand,
         max(v.created_at),
         max(v.created_at) FILTER (WHERE v.impressions > 0)
  FROM public.videos v
  WHERE v.created_at >= now() - INTERVAL '30 days'
    AND v.brand IS NOT NULL
    AND (p_brands IS NULL OR v.brand = ANY(p_brands))
  GROUP BY v.brand;
$$;

REVOKE ALL ON FUNCTION public.get_upload_export_layout(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_upload_export_layout(text[]) TO service_role;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Scheduled refresh (outside the transaction — pg_cron may be absent)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  -- Every 10 minutes over a short window: this is the number an operator stares
  -- at right after uploading. The live overlay covers the last 2 days regardless,
  -- so this tick exists to keep the 3-14 day tail (re-uploads, corrections)
  -- honest rather than to serve today.
  PERFORM cron.schedule('refresh-upload-coverage', '*/10 * * * *',
                        'select public.refresh_upload_coverage(14)');
  -- Nightly, wide enough to cover the ledger window plus its baselines.
  PERFORM cron.schedule('refresh-upload-coverage-nightly', '35 4 * * *',
                        'select public.refresh_upload_coverage(60)');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not configured (%) — schedule refresh_upload_coverage() externally', sqlerrm;
END $$;

-- Seed. Bounded at 60 days so this cannot hit a statement timeout on a populated
-- database: 60 days measures ~2 s on prod (the 30-day aggregates are 396 ms /
-- 581 ms / 11 ms). 60 days covers the 30-day ledger plus its 7-day baselines
-- with room to spare. For deeper history in the detail drawer, run
--     select public.refresh_upload_coverage(400);
-- once, out of band.
SELECT public.refresh_upload_coverage(60);
