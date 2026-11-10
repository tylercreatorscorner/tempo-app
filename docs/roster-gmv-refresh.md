# Roster GMV refresh

`creator_performance` is the source for daily creator GMV. `roster_creator_daily`
is a derived cache. The GMV worker and publishing refresh update separate columns;
an expensive publishing/universe failure cannot roll back GMV.

## Processing and access

- Source INSERT/UPDATE/DELETE statement triggers enqueue affected brand/days.
  UPDATE includes old and new keys; historical dates have no rolling-window limit.
- `refresh-roster-creator-gmv` runs every minute, with at most eight keys and a
  25-second loop budget. Each SQL invocation has a 45-second timeout.
- Only one worker transaction runs at a time. Queue generations prevent an import
  arriving during processing from being acknowledged by the older refresh.
- Failures retain the key, error and attempt count for a five-minute retry.
  Null source GMV fails visibly instead of publishing a partial sum or zero.
- Existing publishing counts survive GMV refresh. Deleted GMV source keys become
  zero in the derived cache, while any publishing evidence remains intact.
- Private queue/status tables and worker calls are restricted to the service role
  and database owner. The source trigger has narrowly scoped owner privileges so
  existing authorized source writers can enqueue without private-table access.

## Migration and cutover

1. Record the active state of the two existing roster summary cron jobs. Temporarily
   deactivate them and let any in-flight calls finish before applying the migration.
2. Apply `20261110205430_roster_gmv_refresh_queue.sql`. Its NOWAIT table locks fail
   fast if an old writer is still active. It performs no bulk backfill under locks.
3. Restore the original cron active states, including on a failed migration.
4. Enqueue confirmed stale source/cache brand-days, then process bounded batches.
   Never change raw source data, creator agreements or frozen reports for a repair.
5. Verify per-handle source/cache equality, unchanged posts, queue drainage, and a
   successful automatically scheduled run. Total sums alone can hide offsetting errors.

Example confirmed-day catch-up, run as database owner:

```sql
INSERT INTO roster_jobs.gmv_queue AS q (brand_slug, stat_date)
VALUES ('confirmed_brand_slug', DATE '2026-11-08')
ON CONFLICT (brand_slug, stat_date) DO UPDATE
SET generation=q.generation+1, next_attempt_at=clock_timestamp();

SET statement_timeout='45s';
SELECT public.process_roster_gmv_refresh_queue(8);
```

## Monitoring

```sql
SELECT brand_slug, stat_date, requested_at, attempts, next_attempt_at, last_error
FROM roster_jobs.gmv_queue ORDER BY requested_at;

SELECT brand_slug, stat_date, refreshed_at, source_rows, changed_rows
FROM roster_jobs.gmv_refresh_status ORDER BY refreshed_at DESC LIMIT 30;

SELECT status, start_time, end_time, return_message
FROM cron.job_run_details
WHERE jobid=(SELECT jobid FROM cron.job WHERE jobname='refresh-roster-creator-gmv')
ORDER BY start_time DESC LIMIT 10;
```

An old queued key or repeated failures needs investigation even when cron itself
reports success, because failed keys are intentionally retained without blocking
other brands. The worker only reconciles available source data; missing TikTok
exports remain a separate coverage issue. This does not alter the upload workflow.

## Verification

`npm run test:roster-refresh` executes the complete migration in PostgreSQL via
PGlite with only the scheduler stubbed. It covers bulk transitions, historical
corrections, deleted/renamed keys, null values, partial cancellation, generation
changes, bounds, posts preservation and actual role permissions. Its generation
injection is a deterministic race simulation, not a multi-session concurrency test.
