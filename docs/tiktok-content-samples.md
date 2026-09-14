# TikTok complete content inventory and sample requests

Implemented September 14, 2026 on `feat/tiktok-content-samples`. This is a reviewable implementation, not a completed creator-GMV reconciliation or a production data migration.

## Behavior

- Every page of the 202605 shop video list is persisted to `api_shadow_content_inventory`, including zero and unknown GMV/views. Stable creator open IDs, raw timestamps and the raw video object are preserved.
- Inventory completeness is recorded separately from detailed performance coverage. Detail requests include nonselling videos, use a bounded stable-ID slice, and mark missing/capped details partial. Offset windows are within a fresh capture, not durable cross-run job cursors.
- Seller video GMV and affiliate video GMV are separate columns. Affiliate creator/video GMV remains null until validated. Legacy ambiguous GMV columns are no longer populated by new runs. Full product 202605 affiliate metrics remain the aggregate control.
- Naive video timestamps are retained verbatim without inventing UTC. Reporting dates are calendar-validated. Unknown engagement remains null; unique customer counts are not summed across videos.
- Pagination rejects missing arrays, changing totals, repeated continuation tokens, page limits, and incomplete total counts. Duplicate product/video IDs fail the snapshot.
- Settings links to `/samples`. Owner/admin users can select a workspace-owned store brand, filter requests by status/creator, page through requests, and inspect VIDEO or LIVE fulfillment content.
- Sample fields include product/SKU, commission rate, request status, approval/shipment deadlines, order/tracking number and fulfillment status. Missing fields stay unknown.
- Sample reads use the existing seller-authorized connection. No individual creator authorization, downloadable reports, request approvals/rejections, messages, or shipments are performed.
- Fulfillment counts are cumulative. Its create_time is product-link/publication timing as defined by TikTok, not necessarily original video creation time.
- The initial sample view is live and paged, not a background historical sample warehouse. Its page count is not labeled a complete content inventory.

## Verified endpoints

| Purpose | Method/path | Required scope |
|---|---|---|
| Content identity | GET /analytics/202605/shop_videos/performance | data.shop_analytics.public.read |
| Video detail | GET /analytics/202509/shop_videos/{id}/performance | data.shop_analytics.public.read |
| Product affiliate control | GET /analytics/202605/shop_products/performance | data.shop_analytics.public.read |
| Sample applications | POST /affiliate_seller/202508/sample_applications/search | seller.affiliate_collaboration.read |
| Sample fulfillment | POST /affiliate_seller/202409/sample_applications/{application_id}/fulfillments/search | seller.affiliate_collaboration.read |

Sample search maximum page size is **50**, not the video list's 100. Sixty saved sample-search capture pages already exist in Tempo; new code was verified against that observed shape and current docs. Current video 202605 metadata uses `creator.open_id` and `creator.user_name`, with the top-level username retained as fallback. A fresh live 202605 run of this implementation has not occurred.

Primary documentation:
- [Sample applications](https://partner.tiktokshop.com/docv2/page/seller-search-sample-applications-202508)
- [Sample fulfillments](https://partner.tiktokshop.com/docv2/page/seller-search-sample-applications-fulfillments-202409)
- [Sample review operations, inventoried only](https://partner.tiktokshop.com/docv2/page/seller-review-sample-applications-202507)
- [Video list](https://partner.tiktokshop.com/docv2/page/get-shop-video-performance-list-202605)

## Validation and rollout

- Targeted behavioral tests exercise the actual importer and route handlers with fixture dependencies: zero-sale content persistence, nulls, stable identity, date handling, pagination failure, partial details, write failures, read-only sample endpoints, commission scale, role/impersonation/tenant denial.
- New tests are included in Release checks. Existing offline regression suite also passed; tests requiring the TypeScript subprocess were rerun outside the restricted shell after an EPERM environment error.
- TypeScript and changed-file lint passed. Production compilation passed using CI placeholder configuration. Those outputs must not be deployed.
- The actual client component was exercised in a localhost-only fixture harness using Tempo CSS: load, next page, first-page refresh, VIDEO/LIVE fulfillment, zero sales/likes, null comments and vendor error rendering. This does not substitute for a live connected-shop acceptance test.
- The migration was tested against temporary PostgreSQL tables inside an explicit rolled-back transaction. It preserves zero/null data, enables RLS, denies anon/authenticated table access and permits service writes. No production schema was modified.
- Production security advisors were inspected. They report pre-existing unrelated table findings; this patch does not modify those tables.

Apply `20260914174142_tiktok_content_inventory.sql` before deploying the importer change. Keep CSV facts and billing as the reporting source. Run an inventory-only validation with `limit=0`, inspect `inventory_complete` and compare ID sets against the proven July 24 cohort, then run bounded detail windows. New runs do not alter historical captures.

Before promoting daily creator reporting: prove same-day Affiliate creator GMV, reconcile content-count/date exceptions, verify current zero-sales and missing-metadata cases, and run several additional days. Full durable detail job resumption, historical sample sync, manager-role sample access, approval actions, and managed-GMV invoice changes are separate follow-ups.
