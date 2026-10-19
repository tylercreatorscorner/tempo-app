-- All managed video GMV by earning dates, with an optional inclusive posting range.
-- Keep the prior RPC available until older app deployments have drained.
-- Callers supply authorized top-level brands. Never treat NULL/[] as all brands.
create or replace function public.get_creator_video_gmv_breakdown(
  p_tenant_id uuid, p_brand_slugs text[], p_start date, p_end date, p_post_start date, p_post_end date, p_offset integer, p_managed_creator_id integer
) returns jsonb language sql stable security invoker
set search_path = public, pg_temp
set plan_cache_mode = force_custom_plan
-- Measured on a full portfolio month: hash joins avoid a spill-heavy merge
-- and a misestimated nested loop across millions of daily product facts.
set enable_mergejoin = off
set enable_nestloop = off
set statement_timeout = '25s'
as $$
with brands as materialized (
  select * from public.brands_v2 where tenant_id = p_tenant_id
), selected as (
  select * from brands where slug = any(p_brand_slugs)
    and parent_brand_id is null and not coalesce(is_archived, false)
), stores as materialized (
  select b.slug, coalesce(b.display_name,b.name) name, d.id
  from selected b join brands d on
    case when b.is_umbrella and exists(select 1 from brands c where c.parent_brand_id=b.id)
      then d.parent_brand_id=b.id else d.id=b.id end
), roster as materialized (
  select mc.* from public.managed_creators mc join selected b on b.slug=mc.brand
  where mc.tenant_id=p_tenant_id and mc.employment_status='active'
    and (mc.reporting_start_date is null or mc.reporting_start_date<=p_end)
    and (mc.archived_at is null or mc.archived_at::date>p_start)
), handles as (
  select r.id,r.brand,r.creator_id,r.archived_at,r.reporting_start_date,
    lower(trim(replace(h,'@',''))) handle
  from roster r cross join lateral unnest(array[r.account_1,r.account_2,r.account_3,r.account_4,r.account_5,
    r.account_6,r.account_7,r.account_8,r.account_9,r.account_10]) h where trim(h)<>''
  union all
  select r.id,r.brand,r.creator_id,r.archived_at,r.reporting_start_date,
    lower(btrim(regexp_replace(t.tiktok_username,'^@','')))
  from roster r join public.tiktok_accounts t on t.creator_id=r.creator_id and t.tenant_id=p_tenant_id
  where btrim(t.tiktok_username)<>''
), members as materialized (
  select distinct on(brand,handle,p_start+n) brand,handle,id,p_start+n report_date
  from handles cross join generate_series(0,least(p_end-p_start,400)) n
  where (archived_at is null or p_start+n<archived_at::date)
    and (reporting_start_date is null or p_start+n>=reporting_start_date)
  order by brand,handle,p_start+n,(archived_at is null) desc,(creator_id is not null) desc,id
), facts as materialized (
  select s.slug,s.name,d.report_date,d.video_id,d.post_date,d.video_title,d.tiktok_username,coalesce(d.gmv,0) gmv,m.id
  from public.daily_video_product_stats d join stores s on s.id=d.brand_id
  join members m on m.brand=s.slug and m.report_date=d.report_date
    and m.handle=lower(trim(replace(d.tiktok_username,'@','')))
  where d.tenant_id=p_tenant_id and d.report_date between p_start and p_end
), managed as (
  -- Filter AFTER shared-handle ownership is resolved, preserving summary attribution.
  select * from facts where id=p_managed_creator_id
),
video_totals as materialized (
  select f.slug brand,min(f.name) brand_name,f.video_id,
    min(nullif(f.video_title,'')) title,min(f.tiktok_username) handle,
    min(f.post_date)::date post_date,
    min(coalesce(nullif(trim(r.real_name),''),r.account_1,'Unnamed creator')) creator,
    sum(f.gmv) gmv
  from managed f join roster r on r.id=f.id
  where (p_post_start is null and p_post_end is null) or f.post_date::date between p_post_start and p_post_end
  group by f.slug,f.video_id,case when f.video_id is null then f.tiktok_username end
), page as (
  select * from video_totals order by gmv desc,brand,video_id nulls last,handle
  limit 50 offset greatest(coalesce(p_offset,0),0)
)
select jsonb_build_object(
  'totalGmv',coalesce((select sum(gmv) from video_totals),0),
  'totalRows',(select count(*) from video_totals),
  'offset',greatest(coalesce(p_offset,0),0),
  'videos',coalesce((select jsonb_agg(jsonb_build_object(
    'videoId',video_id,'title',title,'handle',handle,'creator',creator,
    'brand',brand,'brandName',brand_name,'postDate',post_date,'gmv',gmv
  ) order by gmv desc,brand,video_id nulls last,handle) from page),'[]'::jsonb)
);
$$;
revoke all on function public.get_creator_video_gmv_breakdown(uuid,text[],date,date,date,date,integer,integer) from public,anon,authenticated;
grant execute on function public.get_creator_video_gmv_breakdown(uuid,text[],date,date,date,date,integer,integer) to service_role;
