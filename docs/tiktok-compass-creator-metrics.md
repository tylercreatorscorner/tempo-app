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

Migration `20260915025452_compass_creator_metrics_merge.sql` is applied to the
test database only. Apply it before deploying this code to any other environment.
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
