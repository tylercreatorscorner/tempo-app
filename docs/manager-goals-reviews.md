# Manager goals and reviews

Monthly managed-GMV goals are stored per workspace, brand, month and accountable manager. A proposal never changes the approved target. Approval can accept or adjust the proposal, or set a target directly. Both actions require a reason and create a revision in the same transaction. Version checks reject stale saves.

The dashboard retains selected-period portfolio metrics and adds a separate calendar-month goal column. The review screen uses full-month actuals through the latest completed UTC day. It withholds attainment for missing targets or incomplete daily coverage. Weekly commitments link to the existing weekly reporting workflow.

## Access

- Workspace reporting read permission is required. Brand/creator portal accounts are excluded by the workspace resolver.
- Reporting configure permits approval for authorized brands in the active workspace. Reporting write permits proposals only for the caller's currently assigned brands.
- Impersonation is read-only. The server derives tenant, actor and manager; request bodies cannot override them.
- Tables have RLS enabled and no client grants/policies. The service-only invoker RPC rechecks assignment, tenant and version. The event table grants no update/delete to the service role.

## Deliberate limits

These are live reviews, not finalized monthly performance snapshots. Actuals follow the existing managed-creator membership model. A goal retains its recorded manager, and reassignment blocks further changes to that goal pending a deliberate ownership workflow. Historical archived portfolios are not yet a separate reporting surface. History shows the newest 200 changes across the selected month's authorized brands. No targets are inferred or seeded.

## Verification

`npm run test:manager-goals` executes the migration in isolated PostgreSQL (PGlite) and exercises route/data authorization using fixtures. It covers tenant/brand boundaries, proposal versus approval, impersonation, stale versions, rollback, immutable events, input validation, and missing/duplicate daily coverage. Never create test goals against a live preview database.
