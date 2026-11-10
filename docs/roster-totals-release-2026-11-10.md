# Creator Roster scope and totals

The roster exposes Brand and Period controls above three persistent cards: current recorded monthly retainer budget, selected-period managed GMV, and unique videos published. Search, row filters, and pagination do not change the brand-level totals. The budget is current recorded commitments, not selected-period spend or payment approval.

Missing reads stay unavailable. Known partial totals retain a partial label; missing rates have an excluded-record count. Complete zero remains zero. A workspace or brand change hides stale totals and clears stale brand choices. Metadata-only brand loading is tenant/assignment scoped and independent of optional billing availability.

The new service-only `get_roster_summary_workspace` function batches managed GMV and source-day coverage. It preserves per-store membership, reporting start/archive dates, aliases, and existing monthly reporting exclusions. Its hash-join preference is function-local. Migration `20261110181348_roster_summary_workspace.sql` is applied; anonymous and authenticated execution are denied, and no business rows are changed. Videos continue to use the canonical distinct-ID publication function; the roster does not request an unused prior window.

Read-only validation on November 10:

- November 1–8 across 17 active top-level brands completed in about 4 seconds and matched the earlier scoped financial aggregate and video count.
- Full October across the same portfolio completed in about 15 seconds. Both financial and video RPCs returned successfully. Some source days and recorded rates remain incomplete; the UI labels those partials instead of claiming complete coverage.
- Lemme's November 1–8 aggregate reconciled to its preserved report totals.

Actual React controls were exercised with fictional intercepted requests at 320px, 390px, and 1440px: brand changes, period changes, search, partial and missing values, true zero, restricted costs, and responsive layout. Scoped query, retainer, brand-hook/API and SQL regressions are included in CI. Hosted signed-in browser verification remains unavailable; these checks do not claim otherwise.

Related release notes: `operations-workspace-audit-2026-11.md` and `lemme-private-revision-2026-11-10.md`. The user's production authorization covers this batch; Lemme's corrected editorial revision stays private and its issued original stays preserved.
