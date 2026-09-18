-- Resolve only verified agreement periods; missing historical ledgers return NULL for legacy fallback.
create function public.get_creator_agreement_terms(p_tenant uuid,p_creator uuid,p_brand uuid,p_as_of date)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare ledger creator_agreement_ledgers; period jsonb; revision jsonb; segment jsonb; rule jsonb;
begin
 select * into ledger from creator_agreement_ledgers where tenant_id=p_tenant and creator_id=p_creator and brand_id=p_brand and starts_on<=p_as_of order by starts_on desc limit 1;
 if ledger.id is null then return null; end if;
 if ledger.ends_on is not null and p_as_of>ledger.ends_on then return jsonb_build_object('ledgerId',ledger.id,'ledgerVersion',ledger.version,'retainer',0,'quota',null,'status','ended'); end if;
 select value into period from jsonb_array_elements(ledger.state->'periods') where (value->>'start')::date<=p_as_of and (value->>'through')::date>=p_as_of limit 1;
 if period is null then
  select value into rule from jsonb_array_elements(ledger.state->'rules') with ordinality r(value,idx) where (value->>'from')::date<=p_as_of and ((value->>'through') is null or (value->>'through')::date>=p_as_of) order by idx desc limit 1;
  if rule->'terms'->>'renewal'='automatic' then raise exception 'Agreement renewal is pending. Retry after renewal completes.'; end if;
  return jsonb_build_object('ledgerId',ledger.id,'ledgerVersion',ledger.version,'retainer',0,'quota',null,'status','awaiting_renewal');
 end if;
 revision:=period->'revisions'->-1;
 select value into segment from jsonb_array_elements(revision->'segments') where (value->>'from')::date<=p_as_of and (value->>'through')::date>=p_as_of limit 1;
 return jsonb_build_object('ledgerId',ledger.id,'ledgerVersion',ledger.version,'periodStart',period->>'start','periodEnd',period->>'through','revision',revision->'version','retainer',coalesce((segment->'terms'->>'feeCents')::numeric/100,0),'quota',(segment->'terms'->>'requiredPosts')::integer,'status',case when segment is null then 'ended' else 'active' end,'snapshot',revision);
