# Finance tenant and action boundaries

The prior invoice action guard accepted a read-only finance user and an invoice ID belonging to another brand/workspace. Finance visibility was being treated as write authority, and full-workspace roles could issue unbounded privileged invoice/payment queries. Live schema inspection confirmed invoices and payment_audit_log lack tenant_id columns, while team_members and brand_compensation have them.

The shared finance access resolver requires the specific earnings/invoicing/payments capability, a valid tenant, the existing finance flag, and no impersonation for mutations. It resolves tenant-owned and assigned brands, including historical brands, and rejects ambiguous cross-tenant slug ownership or incomplete reads. Existing administrator-only operations retain that requirement. Invoice queries and subsequent writes use the approved brands; mixed-brand bulk requests reject before writing. Earnings and compensation resolve payees within the tenant and use explicit brand filters.

Valid public bearer links remain supported. Public JSON and page props exclude internal reconciliation notes; the API uses a client-facing field allowlist. A child-only store assignment stays a child in earnings output, preventing whole-umbrella invoice/ledger enrichment. Historical invoices remain available, while archived brands stay out of the active retainer book.

## Verification

- Type check and hardening lint pass.
- The full local regression suite passed before the final review adjustments; focused tests pass after those adjustments. CI repeats the full suite and production compilation for the final candidate.
- `node scripts/test-finance-access.mjs --reproduce` executes the immutable 6c92df0 baseline with isolated fixtures: the original guard authorizes a foreign invoice for a read-only user; the candidate rejects it.
- Tests execute real route handlers and helpers for capabilities, foreign and unassigned brands, empty/missing scope, ambiguous slugs, truncated/error reads, view-as, bulk rejection, own invoice edits, scoped history/lists, payee ownership, own-tenant default payee, invoice/ledger generation, child-only earnings, public field limits, and revoked tokens.
- A fresh investigator traced the boundary before changes. One fresh final review found public-note exposure, umbrella enrichment, and archived-retainer regression; all three were confirmed and corrected with regression coverage.
- Read-only live compatibility check found 32 workspace brand rows, no ambiguous owned slugs, and two active workspace payees. Live role/account assignments and financial records were not modified for tests. Outbound delivery is blocked/mocked in fixtures.

## Limits and continuation

This closes the inspected staff finance entry points and public invoice JSON/page-prop exposure. It is not a claim that all Tempo permissions are finished. Direct database policies, custom-role transactions/assignment, invitations/brand access, other exports/shared links and background jobs remain in the authorized work queue. Actual emails and payments are not sent to validate this patch. Financial facts still use legacy slug ownership; a future tenant-ID migration should enforce durable ownership in the database rather than relying on unique registry resolution at request time.
