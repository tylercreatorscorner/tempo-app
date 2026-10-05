# Agency V2: billing review and leadership reporting

V1 is released through PR #202. V2 starts on a separate branch so new financial workflows do not change the released workspace before review.

## Delivery order

1. Client readiness: finish actual service dates, end dates/reasons, and effective agency terms. Unknowns remain excluded with coverage labels. Never infer dates from a first sale, import, or archive flag. Quick setup stays available; historical changes use the detailed editor.
2. Monthly billing review: a row per client and completed service month. Calculated -> Reviewed -> Invoiced -> Partially paid / Paid. May can review the source amount, enter a documented adjustment, and freeze a snapshot. Recording an invoice is distinct from sending it. No automatic emails or payment execution.
3. Invoice and collection history: store external invoice reference, issue/due dates, currency, partial receipts, corrections, and reversals with actor/time. Invoice and payment facts come from accounting records; absence remains unknown. Changes append audit events and do not rewrite a reviewed snapshot.
4. Leadership view: month-by-month calculated fees, reviewed fees, invoices, and cash receipts shown separately; client starts/exits, churn, and GMV growth by tenure. Each metric names its population and coverage. Cash follows receipt date; invoices follow issue date; reviewed fees follow service month. Team compensation and creator funding remain separate. Contribution after team compensation waits for sourced payout records.

## Snapshot contract

At review, the server recomputes from authorized data and freezes client ID/revision, linked brands, effective terms, service period, managed GMV, source cutoff, coverage, calculated cents, adjustment cents and reason, reviewer and time. Client changes make an unreviewed draft stale. Reviewed historical snapshots stay fixed. Corrections create a successor and require an explicit reason.

The reviewer never supplies tenant, actor, source GMV, or source fee through a writable request. Server-side authorization and per-client/month locking are mandatory. Same-origin JSON, exact decimal cents, optimistic revision and idempotency tokens guard every mutation. Immutable service-only tables and invoker RPCs follow V1.

## Access

Keep V1 leadership access unchanged until the billing permissions are implemented. Give accounting specific view/review/invoice/receipt capabilities scoped to the agency; do not make May an administrator to expose this queue. Brand users never see agency financials. Confirm the correct account through the existing team directory before assigning capabilities.

## UI

Agency > Revenue gains Review queue and Invoice history. A compact row shows client, service period, calculated amount, reviewed amount, status, and one explicit next action. The detail drawer contains calculation evidence, agreement version, adjustment reason, invoice references, payment history, and audit trail. Setup blockers link to the exact client. Global totals never substitute zero for missing billing records.

## Current progress

First implementation slice is the pure billing transition model and its tests. No invoice or payment is created by this slice. Storage, authorization routes, review UI, and leadership trends are the next connected build; the model is not a launched billing feature.
