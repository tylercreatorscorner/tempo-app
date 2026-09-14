# TikTok integration test environment

Verified September 14, 2026. Production application code under test: PR #153, commit ebc9cd8. No production deployment or production migration has been performed.

## Environment

- App: http://localhost:3110/samples, full Next.js app running locally.
- Database: existing Supabase preview `otwssgedcnxamcglqpnn` (`bondie-discord-pilot`), separate from production `elrsgxlyejlkzjcnhmak`.
- TikTok tests use their own tenant (`tiktok-api-replay-test`), owner account and brand (`jiyu-api-test`). Existing Discord rows/configuration are not reused or changed.
- The shared branch was previously recovered from a failed automatic migration replay with a schema-only import. Its stale MIGRATIONS_FAILED orchestration status does not describe the running database. Do not reset, rebase or merge this shared test branch into production.
- The real content-inventory migration was applied to this preview. RLS is enabled, anon/authenticated direct access is denied, service writes succeed.
- No additional paid branch was created. The existing branch remains on its previously approved billing schedule.

## Isolation and test inputs

Preview database credentials are copied selectively from the existing preview configuration into ignored local files. Production credentials, Discord bot tokens, delivery credentials and actual TikTok OAuth tokens are not copied.

The test seller connection contains encrypted dummy tokens, a dummy shop cipher and dummy app credentials. A launcher-only Node preload intercepts TikTok fetches with historical responses. It rejects token-refresh hosts, mutation paths, production database fetches and other external fetch destinations. This is a test transport, not an operating-system firewall. The preload is never imported by application code.

Use `localhost` for this app and `127.0.0.1` for the Discord pilot: browser cookies do not distinguish ports. The two apps use the same preview Supabase project, so using the same hostname would share their login cookie.

Ignored `.env.tiktok-replay-captures.json` and `.env.tiktok-replay-extra.json` hold saved JiYu responses read from production's existing capture table, without reading the connections table. Inputs keep capture IDs, request windows, versions and pagination tokens. They are not committed or published.

Historical sources:
- Product 202605: run ef8bfe64-9c80-44e1-bdff-c74001219150, six pages, 12 products, complete July 24 capture.
- Video 202605: run eb96718b-ca7d-429a-824e-45135db2d0a7, 200 pages, 400 of 12,539 videos, incomplete.
- Sample search 202508: first three pages of run 41fa656d-4aa8-4d44-8b5c-5433b5b5c36c, captured July 31. Historical total_count is 9,999, not a current count or a complete locally stored sample inventory.
- One saved open-collaboration page and one video detail response support additional targeted checks. No sample-fulfillment capture is available.

The replay returns original short pages even though the new importer requests larger pages. This exercises continuation handling; it does not establish live page-size behavior. Uncaptured sample filters and fulfillment calls return explicit errors rather than fabricated results.

## Verified results

`node scripts/previews/test-tiktok-replay.mjs` exercised actual Next.js routes, Supabase Auth, PostgREST, the migration, the TikTok client and the importer. Test run d9e22549-9345-46c5-86d4-040a3cff5119:

- Normal owner login, sample response, pagination, 30% commission display and no-store headers passed.
- Anonymous requests, foreign-workspace brand access, malformed application IDs and direct authenticated inventory-table reads were denied.
- All 400 saved videos persisted, including 16 zero-GMV videos and 36 zero-view videos. Stable creator IDs exist on 399; missing metadata remains missing.
- The 200-page historical cap was correctly recorded as failed/incomplete, never as a full daily inventory.
- All 12 products persisted: Affiliate GMV 22,436.68; affiliate video GMV 20,329.04; affiliate LIVE GMV 1,622.03; units 579; sum of per-product affiliate orders 568.
- Affiliate video GMV and unresolved timestamp zones remain null in video inventory.
- Historical sample requests rendered in the actual Samples page in the browser.

`node scripts/previews/test-tiktok-replay-guard.mjs` checks blocked production fetches, token refresh, mutation paths and missing capture behavior without making those external requests.

## Run and resume

From this worktree:

```powershell
node scripts/previews/start-tiktok-replay.mjs
node scripts/previews/open-tiktok-replay.mjs
node scripts/previews/test-tiktok-replay.mjs
node scripts/previews/test-tiktok-replay-guard.mjs
```

Open the one-use localhost sign-in URL printed by the sign-in helper, then navigate to http://localhost:3110/samples. The app's existing confirmation/dashboard redirect can land on Login; direct navigation to Samples after confirmation retains the verified session. No email is sent. Do not share the handoff URL or ignored environment files. The server stops when its process or this computer stops.

`setup-tiktok-replay.mjs` is provisioning, not the startup command. It refuses to overwrite an existing `.env.local`; use saved runtime identifiers to recover a partial setup. All seed records belong to the TikTok test workspace.

## Remaining validation

This proves stored-response behavior, database writes and access boundaries. It does not prove current TikTok permissions, live rate limits, full daily video inventory, current sample filters/fulfillment responses, token refresh, creator-day Affiliate GMV parity or billing attribution. CSV reporting remains the production source.

TikTok's Partner Center exposes Development Shops. Core-function shops cover products, orders and fulfillment without real business information or cards; finance/settlement APIs are unavailable. Full-function shops require additional KYC and setup. Neither recreates JiYu's historical affiliate activity. No TikTok test shop was created and no live authorization was changed. See the [official authorization guide](https://partner.tiktokshop.com/docv2/page/authorization-guide-202309).
