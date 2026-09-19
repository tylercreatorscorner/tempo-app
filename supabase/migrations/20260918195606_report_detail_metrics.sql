-- Additive snapshot fields; existing saved reports are not rewritten.
CREATE OR REPLACE FUNCTION public.get_brand_client_report_granular_workspace(p_tenant_id uuid, p_data_slugs text[], p_roster_slugs text[], p_start date, p_end date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '60s'
AS $function$
WITH scoped_brands_v2 AS NOT MATERIALIZED (SELECT * FROM public.brands_v2 WHERE tenant_id = p_tenant_id),
scoped_managed_creators AS NOT MATERIALIZED (SELECT * FROM public.managed_creators WHERE tenant_id = p_tenant_id),
scoped_tiktok_accounts AS NOT MATERIALIZED (SELECT * FROM public.tiktok_accounts WHERE tenant_id = p_tenant_id),
scoped_daily_video_product_stats AS NOT MATERIALIZED (SELECT * FROM public.daily_video_product_stats WHERE tenant_id = p_tenant_id), roster as (
    select mc.id,
           agreement.value as agreement,
           mc.creator_id,
           nullif(trim(mc.real_name), '')                          as real_name,
           coalesce(nullif(trim(mc.real_name), ''), mc.account_1)  as display_name,
           nullif(trim(mc.role), '')                               as role,
           coalesce((agreement.value->>'retainer')::numeric,rasof.retainer, 0)::numeric                    as retainer,
           (agreement.value is not null or coalesce(rasof.is_exact, true))                          as retainer_exact,
           case when coalesce((agreement.value->>'retainer')::numeric,rasof.retainer, 0) > 0
                then case when agreement.value is not null then (agreement.value->>'quota')::integer else nullif(mc.monthly_post_requirement, 0) end end    as quota,
           mc.archived_at::date                                    as archived_on,
           mc.cc_start_date                                        as cc_start_date,
           array_remove(array[
             lower(trim(replace(mc.account_1 , '@',''))), lower(trim(replace(mc.account_2 , '@',''))),
             lower(trim(replace(mc.account_3 , '@',''))), lower(trim(replace(mc.account_4 , '@',''))),
             lower(trim(replace(mc.account_5 , '@',''))), lower(trim(replace(mc.account_6 , '@',''))),
             lower(trim(replace(mc.account_7 , '@',''))), lower(trim(replace(mc.account_8 , '@',''))),
             lower(trim(replace(mc.account_9 , '@',''))), lower(trim(replace(mc.account_10, '@','')))
           ], null)                                                as col_handles
    from scoped_managed_creators mc
    left join lateral public.get_retainer_as_of(array[mc.id], p_end) rasof on true
    left join scoped_brands_v2 agreement_brand on agreement_brand.slug=mc.brand
    left join lateral (select public.get_creator_agreement_terms(p_tenant_id,mc.creator_id,agreement_brand.id,p_end) as value) agreement on true
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and mc.employment_status = 'active'
      and (mc.archived_at is null or mc.archived_at::date > p_start)
  ),
  roster_current as (select * from roster where archived_on is null),
  handle_src as (
    select r.id, r.archived_on, r.creator_id, hh.handle
    from roster r, unnest(r.col_handles) as hh(handle)
    where hh.handle <> ''
    union all
    select r.id, r.archived_on, r.creator_id,
           lower(btrim(regexp_replace(t.tiktok_username, '^@', '')))
    from roster r
    join scoped_tiktok_accounts t on t.creator_id = r.creator_id
    where r.creator_id is not null
      and t.tiktok_username is not null and btrim(t.tiktok_username) <> ''
  ),
  handles_by_creator as (
    select id, array_agg(distinct handle order by handle) as handles
    from handle_src group by id
  ),
  roster_handles as (
    select distinct on (handle) handle, id, archived_on
    from handle_src
    order by handle, (archived_on is null) desc, (creator_id is not null) desc, id
  ),
  facts as (
    select dv.video_id,
           dv.post_date,
           coalesce(dv.gmv, 0)::numeric   as gmv,
           coalesce(dv.orders, 0)::bigint as orders,
           dv.items_sold as units,
           rh.id                          as creator_id,
           rh.handle                      as handle
    from scoped_daily_video_product_stats dv
    join scoped_brands_v2 b on b.id = dv.brand_id
    left join roster_handles rh
      on rh.handle = lower(trim(replace(dv.tiktok_username, '@','')))
      and (rh.archived_on is null or dv.report_date < rh.archived_on)
    where (p_data_slugs is null or b.slug = any(p_data_slugs))
      and dv.report_date between p_start and p_end
  ),
  roster_facts as (select * from facts where creator_id is not null),
  top_handle as (
    select distinct on (creator_id) creator_id, handle
    from (select creator_id, handle, sum(gmv) as gmv
          from roster_facts group by 1,2) t
    order by creator_id, gmv desc, handle
  ),
  per_creator as (
    select f.creator_id,
           count(distinct f.video_id) filter (where f.post_date::date between p_start and p_end) as posts_published,
           count(distinct f.video_id)                                                            as videos_earning,
           sum(f.gmv)                                                                            as gmv,
           sum(f.orders)                                                                         as orders,
           case when count(f.units)=count(*) then sum(f.units) end as units,
           sum(f.gmv) filter (where f.post_date::date between p_start and p_end)                 as window_post_gmv,
           sum(f.gmv) filter (where r.cc_start_date is null
                                 or f.post_date::date >= r.cc_start_date)                        as net_new_gmv
    from roster_facts f
    join roster r on r.id = f.creator_id
    group by f.creator_id
  ),
  vintage as (
    select date_trunc('month', post_date)::date as posted_month,
           count(distinct video_id)             as videos,
           sum(gmv)                             as gmv
    from roster_facts
    group by 1
  ),
  /* Video GMV bucketed by AGE, not calendar month. Age is measured back from
     the window END, never from today: a frozen report must give the same
     answer forever. VIDEO GMV ONLY -- live and product-card GMV carry no post
     date and are never apportioned across these buckets. */
  vintage_age as (
    select case
             when post_date is null             then 'unknown'
             when post_date::date >  p_end - 30 then 'd0_30'
             when post_date::date >  p_end - 60 then 'd30_60'
             when post_date::date >  p_end - 90 then 'd60_90'
             when post_date::date > p_end - 180 then 'd90_180'
             else                                    'd180_plus'
           end                      as bucket,
           count(distinct video_id) as videos,
           sum(gmv)                 as gmv
    from roster_facts
    group by 1
  ),
  top3 as (
    select posted_month from vintage
    where posted_month is not null
    order by posted_month desc
    limit 3
  )

  select jsonb_build_object(
    'roster', (
      select jsonb_build_object(
        'signed',                count(*),
        'onRetainer',            count(*) filter (where retainer > 0),
        'affiliateOnly',         count(*) filter (where retainer = 0),
        'monthlyRetainerBudget', coalesce(sum(retainer), 0),
        'retainerHistoryExact',  coalesce(bool_and(retainer_exact) filter (where retainer > 0), true),
        -- Share of RETAINED creators carrying a level, so the renderer can
        -- decide whether the column is worth showing at all.
        'roleCoverage',          case when count(*) filter (where retainer > 0) = 0 then 0
                                      else round(100.0 * count(*) filter (where retainer > 0 and role is not null)
                                                 / count(*) filter (where retainer > 0)) end
      ) from roster_current
    ),

    'videoCounts', (
      select jsonb_build_object(
        'postsPublished', coalesce(count(distinct video_id) filter (where post_date::date between p_start and p_end), 0),
        'videosEarning',  coalesce(count(distinct video_id), 0)
      ) from roster_facts
    ),

    'newVideo', (
      select jsonb_build_object(
        'gmv30d',    coalesce(sum(gmv)                   filter (where post_date::date > p_end - 30), 0),
        'videos30d', coalesce(count(distinct video_id)   filter (where post_date::date > p_end - 30), 0),
        'totalGmv',  coalesce(sum(gmv), 0),
        'unknownPostDateGmv', coalesce(sum(gmv) filter (where post_date is null), 0)
      ) from roster_facts
    ),

    'vintage', coalesce((
      select jsonb_agg(jsonb_build_object(
               'label',  to_char(v.posted_month, 'Mon YYYY'),
               'videos', v.videos,
               'gmv',    v.gmv
             ) order by v.posted_month desc)
      from vintage v
      where v.posted_month in (select posted_month from top3)
    ), '[]'::jsonb),

    'vintageOlder', (
      select jsonb_build_object(
        'videos', coalesce(sum(videos), 0),
        'gmv',    coalesce(sum(gmv), 0)
      )
      from vintage
      where posted_month is null
         or posted_month < (select min(posted_month) from top3)
    ),

    'netNew', (
      select jsonb_build_object(
        'netNewGmv',  coalesce(sum(pc.net_new_gmv), 0),
        'preCcGmv',   coalesce(sum(pc.gmv) - sum(pc.net_new_gmv), 0),
        'totalGmv',   coalesce(sum(pc.gmv), 0)
      ) from per_creator pc
    ),

    /* All five keys always, so the renderer never has to guess whether a
       missing key means zero or means "not computed". */
    'vintageAge', (
      select jsonb_build_object(
        'd0_30',    jsonb_build_object('videos', coalesce(sum(videos) filter (where bucket = 'd0_30'),    0), 'gmv', coalesce(sum(gmv) filter (where bucket = 'd0_30'),    0)),
        'd30_60',   jsonb_build_object('videos', coalesce(sum(videos) filter (where bucket = 'd30_60'),   0), 'gmv', coalesce(sum(gmv) filter (where bucket = 'd30_60'),   0)),
        'd60_90',   jsonb_build_object('videos', coalesce(sum(videos) filter (where bucket = 'd60_90'),   0), 'gmv', coalesce(sum(gmv) filter (where bucket = 'd60_90'),   0)),
        'd90_plus', jsonb_build_object('videos', coalesce(sum(videos) filter (where bucket in ('d90_180','d180_plus')), 0), 'gmv', coalesce(sum(gmv) filter (where bucket in ('d90_180','d180_plus')), 0)),
        'd90_180', jsonb_build_object('videos', coalesce(sum(videos) filter (where bucket = 'd90_180'),0), 'gmv', coalesce(sum(gmv) filter (where bucket = 'd90_180'),0)),
        'd180_plus', jsonb_build_object('videos', coalesce(sum(videos) filter (where bucket = 'd180_plus'),0), 'gmv', coalesce(sum(gmv) filter (where bucket = 'd180_plus'),0)),
        'unknown',  jsonb_build_object('videos', coalesce(sum(videos) filter (where bucket = 'unknown'),  0), 'gmv', coalesce(sum(gmv) filter (where bucket = 'unknown'),  0))
      )
      from vintage_age
    ),

    'creators', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name',           r.display_name,
               'creatorId',      r.creator_id,
               'agreement',      case when r.agreement is null then null else r.agreement || jsonb_build_object(
                  'reportPeriodComparable', coalesce(
                    (r.agreement->>'periodStart')::date=p_start
                    and (r.agreement->>'periodEnd')::date=(date_trunc('month',p_start)+interval '1 month - 1 day')::date
                    and p_end<=(r.agreement->>'periodEnd')::date
                    and not coalesce((r.agreement->'snapshot'->>'paymentReviewRequired')::boolean,true)
                    and jsonb_array_length(r.agreement->'snapshot'->'segments')=1
                    and r.agreement->'snapshot'->'segments'->0->'terms'->>'payment'='prorated_posts',false)
                ) end,
               'realName',       r.real_name,
               'role',           r.role,
               'handle',         coalesce(th.handle, hc.handles[1], r.col_handles[1]),
               'handles',        coalesce(to_jsonb(hc.handles), '[]'::jsonb),
               'handleCount',    coalesce(array_length(hc.handles, 1), 0),
               'isAffiliate',    r.retainer = 0,
               'retainer',       case when r.archived_on is null then r.retainer else 0 end,
               'quota',          case when r.archived_on is null then r.quota end,
               'departed',       r.archived_on is not null,
               'postsPublished', coalesce(pc.posts_published, 0),
               'videosEarning',  coalesce(pc.videos_earning, 0),
               'gmv',            coalesce(pc.gmv, 0),
               'windowPostGmv',  coalesce(pc.window_post_gmv, 0),
               'netNewGmv',      coalesce(pc.net_new_gmv, 0),
               'ccStartDate',    r.cc_start_date,
               'orders',         coalesce(pc.orders, 0),
               'units',          case when pc.creator_id is null then 0 else pc.units end
             ) order by coalesce(pc.gmv, 0) desc, r.display_name)
      from roster r
      left join per_creator pc on pc.creator_id = r.id
      left join top_handle  th on th.creator_id = r.id
      left join handles_by_creator hc on hc.id = r.id
    ), '[]'::jsonb)
  );
$function$;
REVOKE ALL ON FUNCTION public.get_brand_client_report_granular_workspace(uuid, text[], text[], date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_brand_client_report_granular_workspace(uuid, text[], text[], date, date) TO service_role;

