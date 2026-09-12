# Release checks

Use Node 24, matching the current Vercel project runtime.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run test:ci
npm run lint:hardening
```

The release workflow also runs `npm run build` with dummy service configuration.
That build verifies compilation and static generation. It is not an integration
test, and its outputs must never be deployed. A real preview or production build
must use that environment's configuration.

`test:ci` runs offline Stripe webhook, TikTok signing, token/storage foundation
and roster bulk-parser fixtures. It deliberately excludes the live TikTok probe.
The Stripe regression executes the actual route with the installed Stripe
signature verifier and an isolated database double.

`lint:hardening` covers the hardened Stripe entry point and its regression test.
It is not a whole-repository lint gate. Existing lint debt must be resolved in
separate changes before enabling a clean repository-wide gate.

The workflow runs on pull requests, main/hardening branch pushes and manual
dispatch. It has read-only repository permissions, pinned action commits and no
deployment step or production secrets. Its status check is `Verify release`.
After the first successful GitHub run, require this check through branch
protection or a ruleset. Adding the workflow alone does not enforce merging rules.

Preview validation must use a separate database, Stripe test mode and test
destinations. Verify isolation before exercising writes or external deliveries.
Record the reviewed commit, preview deployment, checks and rollback target before
promoting a production release. A passing compilation check alone is insufficient.

Action configuration follows the official [checkout](https://github.com/actions/checkout)
and [setup-node](https://github.com/actions/setup-node) documentation.
