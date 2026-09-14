# Creator design foundation

This batch extracts the existing creator profile metric rail into a shared, server-compatible component. Existing values, cost visibility checks, requests, actions, and navigation are preserved. A reusable interactive timeline is included, but is only connected to fictional fixtures in the local preview. It is not yet connected to production history.

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

Do not synthesize historical GMV from tracked video rows: that source covers only part of sales. Do not equate video activity with publication counts. The next integration needs an authorized historical adapter with verified aggregation and date boundaries.

Agreement history requires preserved effective terms, not the current retainer copied backward. Existing approximate history must remain distinguishable from exact historical records. Fixed-post packages and rolling monthly agreements need separate treatment. No agreement migration or new database query is included here.

## Local verification

Run `npm run test:creator-performance`, `npm run typecheck`, and targeted ESLint on the performance components and preview scripts. Run `npm run test:creator-report-scope` and `npm run test:finance-access` to check existing access boundaries.

Run `npm run preview:creator-design`, then serve `.design-preview` on localhost. The build uses esbuild already installed through tsx; it adds no production dependency or public application route. Fixtures cover a full year, true zero activity, missing data, no history, one period, and large amounts. Generated output is ignored by Git.

Before production rollout, verify the integrated profile with authenticated brand and agency accounts and cost visibility both enabled and denied. The isolated preview proves component rendering and interaction, not a complete live-profile release.