end $$;
revoke all on function public.get_creator_agreement_terms(uuid,uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.get_creator_agreement_terms(uuid,uuid,uuid,date) to service_role;
create function public.get_roster_agreement_terms(p_tenant uuid,p_ids integer[],p_as_of date)
returns table(managed_creator_id integer,agreement jsonb) language sql stable security invoker set search_path=public,pg_temp as $$
 select mc.id,public.get_creator_agreement_terms(p_tenant,mc.creator_id,b.id,p_as_of)
 from managed_creators mc join brands_v2 b on b.tenant_id=mc.tenant_id and b.slug=mc.brand
 where mc.tenant_id=p_tenant and mc.id=any(p_ids);
$$;
revoke all on function public.get_roster_agreement_terms(uuid,integer[],date) from public,anon,authenticated;
grant execute on function public.get_roster_agreement_terms(uuid,integer[],date) to service_role;

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
             else                                    'd90_plus'
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
        'd90_plus', jsonb_build_object('videos', coalesce(sum(videos) filter (where bucket = 'd90_plus'), 0), 'gmv', coalesce(sum(gmv) filter (where bucket = 'd90_plus'), 0)),
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
               'orders',         coalesce(pc.orders, 0)
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

-- Keep legacy current-term consumers synchronized during the reader transition.
alter table public.creator_agreement_ledgers add column renew_after date;
create index creator_agreement_renewal_due on public.creator_agreement_ledgers(renew_after,id) where renew_after is not null;
create or replace function public.save_creator_agreement_ledger(
 p_id uuid,p_tenant uuid,p_creator uuid,p_brand uuid,p_actor uuid,
 p_expected integer,p_request uuid,p_command jsonb,p_state jsonb
) returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare current_row public.creator_agreement_ledgers; prior public.creator_agreement_events;
 start_date date; end_date date; resolved jsonb; current_day date := (now() at time zone 'America/Chicago')::date;
begin
 if (p_actor is null and p_command->>'action' is distinct from 'advance') or p_request is null or p_id is null or p_expected is null or p_expected<0
 or jsonb_typeof(p_state) is distinct from 'object' or p_state->>'schemaVersion' is distinct from '1'
 or jsonb_typeof(p_state->'periods') is distinct from 'array' or jsonb_array_length(p_state->'periods')<1
 or jsonb_typeof(p_command) is distinct from 'object' or p_command->>'action' is null
 or p_command->>'action' not in ('create','change','end','advance','renew')
 or length(trim(coalesce(p_command->>'reason','')))<3 then raise exception 'Invalid agreement write'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_creator::text||p_brand::text,0));
 if not exists(select 1 from creators_v2 c join creator_brands cb on cb.creator_id=c.id and cb.tenant_id=c.tenant_id join brands_v2 b on b.id=cb.brand_id and b.tenant_id=c.tenant_id where c.id=p_creator and c.tenant_id=p_tenant and b.id=p_brand and not b.is_archived) then raise exception 'Agreement relationship is unavailable'; end if;
 select * into current_row from creator_agreement_ledgers where id=p_id for update;
 if current_row.id is not null and (current_row.tenant_id<>p_tenant or current_row.creator_id<>p_creator or current_row.brand_id<>p_brand) then raise exception 'Agreement scope mismatch'; end if;
 select * into prior from creator_agreement_events where ledger_id=p_id and request_id=p_request;
 if prior.id is not null then
  if prior.actor_id is distinct from p_actor or prior.command is distinct from p_command then raise exception 'Request key already used'; end if;
  return prior.version;
 end if;
 if coalesce(current_row.version,0)<>p_expected then raise exception 'Agreement changed. Reload before saving'; end if;
 if (current_row.id is null) <> (p_command->>'action'='create') then raise exception 'Invalid agreement lifecycle'; end if;
 if current_row.id is not null then
  if p_state->>'firstPeriodEnd' is distinct from current_row.state->>'firstPeriodEnd' or p_state->>'kind' is distinct from current_row.state->>'kind' or p_state->'deadline' is distinct from current_row.state->'deadline' then raise exception 'Agreement identity cannot change'; end if;
  -- An existing period and every recorded revision must survive all later saves.
  if exists (
    select 1 from jsonb_array_elements(current_row.state->'periods') old_period
    where not exists (
      select 1 from jsonb_array_elements(p_state->'periods') new_period
      where new_period->>'start'=old_period->>'start' and new_period->>'through'=old_period->>'through'
      and jsonb_typeof(new_period->'revisions')='array'
      and not exists (
        select 1 from jsonb_array_elements(old_period->'revisions') with ordinality r(value,idx)
        where new_period->'revisions'->(r.idx::integer-1) is distinct from r.value
      )
    )
  ) then raise exception 'Historical agreement revisions cannot be replaced'; end if;
 end if;
 start_date:=(p_state->>'start')::date;
 end_date:=coalesce((p_state->>'finalDate')::date,(p_state->>'deadline')::date);
 if start_date is null or (current_row.id is not null and current_row.starts_on<>start_date) then raise exception 'Agreement start cannot change'; end if;
 if exists(select 1 from creator_agreement_ledgers where tenant_id=p_tenant and creator_id=p_creator and brand_id=p_brand and id<>p_id and starts_on<=coalesce(end_date,'infinity'::date) and coalesce(ends_on,'infinity'::date)>=start_date) then raise exception 'Agreement overlaps an existing agreement'; end if;
 if current_row.id is null then
  insert into creator_agreement_ledgers(id,tenant_id,creator_id,brand_id,starts_on,ends_on,version,state) values(p_id,p_tenant,p_creator,p_brand,start_date,end_date,1,p_state);
 else
  update creator_agreement_ledgers set ends_on=end_date,version=p_expected+1,state=p_state,updated_at=now() where id=p_id;
 end if;
 insert into creator_agreement_events(ledger_id,version,request_id,actor_id,command) values(p_id,p_expected+1,p_request,p_actor,p_command);
 -- Wake for every future term boundary, including period-only reversions.
 -- A manual period expires once; it remains awaiting renewal without hourly writes.
 update creator_agreement_ledgers set renew_after=(
  select min(day) from (
   select start_date as day
   union all select end_date+1
   union all select (p_state->'periods'->-1->>'through')::date+1
   union all select (rule->>'from')::date from jsonb_array_elements(p_state->'rules') rule
   union all select (rule->>'through')::date+1 from jsonb_array_elements(p_state->'rules') rule
  ) boundaries where day>current_day and (end_date is null or day<=end_date+1)
 ) where id=p_id;
 if start_date<=current_day then
  resolved:=public.get_creator_agreement_terms(p_tenant,p_creator,p_brand,current_day);
  update managed_creators mc set retainer=(resolved->>'retainer')::numeric,monthly_post_requirement=(resolved->>'quota')::integer,
   updated_by=coalesce((select email from user_profiles where user_id=p_actor and tenant_id=p_tenant limit 1),'Automatic agreement renewal')
  from brands_v2 b where mc.tenant_id=p_tenant and mc.creator_id=p_creator and b.id=p_brand and b.tenant_id=p_tenant and mc.brand=b.slug
  and (mc.retainer is distinct from (resolved->>'retainer')::numeric or mc.monthly_post_requirement is distinct from (resolved->>'quota')::integer);
 end if;
 return p_expected+1;
end $$;
revoke all on function public.save_creator_agreement_ledger(uuid,uuid,uuid,uuid,uuid,integer,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_creator_agreement_ledger(uuid,uuid,uuid,uuid,uuid,integer,uuid,jsonb,jsonb) to service_role;

-- Trigger-only definer: evaluates OLD row after caller RLS; accepts no caller-supplied identity.
-- Ledger reads are intentionally unavailable to browser roles.
create function public.guard_ledger_roster_terms() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare target_brand uuid; expected jsonb;
begin
 if new.retainer is not distinct from old.retainer and new.monthly_post_requirement is not distinct from old.monthly_post_requirement and new.brand is not distinct from old.brand and new.creator_id is not distinct from old.creator_id and new.tenant_id is not distinct from old.tenant_id then return new; end if;
 select id into target_brand from brands_v2 where tenant_id=old.tenant_id and slug=old.brand;
 if exists(select 1 from creator_agreement_ledgers where tenant_id=old.tenant_id and creator_id=old.creator_id and creator_agreement_ledgers.brand_id=target_brand) then
  if new.brand is distinct from old.brand or new.creator_id is distinct from old.creator_id or new.tenant_id is distinct from old.tenant_id then raise exception 'This creator has agreement history. Manage the relationship from Agreements.'; end if;
  expected:=get_creator_agreement_terms(old.tenant_id,old.creator_id,target_brand,(now() at time zone 'America/Chicago')::date);
  if expected is null or new.retainer is distinct from (expected->>'retainer')::numeric or new.monthly_post_requirement is distinct from (expected->>'quota')::integer then raise exception 'Use the creator Agreements tab to change recorded terms.'; end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_ledger_roster_terms() from public,anon,authenticated;
create trigger managed_creators_agreement_terms before update on public.managed_creators for each row execute function public.guard_ledger_roster_terms();
