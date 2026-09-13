# Profile and reporting access hardening

Profile mutations now require the existing server actions. Browser database roles retain reads but cannot insert, update, delete, truncate, or obtain column-level write access to user_profiles. The name-edit action remains restricted to the authenticated user's name. This does not resolve the separate tenant checks needed in team-management actions or profile read policies.

Creator engagement and top-content RPC callers now verify roster permission, creator scope, and an explicit tenant-owned brand set before using service credentials. Missing authority, unavailable or truncated brand reads, and ambiguous cross-tenant slugs fail closed. Existing direct creator membership conventions are preserved; parent-only membership does not add new creator visibility.

Deploy the guarded application callers before applying restrict_creator_reporting_rpcs. That migration removes PUBLIC, anon, and authenticated execution from all overloads of the two creator RPCs and both historical Who's Cooking RPCs, preserving service-role execution. Who's Cooking already uses service credentials.

Validation: typecheck, focused authorization fixtures, the full test:ci suite, and targeted lint. The reporting fixture exercises allowed metrics and rejects unauthorized calls before RPC execution. The profile fixture exercises legitimate name edits and denies invalid or unauthorized edits. Independent investigation and final review found no confirmed surviving path in this scope. Live SQL reproduction used empty handle and brand arrays in a read-only transaction; no real data or deliveries were created.

Rollback: preserve the grant restrictions. Roll forward with corrected guarded callers if necessary; reverting to session-based reporting callers after the RPC migration would hide affected metrics.
