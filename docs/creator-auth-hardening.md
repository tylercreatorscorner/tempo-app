# Creator token boundaries

Creator session cookies, magic login links and invitation claim links now have
separate verification entry points. Signature validity alone does not authorize
using a link as a session or redeeming a claim through the magic-link endpoint.
All new tokens carry an explicit purpose. Session generation selects identity
fields, so a caller cannot accidentally retain a link's JTI or purpose.

Existing sessions without purpose or JTI remain accepted. Existing magic links
without purpose must carry a nonempty JTI and still go through one-use redemption.
Claims have always required an explicit claim purpose and continue to use their
own recorded, atomic consumption flow. Empty emails and UUID creator IDs remain
supported. Token expiry and HS256 signature verification apply to every category.

The original issue was reproduced through the production cookie reader with real
signed claim and magic tokens before editing. The regression now rejects both,
including after redemption. Tests exercise all token types against all consumers,
wrong-purpose rejection before database access, claim previews without consumption,
duplicate redemption, legacy compatibility, malformed payloads, expiry and invalid
signatures. Cookie storage and database calls use offline substitutes.

Independent review identified a legitimate timing edge: separate signing clock
reads can make the original lifetime one second longer than its nominal value.
Verification does not impose a nominal lifetime ceiling; it enforces the signed
expiry. Fixtures preserve that legacy behavior for each category.

Outcome: fixed locally. Type checking, focused regression, the combined CI suite,
targeted lint, production compilation and whitespace checks passed. Following the
review correction, type checking, the full creator regression, lint and build were
rerun successfully. The original link-as-cookie and alternate claim-as-magic
triggers no longer reproduce; legitimate offline controls pass.

Changed source files: `src/lib/auth/creator-auth.ts`,
`src/lib/auth/creator-claim.ts`, `src/app/api/auth/creator/verify/route.ts`.
Regression coverage lives in `scripts/test-creator-token-purpose.mjs` and is wired
into `package.json` and the existing release checks.

Validation commands:

```sh
npm run typecheck
npm run test:creator-auth
npm run test:ci
npm run lint:hardening
npm run build
git diff --check
```

Builds use the dummy configuration described in release-checks.md. These checks
do not prove deployed database constraints or browser integration. Before rollout,
verify real creator login, invitation redemption, existing sessions and admin
view-as in an isolated preview. No database migration is required. Deploy all
consumer changes together; rolling back restores the token confusion defect.
