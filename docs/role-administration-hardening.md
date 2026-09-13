# Role administration boundary

Role creation, editing, and deletion previously trusted the configurable team:configure capability alone. The API now also requires a nonempty tenant and an owner/admin role, and rejects impersonated scopes. Custom-role grants cannot turn a manager or other scoped member into a role administrator. Existing capability checks remain required for owners/admins.

Permission-matrix reads now fetch only permission rows belonging to roles selected from the caller's tenant. Role or membership read failures return an error rather than an incomplete matrix. Deleting a role fails closed when its membership count cannot be verified.

Tests execute the actual TypeScript route handlers and cover non-admin configure grants, missing tenant, view-as, capability denial, legitimate owner/admin edits, foreign role targets, tenant-filtered queries, and failed membership counts. Full local regression tests, type check, and hardening lint are required before release. No live role changes are used for verification.

This is the first permissions-foundation batch, not full custom-role support. Follow-up work includes atomic permission replacement and role duplication, delete/assignment race protection, custom-role assignment and scope semantics, direct database access policies, financial action permissions, and export/shared-link boundaries. No team member is reassigned by this change.
