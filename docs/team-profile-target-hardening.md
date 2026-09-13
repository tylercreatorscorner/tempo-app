# Team profile target hardening

Role, finance, removal and brand-assignment actions require a real owner/admin session with a tenant. They reject foreign or missing members and protect the caller and tenant owners. Profile writes repeat the tenant and original role predicates at the mutation. Role changes clear role_id so the existing permission resolver follows the newly assigned role, and coach finance remains false.

Brand replacement validates the requested tenant and every brand, then uses a service-only PostgreSQL transaction. It locks the actor, target and brands, repeats the ownership checks, and replaces access atomically. A failed insert rolls back the deletion. Apply replace_member_brand_access before deploying the new caller.

Tests run the real TypeScript actions with isolated dependencies, reproduce the prior cross-tenant role write from immutable commit 8a36dbc, and cover legitimate actions, denied targets, invalid roles, coach finance, concurrent target changes, and database failures. A pinned PGlite development dependency executes the actual migration with fixture roles/tables and verifies client-role denial, ownership checks, valid assignments, clearing, deduplication, and rollback after forced failure. No live account edits or messages are used for validation.

A fresh pre-patch investigator traced the affected callers. The final independent reviewer tool failed with a security-content flag; the parent completed a separate source review and added concurrent-target and write-failure checks. This independent-review limitation is retained explicitly.

Scope limits: existing-account invitation/upsert behavior in inviteUser and /api/clients, direct user_brand_access table policies, and broad profile reads require separate fixes. This patch closes the named team action paths, not every account-management path. Existing sessions are not globally revoked when a profile is removed; application scope resolution still requires a profile.
