-- get_creator_brand_gmv, but filtered to the managed handles the caller
-- actually wants. This is the fix for the dashboard's 84-round-trip fan-out.
--
-- THE PROBLEM. computeManagedGmv fired ONE get_creator_brand_gmv per store (28
-- of them), each returning EVERY creator on that brand, then threw ~99% away in
-- JS against its managedLookup. Per 30-day window:
--     291,198 rows / 28 calls   ->   2,446 rows / 1 call   (99.2% less)
-- The dashboard runs three windows (period / trailing-30d ROI / prior), so 84
-- round-trips per load. That is what starved the connection pool and timed out
-- its neighbours — Total GMV, the sparkline series and Top Videos all died on a
-- 30-day load while each query was individually fast.
--
-- AND IT DEFUSES A LIVE BOMB. PostgREST caps results at 100,000 rows and
-- truncates SILENTLY. cosrx alone returns ~74,000 (brand, creator) rows — 74% of
-- the cap — and it is WINDOW-INDEPENDENT, so no date narrowing shrinks it. The
-- per-store split was the only thing keeping it under; one more busy brand and
-- managed GMV starts under-counting with no error whatsoever. Filtering to ~1,290
-- managed handles removes the ceiling instead of moving it.
--
-- lower(cp.creator_name) matches the existing idx_creator_perf_creator index and
-- mirrors migration 072's get_creator_perf_by_handles. Verified safe: ZERO rows
-- in creator_performance have a leading '@' or surrounding whitespace, so it is
-- identical to the TS normalizeHandle form. If that ever changes, this filter
-- starts silently dropping creators — normalize on write, not here.
--
-- THE SQL FILTER IS A PRE-FILTER ONLY. The authority on "managed" remains the
-- managedLookup (handle|||store) check in managed-gmv.ts, which carries the
-- umbrella expansion and the account_1..5 fallback. Porting that rule into SQL
-- would create a SECOND definition of managed — the exact drift that module
-- exists to prevent (see PRs #98/#99).
--
-- get_creator_brand_gmv is intentionally left in place: nothing calls it now, so
-- rollback is a one-line revert in managed-gmv.ts rather than a DB change.
--
-- VERIFIED against the old 28-call path over 2026-06-16..07-15, per brand:
-- physicians_choice 675,452 · catakor 501,847 · dr_dent 444,902 · leefar_us
-- 397,576 · leefar_nutrition 281,790 · leefar_supplements 257,050 · jiyu 245,408
-- · cosrx 112,921 · lemme 108,144 · forchics 74,005 · m3 55,723 · neurogum
-- 48,773 — every brand identical.

CREATE OR REPLACE FUNCTION public.get_managed_creator_brand_gmv(
  p_start_date date,
  p_end_date date,
  p_brands text[],
  p_handles text[]
)
RETURNS TABLE(brand text, creator_name text, gmv numeric)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    cp.brand::text,
    cp.creator_name::text,
    SUM(cp.gmv)::numeric AS gmv
  FROM creator_performance cp
  WHERE cp.period_type = 'daily'
    AND cp.report_date >= p_start_date
    AND cp.report_date <= p_end_date
    AND cp.brand = ANY(p_brands)
    AND lower(cp.creator_name) = ANY(p_handles)
  GROUP BY cp.brand, cp.creator_name
$function$;

GRANT EXECUTE ON FUNCTION public.get_managed_creator_brand_gmv(date, date, text[], text[])
  TO authenticated, service_role;
