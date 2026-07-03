-- get_managed_gmv: canonical "managed GMV" computed entirely in Postgres.
--
-- Replaces the app-side approach in src/lib/data/managed-gmv.ts that pulled
-- managed_creators + tiktok_accounts + up to ~144k creator_performance rows into
-- Node and joined/deduped in JS. That approach also tripped PostgREST's default
-- 1000-row cap on the two table reads (managed_creators ~1.3k, tiktok_accounts
-- ~1.4k for managed creators), silently dropping handles and UNDER-counting
-- managed GMV (e.g. Lemme/June read $65,728.62 instead of the correct
-- $66,030.85 — two dropped handles). RPC results are not subject to the cap.
--
-- Definition (must match the old JS exactly so numbers tie out):
--   managed = a handle on a non-archived managed_creators row whose brand,
--   expanded through any umbrella to its data stores, matches the store the GMV
--   was earned on. Handles come from tiktok_accounts (canonical); the legacy
--   account_1..5 columns are a fallback ONLY for rows with no tiktok_accounts
--   link. GMV is deduped per (handle, store).
--
-- Returns one row per (store, normalized handle) with GMV > 0 — a few hundred
-- rows even for all brands. p_brands = NULL means all active data stores;
-- otherwise restrict to those store slugs (fail-open to all only on NULL).
create or replace function public.get_managed_gmv(
  p_start date,
  p_end date,
  p_brands text[] default null
)
returns table(store_slug text, handle text, raw_name text, gmv numeric)
language sql
stable
security definer
set search_path = public
as $$
  with active_stores as (
    select slug from brands_v2
    where not is_archived and not is_umbrella
      and (p_brands is null or slug = any(p_brands))
  ),
  brand_expand as (
    -- umbrella slug -> each child store slug; a plain store slug -> itself
    select b.slug as src, case when b.is_umbrella then c.slug else b.slug end as store
    from brands_v2 b
    left join brands_v2 c on b.is_umbrella and c.parent_brand_id = b.id and not c.is_archived
  ),
  -- canonical handles from tiktok_accounts
  ta_h as (
    select distinct mc.brand as src, lower(btrim(regexp_replace(ta.tiktok_username,'^@',''))) as handle
    from managed_creators mc
    join tiktok_accounts ta on ta.creator_id = mc.creator_id
    where mc.archived_at is null and mc.brand is not null
      and ta.tiktok_username is not null and btrim(ta.tiktok_username) <> ''
  ),
  -- legacy account handles ONLY for managed rows lacking any tiktok_accounts link
  legacy_h as (
    select distinct mc.brand as src, lower(btrim(regexp_replace(a,'^@',''))) as handle
    from managed_creators mc
    cross join lateral unnest(array[mc.account_1,mc.account_2,mc.account_3,mc.account_4,mc.account_5]) as a
    where mc.archived_at is null and mc.brand is not null
      and a is not null and btrim(a) <> ''
      and not exists (select 1 from tiktok_accounts ta where ta.creator_id = mc.creator_id)
  ),
  managed_lookup as (
    select distinct sh.handle, be.store
    from (select * from ta_h union select * from legacy_h) sh
    join brand_expand be on be.src = sh.src
    where be.store in (select slug from active_stores)
  )
  select cp.brand as store_slug,
         ml.handle,
         min(cp.creator_name) as raw_name,
         sum(cp.gmv)::numeric as gmv
  from creator_performance cp
  join managed_lookup ml
    on ml.store = cp.brand
   and ml.handle = lower(btrim(regexp_replace(cp.creator_name,'^@','')))
  where cp.period_type = 'daily'
    and cp.report_date between p_start and p_end
    and cp.brand in (select slug from active_stores)
  group by cp.brand, ml.handle;
$$;
