# Coaching workspace design preview

The /reporting/coaching route is an owner/admin-only design review under the existing Reporting guard. It uses fictional creator fixtures, no database reads/writes, no messages and no persisted assignments. The banner states this prominently. It is not ready for production release.

Run `node scripts/preview-coaching.mjs` and serve `.design-preview` to review locally without credentials. The standalone shell approximates app typography; the hosted route uses the real PageHeader and tokens.

Includes coach/cohort filtering, searchable progress table, creator next steps and evidence context, local completion state, weekly review notes and sample handoff. Mobile uses stacked labeled creator cards. Performance dates and action dates are distinguished.

Validated: TypeScript, focused lint, browser coach filtering ($465/12 posts for Macy), creator search/clear, expanded detail, task completion reflected in weekly review (2/3), mobile390 without page overflow. No real creator or team records changed.

Next milestone: persisted brand/coach assignments, dated cohort membership, evidence-linked tasks and immutable weekly review snapshots. Confirm available sources before claiming check-ins or first sales. Existing data/model assessment is in the private context/coaching-reporting-direction.md document.

## Weekly accountability iteration
User specified Alicia, Brenna, Hunter as coaches; feedback, calls, and Looms as responsibilities; Victoria reviews submissions. Weekly review now has per-coach drafts, completion checks with notes/evidence, summary and blockers, explicit submission, reviewer approval/change request, resubmission versions, and prior-week sample history. Submitted content is read-only. Drafts/history stay while navigating views but reset on reload. All actions remain in-memory simulation, with no actual notification or storage. Responsibility categories are examples, not approved quotas.

Verified browser flow: missing summary rejected; incomplete work accepted with explanation; Victoria change request; resubmission; original version unchanged; historical week read-only; mobile390 no page overflow. TypeScript and focused lint pass. Next: persist the model with tenant/brand scope, coach assignments, authenticated review actors, transactional submission/versioning, and server-side review permissions before a real-team pilot.

## Persistent accountability milestone (September 26)

The hosted `/reporting/coaching` route now uses real weekly records via `/api/coaching`. The original local design fixture remains available via `scripts/preview-coaching.mjs`; its overview and creator-follow-up sample data are not mounted in the live route.

Owners/admins assign actual coach/reviewer accounts to a brand. Both accounts need existing brand and Reporting access. Coaches alone save/submit their drafts; assigned reviewers or owner/admins can review another coach's submitted report. Draft content is not returned to reviewers. No identity matching by name, no assignments seeded, and no SMS/Discord sends.

Every submit writes an immutable version and every review is append-only. Optimistic versions reject stale writes; all changes run in one transaction. Prior weeks are selected by Monday date. Browser clients have no direct database grants; APIs enforce authenticated scope and database functions recheck actor, current permission and brand access.

Local PostgreSQL tests cover role/tenant/brand denial, stale edits, valid/invalid submissions, self-review denial, requested changes, immutable revisions, prior weeks and access revocation. Production rollout requires the migration and preview verification. Real coach performance, Discord evidence ingestion, assignment editing and SMS delivery remain later work.
