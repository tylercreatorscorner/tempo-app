# Scheduled report authorization

Outcome: application fix prepared; database restriction applied and verified.

Schedules now require the current Workspace source permission (reporting or drops)
and a specific brand belonging to the same tenant. List reads are filtered; edits
check both original and proposed targets; authorized edits transfer execution
responsibility to the actor. The cron job resolves that owner's current scope and
checks it before report generation or delivery. Invalid authority advances the
failed schedule rather than sending. View-as mutations are denied.

The previous API accepted a manager's cross-tenant brand. A regression harness
reproduces this on the prior production commit and proves the corrected API denies
it. Other fixtures cover missing permissions, impersonation, invalid types, all
brands, update/delete reach, lost access at execution, and successful delivery
through an offline substitute. Umbrella/store relationships must stay in the tenant
and within the actor's scope. Duplicate slugs across tenants are denied because
legacy analytics still use a global slug registry. Independent review identified
that duplicate-slug edge and the corrected test now covers it.

Live read-only preflight found zero schedule records and no remaining UI caller.
All-brand scheduling is explicitly refused until analytics accept tenant-bound
brand lists; single-brand API behavior remains. Broader reporting endpoints are a
separate hardening task. No live schedule or external delivery was created for tests.

Database migration enables RLS and revokes all direct PUBLIC/anon/authenticated
schedule-table grants; service_role retains CRUD. This closes the Data API bypass,
including fabricated execution owners. Effective privilege queries confirm RLS
true, client access false, server access true. This service-only table intentionally
has no user policies. Do not revert its grants when rolling back application code.

Validation: npm run typecheck; npm run test:schedule-access; npm run test:ci;
npm run lint:hardening; git diff --check. Original reproduction uses
node scripts/test-schedule-access.mjs --reproduce (requires Git history).
The normal CI regression does not depend on Git history. Tests use real source and
Next request/response objects with database/delivery substitutes. GitHub release
checks additionally build the application. Real external sending was not tested.

Migration file was generated with the Supabase CLI. Production migration was
applied through the connected migration tool. This repository's historical numeric
migration files predate that tool; no bulk schema push or history repair was run.

Reference: [Supabase RLS and grants](https://supabase.com/docs/guides/database/postgres/row-level-security).
