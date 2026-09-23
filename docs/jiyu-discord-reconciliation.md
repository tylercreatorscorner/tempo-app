# JiYu Discord role reconciliation

Read-only operator pilot at `/roster/discord-sync?brand=jiyu`, linked from the JiYu roster's tag controls.

## Scope
- Authenticated, configured owner/admin operator only; requires roster read access and the existing operations access gate (full brand scope, exact tenant/user, no impersonation).
- Compares the normalized Elite tag on active JiYu roster records with the exact Discord Elites role. Elites Manager is excluded.
- Resolves all saved Discord ID fields and the tenant-scoped canonical creator record. Conflicts and duplicate claims anywhere in the active brand roster prevent a lookup from being treated as actionable.
- Unknown/failed Discord responses never mean a role was removed. Individual reads are sequential; bounded retries honor Discord retry_after and stop at the request deadline.
- This is not a two-way inventory: the existing bot receives 403 from List Guild Members. Discord-only Elite members cannot yet be identified. The UI states this limitation.
- No POST/PATCH/DELETE route, bot membership write, automatic worker, migration or outbound message is included.

## Validation
TypeScript, focused ESLint, tag regressions and mocked reconciliation tests pass. Coverage includes missing/conflicting/duplicate IDs, exact pilot access, tenant/brand/archive constraints, Discord 403/404/429 behavior, successful retry after rate limiting, and read-only transport.

Hosted signed-in checks verified search, clear, status filtering and mobile at 390px without horizontal overflow. Initial live check exposed Discord rate limiting, prompting the bounded sequential retry fix. Final application deployment dpl_A1JzPm9wwCVthDGA7GU8zXCNvSCQ (5d9424c) completed all ten linked lookups: five aligned, five missing the role, one missing identity, zero unavailable. No writes occurred.

## Next milestone
Obtain full member-list access before reverse inventory. Use a durable per-membership baseline, version/lease and audit trail before applying bidirectional changes. Initial reconciliation must preserve existing Discord memberships because the imported Tempo cohort is incomplete. Never map staff roles or infer identities from similar names.

Discord API reference: https://docs.discord.com/developers/resources/guild#list-guild-members
