# Atomic role administration

Role duplication and matrix replacement previously used separate database writes. A failed grant insert could leave a partial role or erase its existing grants. Role deletion checked membership separately from deletion. Permission resolution accepted explicit role IDs without confirming their tenant.

The role API now calls a service-only SECURITY INVOKER database transaction. It rechecks the actor's workspace administrator status and configuration capability, locks the target role, preserves default roles, and handles clone, replacement and unassigned deletion atomically. Unknown or malformed grants are rejected; duplicate valid grants are deduplicated. Role resolution verifies tenant ownership for both explicit IDs and legacy key fallback. The editor reports Saved only after a successful reload and prevents changing the selected role during a save.

Changed paths: src/app/api/roles/route.ts, src/lib/auth/workspace-scope.ts, src/components/team/roles-matrix.tsx, the atomic_custom_roles migration, scripts/test-role-transactions.mjs, scripts/test-role-administration.mjs and package.json.

Validation: typecheck and lint passed. PGlite executes the actual migration against isolated fixtures. Failed replacement rolls back both name and grants; failed copying rolls back the new role. Tests cover malformed grants, duplicate grants, empty matrices, default roles, assigned-role deletion, foreign actors/roles and client execution denial. Real TypeScript route and resolver tests cover authorization and tenant-owned fallback. Existing CI suites passed locally, with esbuild-dependent checks rerun outside the restrictive subprocess sandbox.

No production account assignments or role grants are changed by this migration. Production verification uses catalog checks and existing read-only screens; mutation testing uses fixtures. Concurrent multi-connection stress testing is not included. Custom-role assignment UI is a separate follow-up.

Database function semantics follow the current [Supabase function guidance](https://supabase.com/docs/guides/database/functions).
