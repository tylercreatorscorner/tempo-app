# Creator agreement flow prototype

Status: design prototype, not a live agreement ledger. Isolated build: `node scripts/preview-agreements.mjs`, then serve `.agreement-preview` on loopback. The harness contains fictional data only. Its clock is October 5 so reviewers can exercise the agreed midmonth-edit scenario.

The same component is wired to the creator profile Agreements tab when `agreementsPreview=1`, restricted to owner/admin with creator-cost visibility. Brand choices come from the existing scoped profile. No mutation endpoint, local storage, database migration, payment action or report refresh is involved. Refresh discards the preview.

## Agreed behavior

- Monthly retainers auto-renew into distinct monthly records; explicit renewal is optional.
- Fixed-date campaigns and deliverable packages have deadlines and do not auto-renew monthly.
- Change terms at this month's start, a specific date, or next month; apply to this period only or future renewals too.
- Preserve prior versions with actor, recorded timestamp, effective date and reason.
- Separate payment approval from renewal and agreement editing.
- Approve prior-period fulfillment credits individually without changing publication dates or duplicating paid credits.
- Ending an agreement stops future renewal and leaves final payment for review.
- Sent reports are immutable snapshots; corrections create a new report revision.

## Prototype scope and next implementation gate

The preview exercises new/change/end and impact review; it does not materialize monthly periods or simulate a full agreement ledger. Activity is an in-memory interaction log, not an audit log. Existing live roster cards are explicitly still current terms. Inputting past effective dates here does not reconstruct historical agreements.

Before persistence: finalize calendar-month versus anniversary billing rules, midmonth split-period calculation/approval, overlapping agreements, termination amendment/undo, historical import provenance, atomic idempotent renewal, immutable revisions, permissions and sent-report snapshot references. Add real ledger tests for October 1 automatic renewal followed by October 5 retroactive amendment, period-only overrides reverting in November, effective-date splits, year rollover, duplicate renewal retries and report immutability.

Delivery credits remain a separate follow-up flow (video selection, evidence, period allocation and duplicate-credit protection). The current selector describes the policy; it does not create credits.
