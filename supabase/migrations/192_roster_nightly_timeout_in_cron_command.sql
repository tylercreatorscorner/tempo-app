-- Make the nightly roster rollup actually able to finish.
--
-- 🚨 A FUNCTION'S `SET statement_timeout` CANNOT EXTEND THE STATEMENT THAT
-- CALLS IT. The timeout timer is armed when the top-level statement BEGINS,
-- before the function body is entered, so a `SET statement_timeout = '20min'`
-- in the function definition applies to statements the function itself runs
-- later, never to its own invocation.
--
-- refresh_roster_summaries_nightly has carried statement_timeout=20min since
-- migration 168 and was STILL killed at the instance-wide 120s
-- (postgresql.conf, statement_timeout=120000) on every single run: 14 of 14
-- nights failed, 0 successes, always at exactly 120s, always on the
-- `insert into public.roster_creator_daily`.
--
-- ⚠️ WHAT THAT COST. The 20-minute job (refresh_roster_summaries(3)) fails
-- about 11% of the time (112 of 1008 runs) and leaves PARTIAL writes behind:
-- a day with 17 rows instead of 2,829. The nightly 40-day pass is the thing
-- that repairs those, and it had never once run to completion. So the holes
-- accumulated silently in the Dashboard's managed GMV:
--
--     11 brands affected over 2026-08-26..09-01
--     2026-08-28 MISSING entirely for 7 brands
--     2026-08-27 partial for 8 (serene_herbs 17/2829, kitsch 199/29394,
--                               keeps 5/340, m3 21/3980, neurogum 28/9046)
--
-- The source tables were complete throughout. Only the rollup was wrong, which
-- is why it read as a "data gap" on the chart while uploads looked fine.
--
-- The fix is to raise the timeout in the CRON COMMAND, in the same session,
-- before the calling statement starts. Verified afterwards: the repair run
-- survived past 146s, which the old configuration would have killed.
--
-- ⚠️ Do NOT "fix" this by putting the timeout back in the function and
-- deleting it here. It has to be set before the statement is armed.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'refresh-roster-summaries-nightly'),
  command => $cmd$set statement_timeout = '20min'; select public.refresh_roster_summaries_nightly(40);$cmd$
);
