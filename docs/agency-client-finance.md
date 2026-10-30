# Agency client finance

Agency leadership can open **Agency / Client finance** to configure each client, store signed PDF contracts, prepare agency receivables, and forecast collections. The existing client editor remains the source of truth for linked brands, service dates, and effective agency fee terms.

## Setup and operating flow

1. Create a client in Agency / Clients and link its brands. Set service dates and agency fees.
2. In Client finance, enter the client legal entity, accounts payable details, issuing agency details, and payment instructions. Currency is USD. Billing is monthly in arrears; invoice day, net terms, and expected collection delay are separate fields.
3. Assign a manager with an effective month, managed-GMV percentage, and fixed monthly amount. Pay is due seven calendar days after full collection. Add a later effective arrangement for a change; historical invoice snapshots retain their prior terms.
4. Store signed PDFs (up to 4 MB). Record the signed date, campaign start, renewal date, notice period, and auto-renewal status. Optional AI reading sends the PDF to the existing Tempo-managed Anthropic integration. It returns quoted suggestions and uncertainties. Leadership reviews the source and manually enters approved terms. Extraction does not execute document instructions or apply financial changes.
5. Enter explicit monthly GMV estimates for forecasting. Missing estimates and incomplete setup are reported, never silently treated as zero.
6. Prepare an invoice for a completed month. The server loads the current agency agreement, finance settings, and complete managed GMV for every linked brand. Partial service months and incomplete GMV are blocked for review. Drafts capture the fee calculation, billing details, manager arrangement, GMV, dates, and source revisions.
7. Review and mark issued, print/save the client-facing PDF, and record full collection when received. Issuing does not email the invoice. Record manager payment separately after it is made. No action transfers funds.

## Monthly agency revenue estimates

**Agency / Revenue** automatically combines saved service-month agreements and manager arrangements with recorded managed GMV. It defaults to the current month through the last completed day in America/Chicago; past months use month-end. It does not require manual GMV forecasts or invoice addresses, and opening it never prepares an invoice or changes a payment record.

The three headline amounts use the same supported clients: estimated gross client billings, manager compensation, and the amount Creators Corner retains before overhead. Full monthly fixed fees accompany recorded GMV share; no month-end extrapolation or automatic partial-service proration is applied. Higher-of, tiered, and recipient allocation calculations use the shared integer-cent fee functions. The client table retains unknown amounts, explains exclusions, and links to the relevant agreement or data review. Fixed-only financial amounts may be known even when GMV is unavailable.

An explicitly saved `servicePeriod` records approved amounts for a partial service month. Its dates must match the client's actual service dates within that effective month. The stored fixed amounts are already the agreed period amounts; Tempo never prorates them again. Revenue share uses only GMV earned within that approved service period. Both agency and manager arrangements must agree on the period. The exception expires with its effective month; a later normal terms entry restores the ongoing monthly amounts. Invoice preparation stays blocked unless its GMV source scope matches the approved period.

An explicit fixed-zero agency fee with no manager arrangement is classified as **No agency fees**, outside setup reminders and the included-client subtotal. This does not archive the brand, assert zero manager pay, or alter recorded cash or prior fee periods. An actual manager obligation at zero gross fees still calculates and can show a negative retained amount.

Available but incomplete daily GMV can produce a clearly provisional estimate. Coverage indicates daily creator-data presence across expected stores, not proof that every sale was included in the source export. Missing GMV, unresolved contract terms, unlinked brands, missing manager arrangements, and uncertain service dates remain visible. These estimates use the current client-to-brand links and dated terms; issued invoice snapshots remain separate and unchanged.

Recorded collections and manager payments are a separate cash section, attributed by their actual recorded cash dates within the selected calendar period, regardless of the invoice service month. Only agency invoice payment records in Tempo contribute; individual-payee invoices, creator funding, off-platform accounting receipts, and bank balances are not inferred. This is separate from the 13-week collections forecast below, which continues to use explicit future GMV estimates and payment timing.

## Forecast rules

The 13-week forecast uses rolling seven-day buckets from today in America/Chicago. Open invoices (including explicitly labeled drafts) replace estimates for the same client/month. Paid invoices contribute no future receipt, but unpaid manager obligations remain. Manager pay dates use actual collection where available; scenario delay changes only uncollected amounts. Overdue obligations appear in the first bucket. The detail schedule preserves dates outside the horizon, excluded from totals. Net cash is before overhead and is not profit or a bank balance.

