# Agency V2: billing review and leadership reporting

V1 is released through PR #202. V2 starts on a separate branch so new financial workflows do not change the released workspace before review.

## Delivery order

1. Client readiness: finish actual service dates, end dates/reasons, and effective agency terms. Unknowns remain excluded with coverage labels. Never infer dates from a first sale, import, or archive flag. Quick setup stays available; historical changes use the detailed editor.
2. Monthly billing review: a row per client and completed service month. Calculated -> Reviewed -> Invoiced -> Partially paid / Paid. An authorized leader can review the source amount, enter a documented adjustment, and freeze a snapshot. Recording an invoice is distinct from sending it. No automatic emails or payment execution.
3. Invoice and collection history: store external invoice reference, issue/due dates, currency, partial receipts, corrections, and reversals with actor/time. Invoice and payment facts come from accounting records; absence remains unknown. Changes append audit events and do not rewrite a reviewed snapshot.
4. Leadership view: month-by-month calculated fees, reviewed fees, invoices, and cash receipts shown separately; client starts/exits, churn, and GMV growth by tenure. Each metric names its population and coverage. Cash follows receipt date; invoices follow issue date; reviewed fees follow service month. Team compensation and creator funding remain separate. Contribution after team compensation waits for sourced payout records.

## Snapshot contract

At review, the server recomputes from authorized data and freezes client ID/revision, linked brands, effective terms, service period, managed GMV, source cutoff, coverage, calculated cents, adjustment cents and reason, reviewer and time. Client changes make an unreviewed draft stale. Reviewed historical snapshots stay fixed. Corrections create a successor and require an explicit reason.

The reviewer never supplies tenant, actor, source GMV, or source fee through a writable request. Server-side authorization and per-client/month locking are mandatory. Same-origin JSON, exact decimal cents, optimistic revision and idempotency tokens guard every mutation. Immutable service-only tables and invoker RPCs follow V1.

## Access

Agency is restricted to owners and explicitly designated VPs. General Admin, manager, coach, viewer, brand access and finance permissions do not independently grant Agency access. Tenant owners qualify automatically; Admin accounts require a server-managed owner or VP designation in agency_leadership_access. The same predicate controls navigation, direct pages, business APIs and billing APIs. Missing designation storage fails closed. Accounting access is not included in this release.

## UI

Agency > Revenue gains Review queue and Invoice history. A compact row shows client, service period, calculated amount, reviewed amount, status, and one explicit next action. The detail drawer contains calculation evidence, agreement version, adjustment reason, invoice references, payment history, and audit trail. Setup blockers link to the exact client. Global totals never substitute zero for missing billing records.

## Implementation and verification

The connected V2 build adds a monthly review queue, invoice and partial-receipt records, documented review corrections, invoice voids, receipt reversals, and a six-month leadership history. All mutations record facts entered by an authorized operator; they do not send invoices or move money.

Review uses a server-derived fee and compares it with the calculation the reviewer saw. Agreement revision and billing revision must still match. A request ID supports exact retries without duplicate entries. Corrections append a new snapshot rather than updating the previous one. Invoice and receipt references are protected against duplicate recording.

`/agency/revenue` is the monthly work queue and history. `/agency` includes expandable business history, with separate service-month, invoice-date and receipt-date totals. Missing information remains labeled. Current saved client history reconstructs calculated trends; frozen billing evidence preserves reviewed history.

### Test environments

`node scripts/preview-agency-billing.mjs` builds an isolated interactive fixture under `.design-preview/agency-billing`. Its synthetic clients and financial actions remain in browser memory, and its fetch adapter blocks outgoing requests. This supports Save, Cancel, validation, error, correction, mobile and dark-theme checks without adding fictional financial records to the shared live database.

Automated tests cover monetary precision, tenant access, same-origin mutation guards, stale calculations, duplicate retries, lifecycle transitions, retained snapshots, and date-based leadership totals. Release status is recorded in the pull request after deployment verification.

### Operational boundaries

General Admin access to Agency is removed. Assigning May or another accounting user new agency-finance access is a separate access decision; no existing user is promoted by this build. Historical invoices and receipts must be entered from accounting records. No prior payments are inferred from GMV, calculated fees or a zero balance. Creator funding and team compensation stay outside agency service-fee totals.
