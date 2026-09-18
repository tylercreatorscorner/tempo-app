# Agreement ledger implementation status

The approved compact flow is unchanged. This change adds the domain and persistence foundation; it is **not enabled in production** and does not migrate legacy terms or regenerate reports.

## Implemented

- Calendar-month renewal with a separate period snapshot and append-only revisions.
- Whole-period exceptions, future-renewal changes, effective-date splits, explicit renewal, fixed campaigns/packages and final-date termination.
- Fee values use integer cents. No payout is executed or approved. Partial months and split terms explicitly require payment review.
- Scoped server reads/writes require roster permissions, creator-cost visibility, matching tenant, exact creator-brand association, and brand reach. Impersonation cannot write.
- Atomic compare-and-swap save, request replay protection and overlapping-agreement rejection; append-only audit events record actor and command.
- RLS and revoked public/client grants; RPC executable only by server role. SQL also refuses removal/replacement of stored period revisions.
- Bounded renewal worker with cursor pagination and failure IDs. It uses a system actor and catches up missing calendar months without duplicate periods.
- Report snapshot helper returns a detached copy of a specific period revision. Existing report generation and sent snapshots are not changed.

## Release gate (must complete before enabling)

`CREATOR_AGREEMENTS_ENABLED` defaults off. Do not enable it in preview against the shared live database until:

1. Connect the approved form and history view to the server API, including explicit period selection and authoritative server impact review.
2. Cut over roster cost/commitment readers and report generation together. Legacy edit controls must not remain a second commercial write path for creators with a ledger.
3. Add report references to ledger/period/revision IDs and require a new report version for corrections. Never refresh a sent snapshot in place.
4. Wire the bounded renewal worker to a protected scheduled job that drains cursors and retries/report failures; do not silently process only the first batch.
5. Verify the migration against a disposable hosted branch and run advisors, then deploy migration and gated code in order. This migration has only been tested in local PGlite.
6. Confirm opening terms from evidence. Never backfill earlier periods by copying today's roster retainer.

The initial release deliberately permits only one overlapping commercial agreement per creator/brand. Concurrent campaigns require an explicit agreement grouping and reporting rule before broadening this invariant. Prior-period video credits remain a separate evidence/allocation workflow; setting a policy does not invent videos or mark invoices paid.

## Verification

`node --import tsx scripts/test-agreement-model.ts`
`node scripts/test-agreement-ledger-sql.mjs`
`npm run typecheck`

Domain tests cover the October 5 amendment, November reversion, midmonth split, immutable captured report, manual renewal, termination, duplicate renewal, year rollover and leap February. Database tests cover tenant/brand mismatch, overlap, stale versions, retry keys, event immutability, history replacement and anonymous/authenticated denial. No real creator terms or private business data are in the fixtures.

### Opening-period decision pending
The prototype did not define a custom first billing period. Calendar-month-only creation could incorrectly treat an initial July 24–August 31 agreement as two separate obligations. Asked the user whether the first period end should be explicitly selected (recommended), always same-month end, or following-month end. Keep live writes disabled; incorporate the answer into the domain, form and recurrence tests before the integration gate.
