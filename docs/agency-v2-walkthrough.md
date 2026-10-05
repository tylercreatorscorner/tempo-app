# Agency V2 walkthrough for Jimmy

Prepared October 4, 2026. This is the Agency V2 preview, not a production-release announcement.

Preview: https://tempo-app-git-feat-agency-billing-v2-tylers-projects-82ff8a29.vercel.app/agency

## Ten-minute walkthrough

1. **Overview:** select September. Explain calculated service fees, active clients, opening-cohort retention and managed GMV. Partial subtotals identify how many clients are included; they are not collected revenue.
2. **Resolve a comparison:** expand a tenure group's details. It names each client, the missing months or service-date boundary, and the appropriate next step. Correct erroneous dates, import missing source data, or wait for a genuinely new client to establish two full service months. Do not change accurate dates simply to force a comparison.
3. **Business over time:** switch between active clients, retention and calculated service fees. The fee chart includes only fully covered months; partial subtotals remain visible in the table. Select a month to open its billing review.
4. **Clients:** open a client to inspect real service dates, linked operating brands and effective agency terms. Linking a brand connects performance data; the agency client is the contractual relationship. Ending a client preserves its history.
5. **Revenue:** inspect a fee's source evidence. The sequence is Review fee, Record invoice, then Record payment. These record accounting facts; they do not send invoices or move money. A partial service month needs an explicitly agreed fee, not an invented prorated amount.
6. **Corrections:** reviewed amounts preserve their evidence. Corrections, invoice voids and payment reversals append history. Dependent effective dates cannot place a replacement invoice before its void or reuse a reversed payment before the reversal.
7. **Reports and brand drill-down:** Agency Reports links to operational reports. Brand links open the brand dashboard. All Brands is labeled Brand portfolio, distinct from this internal Agency business workspace.

## Access and scope

The V2 access rule is limited to Tyler and Jimmy's designated leadership accounts in Creators Corner. Ordinary Admin, manager, coach and finance permissions do not independently grant Agency access. Logan is deliberately deferred. Navigation, direct pages and APIs share the rule.

Agency service fees are separate from creator retainer funding and team compensation. This is not yet a profit or contribution-margin statement. No accounting user was granted additional access as part of this build.

## Real information still needed, when available

- Historical effective fee terms must come from the actual agreements. Missing terms cannot be reconstructed from current fees.
- Invoice references and payments received must come from accounting records. No records means none recorded, not that the client has paid zero or owes nothing.
- Partial-month service fees require the amount actually agreed with the client.
- Source-data gaps require imports for the months named in the comparison details. Correct service dates may legitimately make a client non-comparable.

None of these decisions blocks reviewing the interface. Do not enter demonstration invoices or receipts in the hosted preview: it shares the live database. The local billing fixture uses synthetic, in-memory records for mutation testing.

## Validation

Agency authorization, financial transitions, exact-cent calculations, historical snapshots, SQL isolation, performance coverage and business routes pass the Agency regression suite. TypeScript and Agency lint pass. The local fixture verifies the corrected Cancel/discard flow and chart coverage states. Final hosted checks and deployment status are recorded in PR #203.