Future fees use recorded effective terms and explicit monthly GMV estimates. No automatic proration, growth extrapolation, or unverified contract interpretation is used. The schedule includes the prior unbilled month and current/next three service months. Older unbilled periods need invoice preparation to enter the schedule.

## Boundaries

This adds agency client receivables; historical individual-payee invoices remain in the existing Finance / Invoicing system and are not included in these forecast totals. Existing issued invoices and earnings are not migrated or recalculated. Only full collections and full manager payments are recorded in this first release; split receipts, refunds, taxes, credits, per-recipient payment tracking, and non-USD billing require a later extension. Multiple manager allocations are supported, with one aggregate paid flag that means every allocation was settled. Adding arrangements or allocations records terms only and makes no payments. A manager selected here is a finance pay arrangement; it does not grant brand access or change user permissions.

The PDF is an authenticated print view with client billing and agency fee amounts only. Internal manager compensation is not rendered. Issuing-agency identity, address, and payment instructions must be configured before invoice preparation. The invoice date is the draft preparation date and is visible for review; void and prepare again to replace a draft or uncollected invoice.

## Access and integrity

Contract effective date, client signature, agency signature, estimated launch, actual campaign start, and confirmed agreement completion are separate fields. General termination notice is separate from notice before renewal. Imported or reviewed contracts can flag a disagreement that blocks preparing invoices until leadership resolves the fees, entity, and GMV basis. Extraction findings and page quotes remain available beside the original document. Billing CC is stored independently from the AP recipient.

Signed contracts can also reference their original Google Drive files. Tempo stores the canonical file link and reviewed findings; opening the document still requires its existing Drive access. No file is copied or made public. Stored PDFs continue to use the private bucket.

Tiered agency terms retain an ordered set of GMV bands, a marginal or whole-month calculation method, and an explicit GMV basis. Marginal fees sum each band's integer-cent allocation before a single final rounding. Unconfirmed calculation methods and unverified contract-specific affiliate attribution require review; they never silently fall back to managed GMV. A confirmed managed-GMV agreement works with the existing authorized, complete monthly GMV source. Historical invoice snapshots stay fixed when current terms change.

All routes require the existing agency leadership guard (owner/admin, all-brand reach, finance visibility, reporting/earnings permissions, and no impersonation). Writes also require earnings configuration permission and a same-origin request. Every privileged query uses the trusted workspace tenant. Contracts live in a private bucket with no public/authenticated object policy. Download URLs expire after 60 seconds and are issued only after an authorized tenant-scoped lookup.

Finance writes serialize with client agreement saves using the same tenant advisory lock. Settings and invoice state changes use optimistic revisions. Invoice creation checks both source revisions under the lock. A partial unique index prevents two active invoices per client/month. Invoice states are draft, issued, paid, or void; paid invoices cannot be voided, and manager payment cannot precede collection. Every finance write appends an immutable audit snapshot. User-facing errors exclude database and provider internals.

## Validation

`npm run test:agency` includes financial model and PGlite database tests covering exact-cent calculations, effective terms, partial months, duplicate invoice prevention, tenant/actor/manager ownership, revision conflicts, transitions, audit immutability, forecast replacement, paid/overdue handling, and seven-day payouts. `node scripts/preview-agency-finance.mjs` provides a local fictional UI fixture with no production requests. Run typecheck and agency lint before release.

## Gross fee components and manager allocations

A component agreement stores the CC additive fee and a manager fee component separately. The gross client fee is the sum of the independently rounded components; it is never the CC net fee alone. A manager component may be additive or a minimum (higher of fixed pay or GMV share). Other saved fee models and issued invoice snapshots retain their original calculations.

Manager arrangements default to additive for older settings. Optional recipient allocations preserve the exact fixed fee, GMV share, and additive/minimum mode for each tenant-scoped owner, admin, or manager profile. Aggregate fixed and percentage fields equal the allocation totals; calculation rounds each recipient separately. One manager-paid date settles the whole invoice allocation set, so record it only after all recipients have been paid. Client PDFs show the full client fee without internal pay recipients or compensation.
