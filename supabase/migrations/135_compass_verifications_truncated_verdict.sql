-- 135_compass_verifications_truncated_verdict.sql
--
-- Add a 'csv_truncated' verdict: rows missing, GMV intact.
--
-- Found by running the watchdog against 2026-07-17, the day jiyu's export
-- truncated at exactly 5,000 rows. It returned "match" — because GMV was
-- PERFECT ($20,961.87 on both sides, 0%). The 5,000-row cap dropped only
-- ZERO-GMV creators, so a GMV-only comparison cannot see it at all.
--
-- The creator COUNT sees it instantly:
--     2026-07-17   API 9,275  vs  CSV 5,000   → +4,275  (46.1%)
--     2026-07-24   API 8,865  vs  CSV 8,867   →     -2  ( 0.0%)
--     2026-07-25   API 8,760  vs  CSV 8,761   →     -1  ( 0.0%)
--
-- Enormous separation, and note the DIRECTION: on healthy days the API has one
-- or two FEWER creators than the CSV, so only a POSITIVE gap is a signal.
--
-- Kept DISTINCT from csv_short rather than folded into it. Both mean "re-export
-- that day", but they are different faults: csv_short is money missing,
-- csv_truncated is coverage missing with the money intact. A roster count,
-- posting rate or "who was active" read off a truncated day is wrong even
-- though every dollar reconciles — and collapsing the two would hide exactly
-- that.
ALTER TABLE public.compass_verifications
  DROP CONSTRAINT IF EXISTS compass_verifications_verdict_check;

ALTER TABLE public.compass_verifications
  ADD CONSTRAINT compass_verifications_verdict_check
  CHECK (verdict IN ('match','csv_short','csv_over','csv_truncated','csv_missing','api_unavailable'));
