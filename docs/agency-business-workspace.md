# Agency business workspace

The sidebar offers **Brands | Agency** to authorized leadership. Brand operations stay in the existing workspace. Agency contains Overview, Clients, Revenue, and Reports. This is a distinct financial scope; the operational All Brands filter does not grant agency access.

## First release

- Save commercial clients, each linked to one or more top-level brands. A brand belongs to one current commercial client.
- Record actual service start/end dates and an exit reason. Unknown dates remain unknown. Archival and zero GMV never establish client churn.
- Enter effective-month agency service terms: fixed fee, managed-GMV revenue share, additive fee plus share, or a minimum guarantee.
- A new fee input starts at $0; an unsaved agreement remains unconfigured. Saving $0 explicitly confirms it. No spreadsheet import or inferred fees.
- Review completed calendar months. Partial first/last service months require review; there is no assumed proration. Revenue-share calculations require complete recorded daily source coverage and known managed GMV.
- Compare client performance across tenure groups of 1–3, 4–6, 7–12 and 13+ calendar service months. A comparable client must cover both entire months; the same brand population is used for both periods. Missing coverage and pre-service baselines cannot turn into growth claims.
- Existing weekly, monthly/MTD, and saved-report workflows remain available from Agency Reports. Internal service-fee numbers are not inserted into shared reports.

## Metric boundaries

Service revenue is a calculated contract amount for accounting review, not an invoice, payment, or accounting revenue-recognition entry. Creator funding is invoiced separately. Existing Earnings represents individual payee compensation, not agency gross revenue. Invoiced, collected, team payouts, and contribution after compensation need their own source records before they can become financial KPIs.

Opening clients started before the selected month and remain in service at its start. Opening-cohort exits / opening clients is monthly churn. Retained / opening clients is retention. Total exits also include clients that started and ended within that month. An unknown lifecycle prevents presenting the portfolio retention percentage as complete.

Client corrections create immutable revisions and use optimistic concurrency. Current views recalculate from the latest saved service dates, terms, and brand grouping; they are not frozen invoice snapshots. Changing historical terms or grouping can restate these internal views. Published client reports are unaffected. A future reviewed monthly financial snapshot should reference exact client revisions and source cutoffs.

## Access and data handling

Reads require owner/admin, all-brand reach, finance visibility, Reporting read, and Earnings read. Changes additionally require Earnings configure. Impersonation is denied. API handlers derive tenant and actor from the authenticated workspace. Mutations require same-origin JSON and strict validation. Database RPCs are invoker functions callable only by service_role; table RLS and no anon/authenticated grants deliberately deny direct client access.

Managed GMV follows reporting membership intervals and the existing root/child-store relationship. Source completeness means a daily creator export is recorded for each expected store, not an independent guarantee that TikTok supplied every sale. Missing/null money is not zero; refunds are preserved and negative aggregate revenue-share inputs require review.

## Verification

`npm run test:agency` covers money calculations, effective dates, lifecycle denominators, tenure comparisons, actual SQL isolation/grants/revisions/conflicts, source coverage, API authorization and safe errors. It is part of `test:ci`. `npm run lint:agency` is part of the existing release lint suite.

`node scripts/preview-agency-workspace.mjs` produces a standalone local fixture for visual and interaction review. Its demonstration names and amounts never enter the database. Live preview uses the existing live database; do not submit test client agreements there.
