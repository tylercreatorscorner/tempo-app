# Creator profile history aggregation

Creator profiles downloaded every matching daily video row twice: first to discover product brands, then to calculate lifetime video counts and the earliest activity date. The representative creator had 16,989 history rows. Offset pagination repeatedly scanned earlier rows, and the two passes added network round trips.

The new `get_creator_video_history(text[])` function returns one JSON result with distinct account/brand pairs, a distinct nonempty video count, and the earliest report date. The page uses a React request-local cache to share that result between profile discovery and lifetime statistics. Revenue continues to come from the existing performance RPC, and managed contracts retain primary-brand priority.

## Access and rollout

The function is `SECURITY INVOKER`, with an empty search path. It uses the signed-in session client and the table's existing SELECT permissions and row-level policies. It does not use an administrative client or bypass RLS. An additional predicate requires the current tenant and, for manager, coach, brand, and brand_contact accounts, an explicit matching user_brand_access assignment. Unknown roles see no rows. Owner, admin, and viewer retain their existing full-tenant scope.

The migration grants function execution to `authenticated` and `service_role`, and excludes `PUBLIC` and `anon`. Underlying table access remains required. It changes no business records, existing policies, tables, or indexes.

Production application rollout requires this additive migration first. The user approved execution only for designated client/brand history. The explicit assignment predicate was added after discovering the existing brand_contact policy could be broader. Automatic approval review rejected the revised migration because owner/admin/viewer still retain full-tenant access. The function has not been applied. Obtain explicit approval for that existing full-tenant role exception, apply it, align the local migration filename with recorded remote history, and verify the live function before merging the application change. Rolling back the application can safely leave the unused function in place.

## Verification

- Type check, hardening lint, and the complete offline regression suite passed locally.
- PGlite executes the actual migration against more than 1,000 fixture rows. Results match the previous aggregation semantics, including duplicate videos, empty/null IDs, multiple handles, earliest dates, and no-history cases.
- Explicit assignment tests cover manager, coach, brand, and brand_contact accounts, an unassigned brand on a known handle, assignments from another tenant, and unknown roles. Tenant RLS excludes a different tenant's rows with the same handle. Anonymous execution is denied, and the function is confirmed to be an invoker.
- The actual TypeScript profile and lifetime helpers are exercised with the SQL aggregate. The fixture rejects raw-history downloads, confirms one request-cached aggregate, verifies contract/revenue preservation, and checks query errors are surfaced.
- The request cache is simulated in the fixture; production React request isolation is not an integration test in this script.

Read-only live query-plan measurements before implementation: the final history page returned 989 rows after scanning 16,989 rows in approximately 2.42 seconds. A single equivalent aggregate took approximately 2.61 seconds under the same authenticated RLS. This removes repeated pagination work; these database timings are not an end-to-end page latency claim. Live page verification remains pending deployment.

