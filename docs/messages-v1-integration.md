# Messages V1 integration

Integrates the existing bondie-discord-pilot operations workspace without copying its authentication, database replacement, cron configuration, or unfinished send endpoint.

## Included
- Next 10 review queue with reply, decision, team, context and older-work lanes.
- Discord conversation history, supported evidence, drafts, notes and follow-ups.
- Community drafts and planning. Planning and manual published acknowledgments do not schedule or send messages.
- Existing Broadcasts / Inbox / Templates remain accessible and remain the default for unconfigured users.
- Direct Discord sending is absent from V1. Copy and Open Discord provide the manual handoff.

## Access and data
Tempo authenticates each request. Access requires the configured Tempo tenant, exact operator user ID, owner/admin role, full brand scope and messages permissions. Impersonation is denied. The source database stays isolated. The approved mapping points only to otwssgedcnxamcglqpnn and source tenant ed1b9fdf-f6cb-414e-8d84-b4272e431181. Audit events keep the actual Tempo user ID. Brand-restricted users cannot enter this cross-brand operator workspace.

The existing collector keeps running in its existing deployment. No new cron is installed. Manual refresh uses its source operator and brand leases. Source dates and scan limits must remain visible; drafts need human review. Team owner labels do not grant access or notify teammates.

## Preview activation
Scope all configuration to preview branch feat/creator-groups, not production or other branches:
- COMMUNITY_OPS_DATABASE_URL and COMMUNITY_OPS_DATABASE_KEY: existing isolated Supabase server connection.
- COMMUNITY_OPS_SOURCE_TENANT_ID: existing source tenant.
- COMMUNITY_OPS_TEMPO_TENANT_ID and COMMUNITY_OPS_TEMPO_USER_IDS: Creators Corner and the verified Tempo owner only.
- DISCORD_TICKET_OPERATOR_ID / DISCORD_TICKET_PILOT_USER_IDS: existing isolated collector identity.
- DISCORD_TICKET_BOT_TOKEN: existing Discord bot, for authorized reads and refresh; no send route.
- DISCORD_TICKET_OPENAI_API_KEY / DISCORD_TICKET_OPENAI_MODEL: existing draft preparation.
- COMMUNITY_OPS_METRICS_URL / COMMUNITY_OPS_METRICS_TOKEN: existing read-only production metric exporter.

No credential values belong in source control, logs, browser props or NEXT_PUBLIC variables. The user explicitly approved transfer of the existing credentials into persistent encrypted Vercel settings for this preview branch. Configuration was uploaded on September 22, 2026 and deployment dpl_Eo3Bc58fmdqMve5vDAtWa1MpMnHR reached Ready. Production settings were not changed.

## Validation
TypeScript and focused lint pass. Automated tests exercise exact identity/tenant, capabilities, impersonation, scoped-brand denial, isolated database guard, audit actor preservation, origin checks and imported daily queue regression cases. Hosted signed-in verification confirmed the LeeFar queue, Discord conversation reader, ten saved community drafts, workflow settings, and the unsaved-settings discard guard. Mobile community layout at 390px has no horizontal page overflow. Existing collector scan timestamps are current across seven configured brands, with no recorded scan errors. Mocked review-route tests cover successful persistence, missing channels, stale edits, concurrent updates, origin rejection and operator denial. No live review records were changed during verification. Production remains unchanged.
