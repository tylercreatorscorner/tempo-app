# Creator agreement ledger

The approved compact agreement editor is integrated into creator profiles. Production activation is controlled separately by `CREATOR_AGREEMENTS_ENABLED` and `CREATOR_AGREEMENTS_WRITES_ENABLED`. Both must be true for saves, scheduled renewals and reader catch-up. Existing roster terms are never automatically backfilled into historical agreements.

## Behavior

- Monthly automatic or explicit renewal, custom opening periods, fixed campaigns and post packages.
- Append-only period revisions, effective-date changes, period-only exceptions and scheduled future terms.
- Integer-cent fees, optimistic concurrency, replay protection and overlapping-agreement rejection.
- Scoped server authorization for tenant, brand relationship, roster capability and creator-cost visibility. Impersonated sessions cannot write.
- Server-only ledgers and audit events. Browser roles cannot select them or execute the save function.
- Roster INSERT and UPDATE guards prevent legacy fee/quota changes or relationship relinking from bypassing recorded agreements. Matching roster terms remain valid.
- Scheduled hourly renewals and scoped read-time catch-up handle effective dates, expiry and month boundaries. Processing drains pages, retries a concurrent save and surfaces failures.
- Creator/brand portals and report exports read dated terms. Custom or split periods suppress calendar-month pace and incompatible fee ratios.
- Creator monthly publication counts use publication dates, not the dates on which older videos earned sales.
- Reports capture agreement period/revision context. Corrections create new links and leave sent snapshots unchanged. Web, PDF and CSV withhold unsupported payment estimates.

Published posts do not establish accepted deliverables or payment owed. Prior-period credits, invoice approval and payment execution remain separate. No opening terms may be invented from current roster values. Concurrent overlapping commercial agreements require a future explicit grouping rule.

The legacy renewal API is tenant/brand/cost scoped and excludes verified agreements from old rolling-period scores. Its review component is not currently mounted in a page; this release does not introduce a new renewal review navigation flow.

## Verification and deployment

Run `npm run test:ci`, `npm run typecheck`, and the release workflow. Tests exercise domain transitions, real Postgres migrations, tenant/role denials, immutable history, scoped readers, report preservation, concurrent renewal catch-up, publication counts and both activation flags. Fixture tests do not write real business data.

The four additive ledger migrations were applied to the shared hosted database after isolated Postgres verification. Read-only hosted checks confirmed trigger definitions, fixed function search paths, denied browser grants and zero agreement/event records. No disposable hosted branch was used. Expected no-policy advisor notices apply to the intentionally server-only RLS tables; unrelated existing advisor findings are outside this change.

Signed-in preview verification covered the integrated profile editor and review without saving, brand switching, creator portal fee/count displays and desktop/mobile layouts. Brand-role manual verification is unavailable through the owner session; its scoped reader and CSV boundaries have automated coverage. Do not change user roles to test.

Release checklist:

1. Confirm the reviewed head passes hosted preview build and release checks.
2. Record the production rollback deployment and commit privately.
3. Activate production feature and write flags only with the deployed protected renewal scheduler. The existing cron secret must remain configured.
4. Verify production profile/editor loading and scheduler authorization without creating fictional agreements.
5. Record the final deployment and any verification limits in the private roadmap.

Before rollback after real agreements exist, disable agreement writes and assess historical reader compatibility. An old application that ignores recorded agreement periods is not a safe automatic rollback target once the ledger is in use.
