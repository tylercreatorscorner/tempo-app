# Background execution authority

Automation dispatch previously resolved arbitrary integration IDs with server credentials. Cron lacked an execution owner, manual runs could reference foreign automations, and Discord could send to unrelated channels through the shared bot. Broadcast delivery rechecked consent but not current sender authority, and consent read failures allowed delivery.

The shared dispatcher now resolves current user permissions, tenant and brand before promoting integrations or executing handlers. Automation routes apply read/write and tenant checks; saves record the execution owner. Discord guild ownership is checked against tenant-owned brands and channel membership is checked before sending. Integration lists/channel pickers are scoped, including legacy session records. Slack OAuth rechecks current configuration permission, user, tenant and brand at both start and callback.

Broadcasts record a stable execution identity while retaining the readable creator email. Historical email-only jobs resolve within the tenant. New identities survive account deletion as identifiers, so a replacement account cannot inherit a job through email fallback. Delivery requires current messages permission, creator ownership and consent. Legacy recipients without a stable creator ID are explicitly blocked rather than guessed from contact details.

The migration adds execution identity columns and closes direct client access to automation/integration/broadcast tables, including column grants. Server routes already own these reads and writes. Live preflight found one manual automation, zero enabled cron automations and no active broadcasts. No existing job was reassigned and no external message was sent during testing.

Validation: typecheck, affected-file lint, full isolated release tests and real PostgreSQL migration fixtures pass. The tests cover foreign and revoked scopes, legacy integration promotion, schedule ownership, Discord guild/channel restrictions, consent failures, actor deletion, Slack callback authority, cross-tenant session slug collisions and legitimate fixture deliveries. Independent review found three issues (legacy session scoping, OAuth bypass, deleted-owner email fallback); each was confirmed and corrected with tests. No multi-session concurrency or real-provider delivery testing was performed.

Changed files are the automation, integration and broadcast API routes, shared dispatcher/send helper, integration data/action helpers, background-access helper, execution-authority migration, test-background-access.mjs and package scripts.
