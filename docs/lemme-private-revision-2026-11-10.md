# Lemme private corrected revision — November 1–8, 2026

Preview only. The corrected copy is an authenticated editorial draft, not a replacement publication or a new client bearer link. Do not publish the raw snapshot, recovery evidence, or internal audit notes.

## Identity and preservation

| Record | Value |
| --- | --- |
| Original report | `668b4a03-45bd-4c8d-ac55-05e9ffdfc464` |
| Private draft | `c1064bfe-86a9-4983-ad9c-42d5d373c59d` |
| Private preview path | `/reporting/revisions/c1064bfe-86a9-4983-ad9c-42d5d373c59d` |
| Draft created | November 10, 2026, 16:19:46.485 UTC |
| Preserved source content hash | `24841f6bf993801bd77fe6872a374c32` |

A read-only database check during handoff matched that hash against the original and the draft's provenance. The checksum is PostgreSQL MD5 of the JSONB object containing original snapshot, notes, plan, token, period_start and period_end. The original remains unrevoked; its content and bearer token are unchanged. Original file/snapshot SHA-256 evidence remains in the ignored recovery artifacts.

Private storage is `client_report_revision_drafts`, introduced by migration `20261110161612_private_client_report_revision_drafts.sql`. It has no bearer-token column, no anonymous/authenticated table grants, and an immutable tenant/source/brand/type/period relationship. All pages and exports require reporting-write permission, tenant and brand access, and no impersonation. Public report history does not expose drafts.

## Corrections

**Recovered data:** complete source units now accompany the featured videos without changing their GMV, orders, titles or URLs. The managed top five have 242, 54, 45, 41 and 101 units. Product leaders are reconstructed by distinct product ID with recorded names observed on or before November 8. Product totals reconcile to $142,789.02, 5,665 orders and 5,928 units; shares continue to use the $175,592.08 whole-shop affiliate-GMV denominator. Missing/conflicting names retain an ID fallback. Supplemental legacy product data supplies names only, not sales amounts.

**Presentation/editorial corrections:** notes describe activity versus the preceding period rather than first-ever sales. The plan is proposed follow-up work, not completed actions or promised outcomes. Labels distinguish recorded rates/targets from agreements, and private pages/PDFs visibly identify the corrected preview. No agreement was manufactured or historical August term carried into November.

Headline figures remain unchanged: total affiliate GMV $175,592.08; managed GMV $40,663.81; 288 published posts; 287 creator rows. Publication evidence is preserved, not regenerated.

## Delivery and unresolved terms

There are 223 published posts across 28 retained records with positive monthly targets. Per-creator caps credit 217 toward 970 recorded targets. These are operational posting measures, not approved deliverables or payment entitlements.

Celeste Serna's relationship is **unconfirmed**. Her source record retains a $300 monthly rate, but an October 23 audit explicitly changed the target from 30 to 0; the report keeps the target unavailable. No dated cut or affiliate conversion was found. The user's suspicion of an affiliate move is not a confirmed reclassification. Do not restore 30, invent a zero rate, or imply a current contract. She remains excluded from target progress and cost comparison.

The $42,500 aggregate is recorded monthly rates **as of November 8**, including Celeste's unconfirmed $300 entry. Six rates changed during the window. It is not actual period spend, contracted budget, an invoice or an approved payout. No Lemme agreement ledgers were found; two current November operating notes corroborate existing rate/target values but do not establish payment rules. Cost/return comparisons remain unavailable without complete comparable saved agreements and qualifying delivery.

## Verification and handoff limits

Passed at handoff: private-draft schema and access suites; revision-enrichment suite; report-workspace and report-access suites; video-library UI regression; actual PDF rendering regression; final root TypeScript and lint checks. These cover negative tenant/brand/capability cases, anonymous access denial, original preservation, saved-only evidence, export routing, formula-safe CSV, unknown values, recovered arithmetic and private PDF labeling.

Authenticated CUA was unavailable. No successful hosted signed-in UI smoke is claimed. Local PDF rendering and route tests are evidence for their own scope; hosted authenticated review remains unverified. Deployment/publishing scope remains preview only; the root task owns commit and preview release.

The ignored `.design-preview/lemme-corrected-revision-manifest.json` records draft identity, notes/plan and preserved totals. Detailed recovery manifests and rendered artifacts remain under `.design-preview/`; this handoff deliberately omits the full private snapshot and raw internal notes.
