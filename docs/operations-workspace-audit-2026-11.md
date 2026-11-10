# Operations workspace audit

This batch follows the released Agency month-handoff audit. It is a preview change set for Agency planning, Onboarding, Coaching, Communications, standalone Finance, and Settings. No schema migration, actual invoice issuance, payment, outbound message, or live role change is part of the code audit.

## Corrections

| Area | Result |
| --- | --- |
| Agency | Forecast calculations use saved financial assumptions without requiring invoice addresses or bank instructions. Actual invoice preparation retains those checks. Missing inputs group by client and reason with exact month links. Explicit no-fee relationships are excluded from new estimates without erasing existing obligations. |
| Onboarding | Direct invite generation verifies tenant-owned active brands and valid bounds. Copy failures show a selectable link instead of a false success. |
| Coaching | Elite navigation respects unsaved drafts. Discord-group controls require destination permission. |
| Communications | Template selection retains the broadcast composer and brand. Thread loads fail visibly, preserve drafts on uncertain delivery, retain older history during polling, and recover pagination after a failed initial load. Legacy message routes enforce tenant and brand attribution. Optional metric failure does not erase conversations. |
| Finance | Recorded receipt amounts drive paid totals, including explicit zero and the existing legacy fallback. Mark-paid details and status save atomically. View-only users cannot edit, issue, share, or mark paid. Stale loads, exports, invoice previews, and draft hydration are corrected. |
| Settings | Brand changes and billing identities enforce capability, tenant and view-as restrictions. Failed reads offer retry. Stale month changes cannot display another month's terms as current. |

## Verification

- Existing full regression suite passed locally, plus four new operations suites added to `test:ci`.
- TypeScript and ESLint on changed application/test files passed.
- Local production build passed with Webpack. Turbopack cannot resolve the isolated Windows worktree's external `node_modules` junction; the code was not changed to work around that local tooling constraint.
- Actual React controls were exercised in a local fixture with fictional data and intercepted requests: message history load-more/recovery, failed send draft retention, template handoff, invitation clipboard failure, coaching discard cancel, payment failure/retry, recorded receipt display, view-only controls, and settings retries.
- Invoice and settings layouts were inspected at 390px; invoice drawer also checked at 320px. Finance tables retain readable cells within horizontal containers. Desktop and mobile grouped forecast links were inspected.
- Server permission regressions cover foreign tenant/brand, shared creators, view-as, missing capabilities, archived brands, and more than 1,000 roster identities. No test sent a Discord message or changed a live financial record.
- Read-only production walkthrough confirmed the direct-invite workspace, six current coaching assignments and Victoria's review ownership, the separate Messages V1 operator workspace, Settings links, and populated Finance setup. The deployed preview still needs its own signed-in smoke check.

## Release boundaries and follow-up

The owner's explicitly approved forecast assumptions and AFIL planning note were saved separately through the existing audited finance RPC and read back. Dr. G roster/compensation remain deferred. AFIL's eligible GMV cohort is unresolved; execution is a planning assumption, not verified signature evidence. Missing invoice payment/AP details still require real business inputs before issuing.

See `messages-inbox-access.md` for the legacy history attribution limitation and the separation from Messages V1. Provider delivery, signed-in deployed pages, and live role sessions require deployment smoke testing; local fixtures do not establish those results.
