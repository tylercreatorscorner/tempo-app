# Compass creator metrics: test implementation

The 202603 seller-authorized Compass CREATOR report is an 11-column XLSX,
different from Tempo's larger manual upload schema. The integration now accepts
that exact schema and updates only the metrics reconciled to Affiliate Center:
daily creator GMV and items sold. It preserves existing content counts, channel
GMV, commissions, refunds and managed-creator links. New rows leave unvalidated
metrics null. Creator handles remain the report's identifier; it has no Open ID.

## Verified result

JiYu, July 24, 2026, USD, fixed UTC-8:

| Source | Creator rows | GMV | Units | Zero-GMV creators |
|---|---:|---:|---:|---:|
| Compass workbook | 8,943 | $22,436.68 | 579 | 8,771 |
| Hosted test creator_performance | 8,943 | $22,436.68 | 579 | 8,771 |
| Hosted test daily_creator_stats (brand portals) | 8,943 | $22,436.68 | 579 | 8,771 |

The UI's shop GMV and units match these totals; all five leading creator GMV
amounts match to the cent. The workbook SHA-256 is
`bf2449a6e19729d5438f3c285d6221045d7949579471607bed700411623a19e2`.
The private workbook remains outside Git. These are captured historical data,
not a fresh production synchronization.

July 25 independently matches $21,114.34 across 8,852 creators (8,684 zero-GMV)
and 507 units. The five leading UI tooltips match exactly: shopbyjake $1,641.50,
scrublifewithnursenancy $810.06, kbeautymom75 $695.30, mcamila0301 $616.81,
and k_ushlee $601.28. The second day's workbook was also imported to the hosted
test database through the same partial writer. Its SHA-256 is
`42d7980655e1eff0f2522dfbba67d3082be05e9dbb0e8f4ec7f66b4c846c9465`.

A broader UI check found 8,873 creator rows for July 25 with All selected,
versus the workbook's 8,852 unique named rows. That 21-row coverage difference
is unresolved. The 13 zero-GMV creators on the UI's last page are all present in
the workbook, including homesweetcottage with one video and no sales. These
checks do not establish that every UI creator is present. A fresh UI export
completed, but no downloadable file artifact was returned through the browser
tools, so full-file comparison remains pending.

## Implementation and safeguards

- `/api/tiktok/compass/run` uses the existing admin authentication and explicit
  brand resolution. Writes now require CREATOR, PAST_24H and a completed day.
- The exact header schema and task filename must identify the requested day.
  Multi-day exports cannot be assigned to a single daily fact row.
- `merge_compass_creator_metrics` resolves the brand's workspace, rejects mixed
  brand/date payloads and duplicates, and shares the manual uploader's advisory
  lock. It refuses a report missing existing creators with GMV or units.
- The merge is one transaction, deletes no rows and updates only GMV and units.
  Existing CSV source labels are preserved on mixed rows; ingestion_runs records
  the API operation. Do not interpret the row-wide data_source as field provenance.
- The function uses invoker security; only service_role can execute it. Its
  search path supports the existing daily-statistics trigger, which is included
  in the SQL regression test.
- Zero-sale creators remain present. Creator-level post counts are deliberately
  not used as the content inventory. The separate content importer retains
  individual zero-sale posts.

## Validation

Run `npm run test:tiktok-compass-creators`, `node --import tsx scripts/test-tiktok-compass.ts`,
and `npm run typecheck`. For the real local workbook, pass its path as the first
argument to `scripts/test-compass-creator-report.ts`. That optional test verifies
the known row count, exact totals, top five and full SQL merge.

`scripts/replay-compass-creator-test.ts <workbook> [2026-07-24|2026-07-25]` writes
only to the existing test project `otwssgedcnxamcglqpnn`, brand `jiyu-api-test`.
It checks both the database URL and date-specific workbook hash. July 24 is the
default date. The hosted test confirmed both fact tables.

## Rollout boundaries

The transport layer can resume a persisted export after a polling timeout. It
requires the same brand, date, module, window and plan, skips task creation and
continues polling/downloading the saved task ID. The recovery test exercises an
initial timeout followed by successful download with exactly one create request.
Wrong scope and malformed task IDs are rejected without an upstream request.
The admin run route accepts `resumeTaskRowId`, a ledger UUID returned by a prior
run. It loads the task server-side and compares the active shop and connection,
brand, date, module, window, plan, API version, parameter location and task-list
filter. It never accepts an arbitrary upstream task ID for recovery. Legacy
rows without recorded context are refused rather than assigned guessed settings.

New task IDs are durably recorded before polling; a ledger failure now stops the
run. A 330-second lease exceeds the route's 300-second execution limit. A
compare-and-set claim prevents two recoveries from winning, and an ownership
token blocks stale workers from changing the task ledger. Finished runs release
the lease. Explicit retries open a new ingestion run, preserving the original
failure record. A scheduler and automatic retry dispatch are still not enabled.

`npm run test:tiktok-compass-recovery` exercises the actual ledger SQL and touch
trigger, competing claims, expiry, all scope fields, stale updates and ingestion
timeout-to-resume behavior. The resumed parser retains zero-sale creators and
the existing partial writer remains the only fact-table write path.

Compass list/download requests disable the SDK's internal retries so a long
TikTok Retry-After cannot consume the worker's execution budget before the
failure is recorded. Structured retry metadata survives transport and ingestion.
Known task failures save retry_not_before, reason and safe upstream identifiers;
an early resume is refused. Code 36009037 imposes at least one hour, longer
Retry-After values win, and other transient reads/pending tasks wait one minute.
HTTP-date Retry-After and business-error envelopes retain their delay too.

These are per-task retry holds, not a shared app-wide quota clock. A failed
create with no task ID is reported for inspection and must not be blindly
recreated. Automatic dispatch still needs an app-wide hold and bounded retry
attempts before it can be enabled. No retry is evidence of a fresh historical
export; TikTok may serve the same cached task.

`npm run test:tiktok-compass-retry` exercises throttled create/list/download
responses with real local HTTP requests, including a client configured to
retry by default. Hosted test recovery verifies the persisted hold and refusal
before it expires, using only a synthetic task ledger row.

Migrations `20260915025452_compass_creator_metrics_merge.sql` and
`20260915053541_compass_task_recovery_context.sql` are applied to the test
database only. `20260915063729_compass_retry_timing.sql` adds the retry timing
fields and is also test-only. Apply all three before deploying this code to
any other environment.
No production import or recurring synchronization has been enabled.

This does not complete per-video or per-LIVE Affiliate Center GMV. The creator
workbook contains neither individual content IDs nor individual content GMV.
Its video/LIVE counts also differ from the UI, so they cannot replace deliverable
counts. Seller Analytics video GMV remains a separate metric, not a fallback
for missing affiliate-attributed GMV. Two historical dates do not establish an
all-date or intraday freshness guarantee. July 25 task creation first returned
TikTok internal error 36009003; after checking the task list, one retry succeeded.

The August 2026 target collaboration promotion-detail API exposes per-product
video/LIVE promotion counts for a specified creator and invitation. Its inspected
response does not expose per-content GMV; it is a potential deliverable cross-check,
not a solution to the outstanding revenue attribution gap.

Official references:
[Create Compass export](https://partner.tiktokshop.com/docv2/page/create-compass-offline-export-task-202603),
[Task list](https://partner.tiktokshop.com/docv2/page/get-compass-task-list-202603),
[Download](https://partner.tiktokshop.com/docv2/page/download-compass-task-file-202603).
