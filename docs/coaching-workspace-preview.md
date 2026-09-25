# Coaching workspace design preview

The /reporting/coaching route is an owner/admin-only design review under the existing Reporting guard. It uses fictional creator fixtures, no database reads/writes, no messages and no persisted assignments. The banner states this prominently. It is not ready for production release.

Run `node scripts/preview-coaching.mjs` and serve `.design-preview` to review locally without credentials. The standalone shell approximates app typography; the hosted route uses the real PageHeader and tokens.

Includes coach/cohort filtering, searchable progress table, creator next steps and evidence context, local completion state, weekly review notes and sample handoff. Mobile uses stacked labeled creator cards. Performance dates and action dates are distinguished.

Validated: TypeScript, focused lint, browser coach filtering ($465/12 posts for Macy), creator search/clear, expanded detail, task completion reflected in weekly review (2/3), mobile390 without page overflow. No real creator or team records changed.

Next milestone: persisted brand/coach assignments, dated cohort membership, evidence-linked tasks and immutable weekly review snapshots. Confirm available sources before claiming check-ins or first sales. Existing data/model assessment is in the private context/coaching-reporting-direction.md document.

## Weekly accountability iteration
User specified Alicia, Brenna, Hunter as coaches; feedback, calls, and Looms as responsibilities; Victoria reviews submissions. Weekly review now has per-coach drafts, completion checks with notes/evidence, summary and blockers, explicit submission, reviewer approval/change request, resubmission versions, and prior-week sample history. Submitted content is read-only. Drafts/history stay while navigating views but reset on reload. All actions remain in-memory simulation, with no actual notification or storage. Responsibility categories are examples, not approved quotas.

Verified browser flow: missing summary rejected; incomplete work accepted with explanation; Victoria change request; resubmission; original version unchanged; historical week read-only; mobile390 no page overflow. TypeScript and focused lint pass. Next: persist the model with tenant/brand scope, coach assignments, authenticated review actors, transactional submission/versioning, and server-side review permissions before a real-team pilot.
