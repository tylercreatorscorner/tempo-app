-- Product Catalog admin (Phase 1): helper RPC for the catalog's SKU picker.
--
-- The `products` catalog table already exists (brand, product_key, display_name,
-- product_ids[], keywords[], status, tenant_id) but was never managed from the
-- app. The new /products/catalog admin manages it; this RPC lists a brand's
-- real TikTok SKUs (distinct product_id + name + all-time GMV + post count) so an
-- admin can pick which SKUs a catalog product represents — which is what later
-- turns a creator's product tag into real per-product GMV.
--
-- Applied to prod via the Supabase MCP; this file mirrors it for the repo.
create or replace function public.get_brand_product_skus(p_brand_id uuid)
returns table(product_id text, product_name text, gmv numeric, posts integer)
language sql stable security definer set search_path to 'public'
as $$
  select s.product_id,
         max(s.product_name) as product_name,
         sum(s.gmv)::numeric as gmv,
         count(distinct s.video_id)::int as posts
  from public.daily_video_product_stats s
  where s.brand_id = p_brand_id and s.product_id is not null
  group by s.product_id
  order by sum(s.gmv) desc nulls last;
$$;
