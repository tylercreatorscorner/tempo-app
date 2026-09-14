# Creator design foundation

The existing creator profile metric rail uses a shared, server-compatible component. Existing metric values, cost visibility checks, actions, and navigation are preserved. The profile now includes a separately streamed history component connected to a server-authorized adapter. Its additive database migration was installed on 2026-09-14. Application release status is tracked in `product-roadmap.md`.

## Design contract

- Reuse `CreatorMetricReadout` and `CreatorPerformanceTimeline` from `src/components/creators/performance`. Their CSS module is isolated; do not copy its styles into global CSS.
- Keep clear type hierarchy, generous chart space, a fine purple GMV line, and a shallow green post strip. Preserve the regular pointer cursor and full-period hit areas.
- Hover previews a period; click pins it; leaving the chart restores the pinned period. The native selector provides keyboard and touch access, with explicit selection announcements.
- Keep zero distinct from missing data. Missing GMV breaks the line. A partial series must not be presented as a complete period total.
- Support light and dark appearance through the existing application theme. Check 320px and 390px mobile layouts, including large currency amounts, before changes ship.
- Metric labels and definitions remain authoritative. Published posts do not prove fulfillment, acceptance, or punctuality. GMV is not profit or ROI.

The approved reference archive remains in the Tempo workspace at `context/tempo-design-system`, with a manifest and hash verification script. Preserve those reference files when evolving implementation. This repository document records the implementation contract; the archive contains the full approved screens.

## Data integration boundary

Components only accept already-authorized data. They do not fetch, authorize, or join records. Use a React `key` composed of creator, authorized brand scope, and date range when mounting a timeline so a scope change resets selection. Period keys must be unique and chronologically ordered; include explicit null buckets for unavailable periods. Empty strings are reserved for the totals selector.

Keep brand-user data limited to that brand. Agency comparisons may include only explicitly authorized brands. Financial terms require their own server-side permission check before entering component props.

Historical GMV reads `creator_performance` daily records through `get_creator_performance_history`, using the existing lower-handle index. Publications come from `roster_creator_posts` and count distinct videos by latest tracked publication date within the selected window. That dataset refreshes separately from sales. The UI labels these recorded/tracked values and does not claim imports are complete. Missing days stay null; no-history and failed-read states are separate. Unknown days make their monthly total unknown rather than silently undercounting it.

The adapter checks `getCreatorReportBrands` before any history read, normalizes and deduplicates authorized creator handles, and sends explicit tenant, brand, and date filters to a service-role-only SECURITY INVOKER function. SQL independently rejects ambiguous or foreign brand slugs because publication facts lack a tenant column. Responses contain at most 366 daily rows and must exactly cover the requested calendar. Requests have a 15-second deadline. Longer than 62 days displays monthly groups, with exact partial-month dates shown on selection; up to 366 days is supported.

Read-only production verification on 2026-09-14: a creator/brand August GMV aggregate matched the existing profile RPC exactly. The final indexed GMV query over a full year used `idx_creator_perf_creator` and took 5.857ms database execution in that sample. This is not a full page load benchmark or a guarantee across tenants. The SQL migration passed PGlite isolation, role grants, deduplication, and calendar fixtures, then was applied to the live database. Live inspection confirmed SECURITY INVOKER and service-role execution only, with anonymous and authenticated execution denied.

Agreement history requires preserved effective terms, not the current retainer copied backward. Existing approximate history must remain distinguishable from exact historical records. Fixed-post packages and rolling monthly agreements need separate treatment. No agreement migration or new database query is included here.

## Local verification

Run `npm run test:creator-performance`, `npm run typecheck`, and targeted ESLint on the performance components and preview scripts. Run `npm run test:creator-report-scope` and `npm run test:finance-access` to check existing access boundaries.

`npm run test:creator-performance-history` runs adapter and SQL tests. Deploy `20260914174451_creator_performance_history.sql` before the app. It adds one read-only function and does not modify records or existing functions. If absent, the history panel reports unavailable without breaking the profile. Roll back the application first; the unused function can remain safely until a separate cleanup.

Run `npm run preview:creator-design`, then serve `.design-preview` on localhost. The build uses esbuild already installed through tsx; it adds no production dependency or public application route. Fixtures cover a full year, true zero activity, missing data, no history, one period, and large amounts. Generated output is ignored by Git.

## Integrated verification and follow-ups

Local CI and hosted release verification passed for the initial PR #154 candidate. The authenticated owner preview rendered the integrated chart, reconciled August GMV with the existing profile, and supported day selection and resetting totals with the regular cursor. A June–August range grouped into months; selecting July displayed its exact date interval and values. A read-only manager preview without access to the selected brand hid the new history panel; owner context was restored afterward.

Preview testing reproduced the previously documented brand-button navigation failure. Brand pills now use standard navigation links with `aria-current`, preserving the selected date window and allowing browser-native navigation before hydration. The final candidate must pass CI and a signed-in navigation check before release.

Verification limits: the manager preview retains the owner's database session, so it does not prove all legacy profile queries obey a real manager's RLS. Brand-portal users do not use this workspace route. Current workspace roles all receive creator-cost visibility; a denied-cost fixture does not represent an existing signed-in workspace role. The isolated component was checked at 320px and 390px, but browser viewport overrides did not take effect on the integrated preview, so integrated mobile verification remains outstanding.

The preview initially encountered a database statement timeout and loaded after a full reload. Existing profile reads still need latency investigation; a fast new history aggregate does not establish a fast whole page. The existing profile also labels active-video counts as published posts in several places. Preserve the new panel's explicit tracked-publication definition and reconcile the legacy labels before the broader profile redesign. Do not compare these counts as identical metrics.

Supabase advisors still report pre-existing database warnings. The checks above establish the new function's boundary, not a clean repository-wide or database-wide security audit.
