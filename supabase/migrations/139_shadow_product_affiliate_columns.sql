-- 139_shadow_product_affiliate_columns.sql
--
-- Rename the refund columns to say what they actually are, and add the
-- AFFILIATE counterparts of the columns that were mistakenly read from the
-- all-channel block.
--
-- The first shadow run put total_performance.refunds into a column named
-- `refunds` and diffed it against the manual export's `refunds`. Different
-- quantities: the API figure is ALL-CHANNEL ($5,954.57 for jiyu 2026-07-24),
-- the export's is AFFILIATE-attributed ($1,220.03). Only 5 of 12 products
-- "agreed", and that was coincidence on low-volume rows.
--
-- Same mistake on orders and items: read from total_performance, so the run
-- reported 1,032 orders against the export's 568 and 1,057 items against 579.
-- affiliate_total_performance carries attributed_orders / attributed_sold_items
-- / attributed_sku_orders / product_impressions / product_clicks / ctr / aov /
-- estimated_customers, which are the right sources.
--
-- ⚠️ affiliate_total_performance has NO REFUND FIELD. Full key set:
-- attributed_gmv, attributed_orders, attributed_sku_orders,
-- attributed_sold_items, product_impressions, unique_product_impressions,
-- product_clicks, unique_clicks, ctr, unique_ctr, aov, add_cart_count,
-- add_cart_users, add_cart_rate, unique_atc_rate, click_order_rate,
-- unique_click_order_rate, estimated_customers, avg_daily_creator_posted_content.
--
-- So AFFILIATE REFUNDS HAVE NO EXACT API SOURCE. The all-channel figure is kept
-- under a name that cannot be mistaken for it, and the affiliate column is
-- simply ABSENT rather than filled with something close. Owner's standing rule:
-- "I do not want estimates in my software."
ALTER TABLE public.api_shadow_product_performance
  RENAME COLUMN refunds TO refunds_all_channel;
ALTER TABLE public.api_shadow_product_performance
  RENAME COLUMN refunded_items TO refunded_items_all_channel;
ALTER TABLE public.api_shadow_product_performance
  RENAME COLUMN refund_customers TO refund_customers_all_channel;

ALTER TABLE public.api_shadow_product_performance
  ADD COLUMN IF NOT EXISTS affiliate_orders              bigint,
  ADD COLUMN IF NOT EXISTS affiliate_items_sold          bigint,
  ADD COLUMN IF NOT EXISTS affiliate_sku_orders          bigint,
  ADD COLUMN IF NOT EXISTS affiliate_impressions         bigint,
  ADD COLUMN IF NOT EXISTS affiliate_clicks              bigint,
  ADD COLUMN IF NOT EXISTS affiliate_ctr                 numeric,
  ADD COLUMN IF NOT EXISTS affiliate_aov                 numeric,
  ADD COLUMN IF NOT EXISTS affiliate_estimated_customers bigint;
