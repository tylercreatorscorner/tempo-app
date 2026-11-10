# Agency workspace audit

Scope: preview cleanup based on production commit 1610c0f. No live financial records were changed, invoices issued, payments recorded, or messages sent.

## Fixed
- Overview-to-Revenue handoff retains the selected month. Sidebar and client-finance links preserve month context. Overview and Clients explicitly use completed reporting months.
- All Agency pages use the Studio shell with the correct page identity. Clients become readable cards on mobile; very narrow metrics stack rather than splitting money values.
- Readiness links open client setup, unlinked brands, or revenue. Missing cohort inputs have review destinations. Empty client filters can show all clients.
- Revenue handles returning to the initial month, rapid month switches, invoice refresh failure/retry, stale data controls, and keyboard focus on the month picker.
- Client Finance has bounded requests, duplicate-action protection, preserved drafts on errors, single-fetch reload, period/client handoffs, native invoice validation and editor focus restoration. Drive references no longer offer unsupported extraction.
- Quick setup requires explicit fee values, preserving a deliberate zero separately from a blank field.
- Agency access resolves the existing server-managed leadership designation. Current CC records identify Tyler as owner and Jimmy as designated leadership. General administrators and managers are denied. Existing capability, tenant, brand scope, impersonation and write restrictions remain.

## Verification
- npm run test:ci passed.
- npm run build -- --webpack passed with existing middleware/OpenTelemetry warnings.
- Agency lint and changed shared-layout/scope lint passed.
- New navigation, revenue interaction, finance UI/request, leadership resolver/page/print and schema fixtures passed.
- Fictional browser tests: client search/clear, add/edit, automatic brand name, Save, Cancel, close, unsaved draft warning, failed save preserving input, successful retry and focus restoration.
- Revenue browser tests: historical months, calculations/inputs, invoice/collections views, retry and filtered rows.
- Finance browser tests: failed reads/retry, failed settings save/retry, read-only controls, selected client/month, invoice month/date validity, creator search and editor focus.
- Mobile checks at 390px and 320px: cards, controls, drawers, currency and horizontal overflow. The actual mobile sidebar reuses the already tested shared component and period-aware links.
- Permission tests use the actual resolver and route handlers with isolated data. Direct DB inspection was read-only and confirmed authenticated/anonymous callers lack Agency table/RPC privileges.

## Boundaries
- Financial writes were exercised only with fictional local data and mocked route requests. Issue/pay/collect actions were not performed on live accounts.
- Legacy brand-performance reports and frozen public portfolio links retain their existing recipient-access policy; they do not include internal agency fee/manager-pay books.
- The schema-only reconciliation migration records the already deployed leadership table for fresh installations. It was not applied live and contains no new designations.
- Hosted-preview sign-in and smoke verification are recorded separately after deployment.
