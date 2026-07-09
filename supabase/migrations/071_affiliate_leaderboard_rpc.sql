-- Cross-brand creator leaderboard ("Top Agency Affiliates"). Applied to prod via
-- the Supabase MCP; mirrored here. Ranks ALL affiliates (managed + unmanaged) by
-- total GMV across the agency's brands in a period, with a Brand Overlap count
-- (# distinct UMBRELLA brands with GMV > 0) + a per-brand breakdown.
--
-- Reads the pg_cron roster_creator_daily rollup (migration 059 — all ~270k
-- affiliate handles), index-served via idx_rcd_brand_date (~1.6s top-100/30d), NOT
-- a fact-table scan. Dedups a person's handles to one row via
-- tiktok_accounts.creator_id, joining on the pre-lowercased handle + a distinct-on
-- acct CTE — never a regexp expression (the 83s incident). Unmanaged handles key
-- on 'h:'||handle. Overlap uses `filter (where gmv > 0)` because creator_performance
-- carries refund-net $0 brand rows that would otherwise inflate the count.
--
-- p_brand_slugs: DATA-STORE slugs, umbrella-expanded by the caller. NULL = all,
-- [] = empty (fail-closed for scoped managers).
create or replace function public.get_affiliate_leaderboard(
  p_start_date  date,
  p_end_date    date,
  p_brand_slugs text[] default null,
  p_limit       int    default 100
)
returns table(identity text, top_handle text, creator_id uuid,
              agency_gmv numeric, brand_overlap int, breakdown jsonb)
language sql stable security definer set search_path to 'public' as $$
  with umbrella as (
    select b.slug as store_slug,
           coalesce(parent.slug, b.slug) as u_slug,
           coalesce(parent.name, b.name) as u_name
    from public.brands_v2 b
    left join public.brands_v2 parent on parent.id = b.parent_brand_id
  ),
  acct as (
    select distinct on (lower(ta.tiktok_username))
           lower(ta.tiktok_username) as handle, ta.creator_id
    from public.tiktok_accounts ta
    where ta.tiktok_username is not null and ta.creator_id is not null
    order by lower(ta.tiktok_username), ta.is_primary desc nulls last, ta.creator_id
  ),
  per_ident_brand as (
    select coalesce(a.creator_id::text, 'h:' || rcd.handle) as identity,
           a.creator_id::text as creator_id_text,
           u.u_name,
           min(rcd.handle) as top_handle,
           sum(rcd.gmv) as gmv
    from public.roster_creator_daily rcd
    join umbrella u on u.store_slug = rcd.brand_slug
    left join acct a on a.handle = rcd.handle
    where rcd.stat_date between p_start_date and p_end_date
      and (p_brand_slugs is null or rcd.brand_slug = any(p_brand_slugs))
    group by 1, 2, 3
  )
  select identity,
         (array_agg(top_handle order by gmv desc))[1] as top_handle,
         max(creator_id_text)::uuid as creator_id,
         sum(gmv)::numeric as agency_gmv,
         count(*) filter (where gmv > 0)::int as brand_overlap,
         jsonb_agg(jsonb_build_object('brand', u_name, 'gmv', round(gmv))
                   order by gmv desc) filter (where gmv > 0) as breakdown
  from per_ident_brand
  group by identity
  having sum(gmv) > 0
  order by sum(gmv) desc
  limit p_limit;
$$;

grant execute on function public.get_affiliate_leaderboard(date, date, text[], int) to anon, authenticated, service_role;
