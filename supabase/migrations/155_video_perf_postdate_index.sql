-- 155_video_perf_postdate_index.sql
--
-- Index video_performance on (brand, post_date), and drop the workaround that
-- existed only because it was missing.
--
-- ── The 504 ─────────────────────────────────────────────────────────────────
--
-- POST /api/client-reports/preview timed out at 60s generating a Lemme report.
-- The chain, measured warm on 2026-08-20:
--
--                            7-day window     30-day window
--     agg                          4.2s
--     extras                      14.7s            16.8s
--     counts (mig 153)             2.9s            10.2s
--
-- Nothing in video_performance was indexed on post_date, so filtering on it
-- meant scanning a 4.3GB heap. Migration 153 worked around that with an
-- open-ended `report_date >= least(prior_start, start)` floor, which pruned
-- the scan using an indexed column — but that made the cost scale with how
-- much data exists AFTER the window, which is the wrong thing to depend on and
-- gets worse every week.
--
-- ── The index ───────────────────────────────────────────────────────────────
--
-- 54MB on an 8M-row / 6.8GB table, partial on the only rows the query wants.
-- Built CONCURRENTLY: video_performance is written by ingest and a plain
-- CREATE INDEX would have taken an ACCESS EXCLUSIVE lock on it.
--
-- With the index the honest filter becomes the fast one, so the report_date
-- floor is removed. 30-day Lemme: 10.2s → 7.6s, and no longer degrades as the
-- table grows past the window. Output is unchanged — 7-day Lemme still returns
-- rosterPosts 194 / rosterPostsPrior 259 / signedPeople 142 / activePeople 48.
--
-- ⚠️ The remaining 7.6s is `cp_agg`, a creator_performance scan across both
-- windows, NOT the posts CTE. And extras at 14.7-16.8s is still the largest
-- single cost in the chain and predates all of this work. Neither is addressed
-- here; both are real and separate.

create index concurrently if not exists idx_video_perf_brand_postdate
  on public.video_performance (brand, post_date)
  where period_type = 'daily' and post_date is not null;

-- Then: get_brand_client_report_counts re-created without the report_date
-- floor. See migration 153 for the function body; the only change is that
--     and vp.report_date >= least(p_prior_start, p_start)
-- is gone, and the comment above the post_date filter now names this index.
