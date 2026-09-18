# Agreement ledger implementation status

The approved compact flow is unchanged. The creator-profile integration and reader cutover are implemented. The interface is **not enabled in production**. Saving is separately gated by `CREATOR_AGREEMENTS_WRITES_ENABLED`; existing creator terms are not backfilled.

## Implemented

- Calendar-month renewal with a separate period snapshot and append-only revisions.
- Whole-period exceptions, future-renewal changes, effective-date splits, explicit renewal, fixed campaigns/packages and final-date termination.
- Fee values use integer cents. No payout is executed or approved. Partial months and split terms explicitly require payment review.
- Scoped server reads/writes require roster permissions, creator-cost visibility, matching tenant, exact creator-brand association, and brand reach. Impersonation cannot write.
- Atomic compare-and-swap save, request replay protection and overlapping-agreement rejection; append-only audit events record actor and command.
- RLS and revoked public/client grants; RPC executable only by server role. SQL also refuses removal/replacement of stored period revisions.
- Bounded renewal worker with cursor pagination and failure IDs. It uses a system actor and catches up missing calendar months without duplicate periods.
- Report snapshot helper returns a detached copy of a specific period revision. Report generation captures ledger, period and revision references. Report corrections and copy edits insert a new report with a new token; existing sent snapshots remain unchanged.

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

### Opening-period rule approved
Managers choose the first period end date. July 24 through August 31 is one agreement period with one fee/post commitment; the next period starts September 1. Subsequent periods end at calendar month-end. First-period-only corrections run through the chosen end date and do not leak into renewals. Implemented in the model and approved form, with regression coverage. The remaining release gates above still apply.

## Integration checkpoint

- Creator Agreements tab uses the approved form, scoped API, period selector, recorded revisions and explicit manual-renewal review.
- Roster readers resolve verified terms for the selected date. The protected scheduled route advances periods and synchronizes current roster terms at future effective dates, expiry and renewal boundaries.
- SQL guards prevent legacy commercial edits bypassing recorded agreements. The trigger uses a narrowly scoped definer to read server-only ledgers on the caller's already-authorized row; it has no public execute grant.
- Report rows carry agreement dates and revision metadata. Non-comparable periods/payment rules suppress delivery-based spend estimates rather than inventing a payout. Credit allocation and final invoice approval remain separate.
- Both migrations applied to the hosted database; read checks confirmed zero agreement/event records, denied browser ledger access, and a working report query. No creator agreements or sent reports were changed.
- Hosted security advisors flagged only informational missing-policy entries on the new server-only, RLS-enabled tables; unrelated database warnings remain outside this batch.
- Local typecheck, focused lint, lifecycle/SQL/report/profile tests pass. Full regression chain passed through creator auth; remaining tsx/manager/agreement tests passed separately with esbuild subprocess access.
- Pending: hosted preview build and signed-in desktop/mobile verification, full period/payment reader audit, production write enablement. Do not enable writes until those checks pass.

The earlier numbered release gate is a checklist, not a claim that every item remains unimplemented. Hosted migrations were verified in PGlite and with read-only hosted checks; a disposable hosted branch was not used.

Scoped service regression tests now cover permissions, tenant/brand identities, missing relationships, archived writes, impersonation, read failures and review without persistence.
