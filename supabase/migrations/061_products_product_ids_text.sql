-- Fix products.product_ids type: bigint[] -> text[].
--
-- TikTok product IDs are 19-digit strings; daily_video_product_stats.product_id
-- is already `text`, and the catalog admin reads/writes them as strings. As
-- bigint[] they'd lose precision when serialized to JSON on read (numbers beyond
-- 2^53). text[] keeps them exact and consistent with the SKU source. The catalog
-- table was effectively unused, so this is a safe in-place cast.
--
-- Applied to prod via the Supabase MCP; mirrored here.
alter table public.products
  alter column product_ids type text[] using product_ids::text[];
