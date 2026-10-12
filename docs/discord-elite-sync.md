# Discord Elite membership import

`/roster/discord-sync` replaces the JiYu-only comparison with a tenant-scoped workspace for brand-owned creator cohorts. The creator roster and Coaching creator performance link to it.

## Flow

1. An owner/admin or the brand's accountable manager selects the saved server and exact `Elite`/`Elites` creator role. `Elites Manager` and managed roles cannot be selected.
2. Check Discord reads **every member page** using `DISCORD_BOT_TOKEN`. Only creator Elite members are stored. A failed, incomplete, rate-limited or oversized inventory is never saved as an empty group.
3. Exact Discord IDs are compared across the active brand roster, including canonical creator IDs. Duplicate and conflicting claims cannot be imported.
4. Import adds the canonical `elite` tag to verified matches. Other tags and existing Elite memberships are preserved. Missing Discord memberships are listed for review, not removed automatically.
5. Unmatched members can be explicitly linked to an existing creator without a Discord identity, or added to the brand roster and checked again. No fuzzy name match is applied. A reviewed identity link and every changed tag have audit records.

No Discord role assignments, invitations, channels, DMs or posts are made. Imports are manual; this is not a bidirectional or scheduled sync.

## Access and freshness

Readers require roster access and brand reach. Configure/scan/import/link require roster write plus owner/admin status or accountable-manager ownership. Coaches and managers with coaching-only brand visibility cannot write. Impersonation is denied.

The database functions repeat authorization inside the transaction. Complete scans expire after 15 minutes, require the same actor and configuration revision, and revalidate roster identity claims before updating tags. Repeating an applied run is idempotent. Tables and functions are service-only with RLS; browser roles have no direct privileges.

## Performance

LeeFar Elite partnerships retain the umbrella roster identity while querying all of its tenant-owned storefronts. An empty Elite cohort is explicitly different from zero GMV. Missing daily performance remains unavailable/partial; the importer does not create sales or posting facts.

## Validation

`npm run test:discord-cohorts` covers exact identities, pagination, staff-role exclusion, failed inventories, tenant/manager access, transactional imports and links, stale scans, duplicate claims, audit, idempotency and private grants. `npm run test:coaching` includes umbrella expansion without foreign or unrelated stores.
