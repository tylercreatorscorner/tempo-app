-- Per-creator sourcing fee terms and an explicit monthly actual roster ledger.
-- No existing JSON, invoices, collections, or immutable audit snapshots are rewritten.
create or replace function public.agency_billing_trim(p_text text) returns text
language sql immutable security invoker set search_path=pg_catalog,public,pg_temp as $$
 select btrim(p_text,chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||
  chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||
  chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279));
$$;
revoke all on function public.agency_billing_trim(text) from public,anon,authenticated;
grant execute on function public.agency_billing_trim(text) to service_role;

create or replace function public.agency_creator_rate_normalize(p_rate jsonb) returns jsonb
language plpgsql immutable security invoker set search_path=pg_catalog,public,pg_temp as $$
declare monthly numeric; maximum numeric; budget numeric;
begin
 if jsonb_typeof(p_rate) is distinct from 'object' then raise exception 'Invalid agency creator rate'; end if;
 if not p_rate ?& array['monthlyFee','maxCreators','monthlyBudgetCap']
  or exists(select 1 from jsonb_object_keys(p_rate) k where k not in ('monthlyFee','maxCreators','monthlyBudgetCap'))
  or jsonb_typeof(p_rate->'monthlyFee') is distinct from 'number' or jsonb_typeof(p_rate->'maxCreators') is distinct from 'number'
  or jsonb_typeof(p_rate->'monthlyBudgetCap') is distinct from 'number' then raise exception 'Invalid agency creator rate'; end if;
 monthly:=(p_rate->>'monthlyFee')::numeric; maximum:=(p_rate->>'maxCreators')::numeric; budget:=(p_rate->>'monthlyBudgetCap')::numeric;
 if monthly<0 or monthly>100000000 or monthly<>round(monthly,2) or maximum<1 or maximum>10000 or maximum<>trunc(maximum)
  or budget<0 or budget>100000000 or budget<>round(budget,2) then raise exception 'Invalid agency creator rate'; end if;
 return jsonb_build_object('monthlyFee',monthly,'maxCreators',maximum,'monthlyBudgetCap',budget);
end $$;
revoke all on function public.agency_creator_rate_normalize(jsonb) from public,anon,authenticated;
grant execute on function public.agency_creator_rate_normalize(jsonb) to service_role;

create or replace function public.agency_creator_periods_normalize(p_periods jsonb) returns jsonb
language plpgsql immutable security invoker set search_path=pg_catalog,public,pg_temp as $$
declare period jsonb; creator jsonb; result jsonb:='[]'::jsonb; creators jsonb; normalized jsonb;
 month_seen text[]:=array[]::text[]; normalized_id text; handle text; started date; ended date; total_rows integer;
begin
 if jsonb_typeof(p_periods) is distinct from 'array' then raise exception 'Invalid finance creator billing periods'; end if;
 if jsonb_array_length(p_periods)>240 then raise exception 'Invalid finance creator billing periods'; end if;
 select coalesce(sum(case when jsonb_typeof(value->'creators')='array' then jsonb_array_length(value->'creators') else 0 end),0) into total_rows from jsonb_array_elements(p_periods);
 if total_rows>12000 then raise exception 'Invalid finance creator billing periods'; end if;
 for period in select value from jsonb_array_elements(p_periods) loop
  if jsonb_typeof(period) is distinct from 'object' then raise exception 'Invalid finance creator billing period'; end if;
  if not period ?& array['month','rosterConfirmed','creators']
   or exists(select 1 from jsonb_object_keys(period) k where k not in ('month','rosterConfirmed','headcountApproval','budgetApproval','creators'))
   or jsonb_typeof(period->'month') is distinct from 'string' or period->>'month' !~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$'
   or jsonb_typeof(period->'rosterConfirmed') is distinct from 'boolean'
   or (period ? 'headcountApproval' and jsonb_typeof(period->'headcountApproval') is distinct from 'string') or (period ? 'budgetApproval' and jsonb_typeof(period->'budgetApproval') is distinct from 'string')
   or jsonb_typeof(period->'creators') is distinct from 'array' then raise exception 'Invalid finance creator billing period'; end if;
  if period->>'month'=any(month_seen) or length(public.agency_billing_trim(coalesce(period->>'headcountApproval','')))>4000 or length(public.agency_billing_trim(coalesce(period->>'budgetApproval','')))>4000
   or jsonb_array_length(period->'creators')>10000 then raise exception 'Invalid finance creator billing period'; end if;
  month_seen:=array_append(month_seen,period->>'month'); creators:='[]'::jsonb;
  for creator in select value from jsonb_array_elements(period->'creators') loop
   if jsonb_typeof(creator) is distinct from 'object' then raise exception 'Invalid finance creator billing row'; end if;
   if not creator ?& array['id','handle','activeFrom','activeThrough','approved','onboarded','tapAuthorized','tier']
    or exists(select 1 from jsonb_object_keys(creator) k where k not in ('id','handle','activeFrom','activeThrough','approved','onboarded','tapAuthorized','tier'))
    or jsonb_typeof(creator->'id') is distinct from 'string' or creator->>'id' !~* '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$'
    or jsonb_typeof(creator->'handle') is distinct from 'string' or jsonb_typeof(creator->'activeFrom') is distinct from 'string'
    or creator->>'activeFrom' !~ '^(19|20|21)[0-9]{2}-[0-9]{2}-[0-9]{2}$'
    or (jsonb_typeof(creator->'activeThrough') is distinct from 'null' and (jsonb_typeof(creator->'activeThrough') is distinct from 'string' or creator->>'activeThrough' !~ '^(19|20|21)[0-9]{2}-[0-9]{2}-[0-9]{2}$'))
    or jsonb_typeof(creator->'approved') is distinct from 'boolean' or jsonb_typeof(creator->'onboarded') is distinct from 'boolean'
    or jsonb_typeof(creator->'tapAuthorized') is distinct from 'boolean' or jsonb_typeof(creator->'tier') is distinct from 'string'
    or creator->>'tier' not in ('L2','L3','L4') then raise exception 'Invalid finance creator billing row'; end if;
   normalized_id:=lower(creator->>'id'); handle:=lower(regexp_replace(public.agency_billing_trim(creator->>'handle'),'^@+',''));
   started:=(creator->>'activeFrom')::date; ended:=(creator->>'activeThrough')::date;
   if handle !~ '^[a-z0-9_.]{1,100}$' or ended<started then raise exception 'Invalid finance creator billing row'; end if;

  end loop;
  if (select count(distinct lower(c->>'id')) from jsonb_array_elements(period->'creators') c)<>jsonb_array_length(period->'creators')
   or (select count(distinct lower(regexp_replace(public.agency_billing_trim(c->>'handle'),'^@+',''))) from jsonb_array_elements(period->'creators') c)<>jsonb_array_length(period->'creators') then raise exception 'Invalid finance creator billing row'; end if;
  select coalesce(jsonb_agg(c||jsonb_build_object('id',lower(c->>'id'),'handle',lower(regexp_replace(public.agency_billing_trim(c->>'handle'),'^@+','')),
   'activeFrom',(c->>'activeFrom')::date,'activeThrough',(c->>'activeThrough')::date) order by n),'[]'::jsonb) into creators
   from jsonb_array_elements(period->'creators') with ordinality t(c,n);
  result:=result||jsonb_build_array(period||jsonb_build_object('headcountApproval',public.agency_billing_trim(coalesce(period->>'headcountApproval','')),'budgetApproval',public.agency_billing_trim(coalesce(period->>'budgetApproval','')),'creators',creators));
 end loop;
 return result;
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then raise exception 'Invalid finance creator billing periods';
end $$;
revoke all on function public.agency_creator_periods_normalize(jsonb) from public,anon,authenticated;
grant execute on function public.agency_creator_periods_normalize(jsonb) to service_role;

create or replace function public.agency_creator_billing_calculate(p_client jsonb,p_terms jsonb,p_period jsonb,p_month text,p_through date)
returns jsonb language plpgsql immutable security invoker set search_path=pg_catalog,public,pg_temp as $$
declare normalized_period jsonb; rate jsonb; month_start date; month_end date; denominator integer; confirmed boolean:=false; lifecycle boolean:=true;
 client_start date; client_end date; creator jsonb; missing jsonb; creators jsonb:='[]'::jsonb; reasons jsonb:='[]'::jsonb;
 full_start date; full_end date; full_days integer; actual_days integer; eligible boolean; eligible_count integer:=0;
 monthly_fee numeric; stipend numeric; source_cents bigint; stipend_cents bigint; full_source bigint; full_stipend bigint;
 fee_total bigint:=0; stipend_total bigint:=0; full_total bigint:=0; ready boolean; blocked boolean;
begin
 if p_month is null or p_month !~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$' then raise exception 'Invalid creator billing month'; end if;
 month_start:=(p_month||'-01')::date; month_end:=(month_start+interval '1 month - 1 day')::date; denominator:=month_end-month_start+1;
 if p_through is null or not isfinite(p_through) or p_through<month_start-1 or p_through>month_end then raise exception 'Invalid creator billing through date'; end if;
 if p_terms->>'feeModel' is distinct from 'per_creator' then raise exception 'Invalid agency creator rate'; end if;
 rate:=public.agency_creator_rate_normalize(p_terms->'creatorRate'); monthly_fee:=(rate->>'monthlyFee')::numeric;
 if p_period is not null and jsonb_typeof(p_period)<>'null' then
  normalized_period:=public.agency_creator_periods_normalize(jsonb_build_array(p_period))->0;
  if normalized_period->>'month'<>p_month then raise exception 'Invalid creator billing month'; end if;
  confirmed:=(normalized_period->>'rosterConfirmed')::boolean;
 end if;
 if not confirmed then reasons:=reasons||jsonb_build_array('Confirm the actual creator roster for this service month.'); end if;
 if p_client->>'serviceStart' is null then
  lifecycle:=false; reasons:=reasons||jsonb_build_array('Add the confirmed service start date.');
 else
  begin
   if jsonb_typeof(p_client->'serviceStart') is distinct from 'string' or p_client->>'serviceStart' !~ '^(19|20|21)[0-9]{2}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid lifecycle'; end if;
   client_start:=(p_client->>'serviceStart')::date;
  exception when others then lifecycle:=false; reasons:=reasons||jsonb_build_array('Add the confirmed service start date.'); end;
  if lifecycle then
   begin
    if p_client->>'serviceEnd' is not null and (jsonb_typeof(p_client->'serviceEnd') is distinct from 'string' or p_client->>'serviceEnd' !~ '^(19|20|21)[0-9]{2}-[0-9]{2}-[0-9]{2}$') then raise exception 'Invalid lifecycle'; end if;
    client_end:=(p_client->>'serviceEnd')::date;
    if client_end<client_start then raise exception 'Invalid lifecycle'; end if;
   exception when others then lifecycle:=false; reasons:=reasons||jsonb_build_array('Review the recorded service dates.'); end;
  end if;
 end if;
 ready:=confirmed and lifecycle;
 -- Aggregate normalized rows once; large historical ledgers do not incur
 -- quadratic JSON array concatenation while calculating a selected period.
 with input_rows as (
  select c,n,
   (case when (c->>'approved')::boolean then '[]'::jsonb else jsonb_build_array('approved') end)||
   (case when (c->>'onboarded')::boolean then '[]'::jsonb else jsonb_build_array('onboarded') end)||
   (case when (c->>'tapAuthorized')::boolean then '[]'::jsonb else jsonb_build_array('tapAuthorized') end) as missing_req,
   greatest(month_start,client_start,(c->>'activeFrom')::date) as bill_start,
   least(month_end,coalesce(client_end,month_end),coalesce((c->>'activeThrough')::date,month_end)) as bill_end
  from jsonb_array_elements(coalesce(normalized_period->'creators','[]'::jsonb)) with ordinality t(c,n)
 ), eligible_rows as (
  select r.*,greatest(0,r.bill_end-r.bill_start+1) as month_days,
   lifecycle and jsonb_array_length(r.missing_req)=0 and r.bill_end>=r.bill_start as qualifies
  from input_rows r
 ), day_rows as (
  select r.*,case when ready and r.qualifies then greatest(0,least(r.bill_end,p_through)-r.bill_start+1) else 0 end as closed_days,
   case r.c->>'tier' when 'L2' then 500 when 'L3' then 1500 else 3500 end as stipend_dollars
  from eligible_rows r
 ), money_rows as (
  select r.*,round(monthly_fee*100*r.closed_days/denominator)::bigint as source_fee,
   round(r.stipend_dollars::numeric*100*r.closed_days/denominator)::bigint as stipend_fee,
   case when ready and r.qualifies then round(monthly_fee*100*r.month_days/denominator)::bigint+
    round(r.stipend_dollars::numeric*100*r.month_days/denominator)::bigint else 0 end as exposure
  from day_rows r
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',r.c->'id','handle',r.c->'handle','tier',r.c->'tier',
  'eligible',r.qualifies,'activeDays',r.closed_days,'sourceFeeCents',r.source_fee,'stipendCents',r.stipend_fee,'missingRequirements',r.missing_req) order by r.n),'[]'::jsonb),
  count(*) filter(where r.qualifies),coalesce(sum(r.source_fee),0),coalesce(sum(r.stipend_fee),0),coalesce(sum(r.exposure),0)
 into creators,eligible_count,fee_total,stipend_total,full_total from money_rows r;
 if ready and eligible_count>(rate->>'maxCreators')::integer and normalized_period->>'headcountApproval'='' then
  reasons:=reasons||jsonb_build_array('Monthly eligible creator count exceeds the approved maximum. Add written headcount approval.');
 end if;
 if ready and full_total>(rate->>'monthlyBudgetCap')::numeric*100 and normalized_period->>'budgetApproval'='' then
  reasons:=reasons||jsonb_build_array('Monthly source fees plus creator stipends exceed the approved budget cap. Add written budget approval.');
 end if;
 blocked:=jsonb_array_length(reasons)>0;
 return jsonb_build_object('month',p_month,'throughDate',p_through,'daysInMonth',denominator,'rosterConfirmed',confirmed,
  'eligibleCount',case when ready then eligible_count else null end,
  'feeCents',case when not blocked then fee_total else null end,'stipendCents',case when not blocked then stipend_total else null end,
  'combinedCents',case when not blocked then fee_total+stipend_total else null end,'fullMonthCombinedCents',case when ready then full_total else null end,
  'creators',creators,'blocked',blocked,'reasons',reasons);
end $$;
revoke all on function public.agency_creator_billing_calculate(jsonb,jsonb,jsonb,text,date) from public,anon,authenticated;
grant execute on function public.agency_creator_billing_calculate(jsonb,jsonb,jsonb,text,date) to service_role;

create or replace function public.agency_business_save_client(p_tenant_id uuid, p_actor_id uuid, p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
 target uuid; expected integer; previous integer; client_name text; started date; ended date; reason text;
 brand_ids uuid[]; item jsonb; amount numeric; rate numeric; result jsonb; normalized_terms jsonb;
 tier jsonb; tier_index integer; tier_count integer; tier_bound numeric; prior_bound numeric;
 previous_snapshot jsonb; historical_client boolean; component jsonb;
begin
 if p_tenant_id is null or p_actor_id is null or not exists (
   select 1 from public.user_profiles where user_id = p_actor_id and tenant_id = p_tenant_id and role in ('owner','admin')
 ) then raise exception 'Invalid agency scope'; end if;
 if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Invalid agency client'; end if;
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in
   ('id','expectedRevision','name','historical','brandIds','serviceStart','serviceEnd','exitReason','terms'))
   or not p_payload ?& array['expectedRevision','name','brandIds','serviceStart','serviceEnd','exitReason','terms']
 then raise exception 'Invalid agency client'; end if;
 if jsonb_typeof(p_payload->'expectedRevision') <> 'number' or (p_payload->>'expectedRevision')::numeric < 0
   or (p_payload->>'expectedRevision')::numeric > 2147483646
   or trunc((p_payload->>'expectedRevision')::numeric) <> (p_payload->>'expectedRevision')::numeric
 then raise exception 'Invalid agency revision'; end if;
 expected := (p_payload->>'expectedRevision')::integer;
 if p_payload ? 'id' then
   if jsonb_typeof(p_payload->'id') <> 'string' or p_payload->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or expected = 0 then raise exception 'Invalid agency client'; end if;
   target := (p_payload->>'id')::uuid;
 else
   if expected <> 0 then raise exception 'Invalid agency revision'; end if;
   target := gen_random_uuid();
 end if;
 if jsonb_typeof(p_payload->'name') <> 'string' then raise exception 'Invalid agency client'; end if;
 client_name := trim(p_payload->>'name');
 if length(client_name) < 1 or length(client_name) > 200 then raise exception 'Invalid agency client'; end if;
 if p_payload ? 'historical' and jsonb_typeof(p_payload->'historical') <> 'boolean' then raise exception 'Invalid agency historical flag'; end if;
 if jsonb_typeof(p_payload->'brandIds') <> 'array' then raise exception 'Invalid agency brands'; end if;
 if jsonb_array_length(p_payload->'brandIds') > 100 then raise exception 'Invalid agency brands'; end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'brandIds') b where jsonb_typeof(b) <> 'string'
   or b #>> '{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'Invalid agency brands'; end if;
 select coalesce(array_agg(b::uuid),array[]::uuid[]) into brand_ids from jsonb_array_elements_text(p_payload->'brandIds') b;
 if cardinality(brand_ids) <> (select count(distinct b) from unnest(brand_ids) b) then raise exception 'Invalid agency brands'; end if;
 foreach item in array array[p_payload->'serviceStart',p_payload->'serviceEnd'] loop
   if jsonb_typeof(item) <> 'null' and (jsonb_typeof(item) <> 'string' or item #>> '{}' !~ '^(19|20|21)[0-9]{2}-[0-9]{2}-[0-9]{2}$') then raise exception 'Invalid agency lifecycle'; end if;
 end loop;
 started := (p_payload->>'serviceStart')::date; ended := (p_payload->>'serviceEnd')::date;
 if jsonb_typeof(p_payload->'exitReason') not in ('null','string') then raise exception 'Invalid agency lifecycle'; end if;
 reason := trim(p_payload->>'exitReason');
 if reason is not null and (length(reason) < 1 or length(reason) > 1000) then raise exception 'Invalid agency lifecycle'; end if;
 if (ended is not null and (started is null or started > ended or reason is null)) or (ended is null and reason is not null) then raise exception 'Invalid agency lifecycle'; end if;
 if jsonb_typeof(p_payload->'terms') <> 'array' then raise exception 'Invalid agency terms'; end if;
 if jsonb_array_length(p_payload->'terms') > 240 then raise exception 'Invalid agency terms'; end if;
 for item in select value from jsonb_array_elements(p_payload->'terms') loop
   if jsonb_typeof(item) <> 'object' then raise exception 'Invalid agency terms'; end if;
   if not item ?& array['effectiveMonth','monthlyRetainer','revSharePercent','feeModel']
     or exists(select 1 from jsonb_object_keys(item) k where k not in ('effectiveMonth','monthlyRetainer','revSharePercent','feeModel','revShareTiers','tierCalculation','gmvBasis','managerComponent','servicePeriod','creatorRate'))
   then raise exception 'Invalid agency terms'; end if;
   if jsonb_typeof(item->'effectiveMonth') <> 'string' or item->>'effectiveMonth' !~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$'
     or jsonb_typeof(item->'monthlyRetainer') <> 'number' or jsonb_typeof(item->'revSharePercent') <> 'number'
     or jsonb_typeof(item->'feeModel') <> 'string' or item->>'feeModel' not in ('fixed','share','additive','minimum','tiered','components','per_creator')
   then raise exception 'Invalid agency terms'; end if;
   if item ? 'servicePeriod' then perform public.agency_validate_service_period(item->'servicePeriod',item->>'effectiveMonth',p_payload); end if;
   amount := (item->>'monthlyRetainer')::numeric; rate := (item->>'revSharePercent')::numeric;
   if amount < 0 or amount > 100000000 or amount <> round(amount,2) or rate < 0 or rate > 100 or rate <> round(rate,2) then raise exception 'Invalid agency terms'; end if;
   if item->>'feeModel' = 'per_creator' then
     perform public.agency_creator_rate_normalize(item->'creatorRate');
     if (item->>'monthlyRetainer')::numeric<>0 or (item->>'revSharePercent')::numeric<>0 then raise exception 'Invalid agency creator rate'; end if;
   elsif item ? 'creatorRate' then raise exception 'Invalid agency creator rate'; end if;
   if item->>'feeModel' = 'components' then
     component := item->'managerComponent';
     if jsonb_typeof(component) is distinct from 'object' then raise exception 'Invalid agency manager component'; end if;
     if not component ?& array['monthlyRetainer','revSharePercent','feeModel']
       or exists(select 1 from jsonb_object_keys(component) k where k not in ('monthlyRetainer','revSharePercent','feeModel'))
       or jsonb_typeof(component->'monthlyRetainer') <> 'number' or jsonb_typeof(component->'revSharePercent') <> 'number'
       or jsonb_typeof(component->'feeModel') <> 'string' or component->>'feeModel' not in ('additive','minimum')
     then raise exception 'Invalid agency manager component'; end if;
     amount := (component->>'monthlyRetainer')::numeric; rate := (component->>'revSharePercent')::numeric;
     if amount < 0 or amount > 100000000 or amount <> round(amount,2) or rate < 0 or rate > 100 or rate <> round(rate,2)
     then raise exception 'Invalid agency manager component'; end if;
   elsif item ? 'managerComponent' then raise exception 'Invalid agency manager component';
   end if;
   if item->>'feeModel' = 'tiered' then
     if not item ?& array['revShareTiers','tierCalculation','gmvBasis'] or rate <> 0 then raise exception 'Invalid agency tiers'; end if;
     if jsonb_typeof(item->'tierCalculation') <> 'string' or item->>'tierCalculation' not in ('unconfirmed','marginal','whole')
       or jsonb_typeof(item->'gmvBasis') <> 'string' or item->>'gmvBasis' not in ('managed','agency_supported_affiliate')
       or jsonb_typeof(item->'revShareTiers') <> 'array' then raise exception 'Invalid agency tiers'; end if;
     tier_count := jsonb_array_length(item->'revShareTiers');
     if tier_count < 1 or tier_count > 20 then raise exception 'Invalid agency tiers'; end if;
     tier_index := 0; prior_bound := 0;
     for tier in select value from jsonb_array_elements(item->'revShareTiers') loop
       tier_index := tier_index + 1;
       if jsonb_typeof(tier) <> 'object' then raise exception 'Invalid agency tiers'; end if;
       if not tier ?& array['upToGmv','percent'] or exists(select 1 from jsonb_object_keys(tier) k where k not in ('upToGmv','percent'))
         or jsonb_typeof(tier->'percent') <> 'number' then raise exception 'Invalid agency tiers'; end if;
       rate := (tier->>'percent')::numeric;
       if rate < 0 or rate > 100 or rate <> round(rate,2) then raise exception 'Invalid agency tiers'; end if;
       if tier_index = tier_count then
         if jsonb_typeof(tier->'upToGmv') <> 'null' then raise exception 'Invalid agency tiers'; end if;
       else
         if jsonb_typeof(tier->'upToGmv') <> 'number' then raise exception 'Invalid agency tiers'; end if;
         tier_bound := (tier->>'upToGmv')::numeric;
         if tier_bound <= prior_bound or tier_bound > 100000000000 or tier_bound <> round(tier_bound,2) then raise exception 'Invalid agency tiers'; end if;
         prior_bound := tier_bound;
       end if;
     end loop;
   elsif item ?| array['revShareTiers','tierCalculation','gmvBasis'] then
     raise exception 'Invalid agency tiers';
   end if;
 end loop;
 if (select count(distinct t->>'effectiveMonth') from jsonb_array_elements(p_payload->'terms') t) <> jsonb_array_length(p_payload->'terms') then raise exception 'Invalid agency terms'; end if;
 select coalesce(jsonb_agg(t order by t->>'effectiveMonth'), '[]'::jsonb) into normalized_terms from jsonb_array_elements(p_payload->'terms') t;

 -- All saves for a tenant serialize, covering new IDs and cross-client brand reassignments.
 perform pg_advisory_xact_lock(hashtextextended('agency_business:' || p_tenant_id::text, 0));
 select revision, snapshot into previous, previous_snapshot from public.agency_business_client_revisions
 where tenant_id = p_tenant_id and client_id = target order by revision desc limit 1;
 if coalesce(previous,0) <> expected then raise exception 'Agency client changed. Reload before saving.'; end if;
 historical_client := coalesce((p_payload->>'historical')::boolean, (previous_snapshot->>'historical')::boolean, false);
 -- Lock owned brand rows against concurrent ownership changes until the revision commits.
 perform b.id from public.brands_v2 b where b.id = any(brand_ids) and b.tenant_id = p_tenant_id and b.parent_brand_id is null for share;
 if (select count(*) from public.brands_v2 b where b.id = any(brand_ids) and b.tenant_id = p_tenant_id and b.parent_brand_id is null) <> cardinality(brand_ids) then raise exception 'Invalid agency brands'; end if;
 if exists (
   select 1 from (select distinct on (client_id) client_id, snapshot from public.agency_business_client_revisions
     where tenant_id = p_tenant_id order by client_id, revision desc) c,
     lateral jsonb_array_elements_text(c.snapshot->'brandIds') b
   where c.client_id <> target and b::uuid = any(brand_ids)
 ) then raise exception 'Agency brand already belongs to another client'; end if;
 result := jsonb_build_object('id',target,'revision',expected+1,'name',client_name,'historical',historical_client,'brandIds',to_jsonb(brand_ids),
   'serviceStart',started,'serviceEnd',ended,'exitReason',reason,'terms',normalized_terms,'updatedAt',clock_timestamp());
 insert into public.agency_business_client_revisions(tenant_id,client_id,revision,actor_id,snapshot)
 values(p_tenant_id,target,expected+1,p_actor_id,result);
 return result;
exception
 when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
   raise exception 'Invalid agency client';
end $$;
revoke all on function public.agency_business_save_client(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.agency_business_save_client(uuid,uuid,jsonb) to service_role;


create or replace function public.agency_manager_canonical(p_term jsonb) returns jsonb
language plpgsql immutable security invoker set search_path=pg_catalog,public,pg_temp as $$
declare result jsonb; allocations jsonb;
begin
 if jsonb_typeof(p_term) is distinct from 'object' then raise exception 'Invalid finance manager arrangement'; end if;
 result:=p_term||jsonb_build_object('compensationModel',coalesce(p_term->'compensationModel','"additive"'::jsonb));
 if p_term ? 'allocations' then
  select coalesce(jsonb_agg(a||jsonb_build_object('compensationModel',coalesce(a->'compensationModel','"additive"'::jsonb)) order by n),'[]'::jsonb) into allocations
   from jsonb_array_elements(p_term->'allocations') with ordinality t(a,n);
  result:=jsonb_set(result,'{allocations}',allocations);
 end if;
 return result;
end $$;
revoke all on function public.agency_manager_canonical(jsonb) from public,anon,authenticated;
grant execute on function public.agency_manager_canonical(jsonb) to service_role;

create or replace function public.agency_finance_write(p_tenant_id uuid,p_actor_id uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare cid uuid; current_revision integer; result jsonb; invoice public.agency_client_invoices; action_date date; manager_term jsonb; allocation jsonb; arrangements jsonb; amount numeric; rate numeric; fixed_total numeric; rate_total numeric; client_snapshot jsonb; stored_settings jsonb; stored_settings_revision integer; selected_term jsonb; selected_manager jsonb;
 selected_period jsonb; billing_result jsonb; expected_snapshot jsonb; canonical_manager jsonb; manager_expected bigint; allocation_fixed bigint;
 allocation_share bigint; allocation_amount bigint; needed_gmv boolean; actual_gmv bigint; performance_row record; performance_count integer;
 month_start date; month_end date; range_start date; range_end date; creator_periods jsonb;
begin
 if not exists(select 1 from public.user_profiles where tenant_id=p_tenant_id and user_id=p_actor_id and role in ('owner','admin')) then raise exception 'Finance access denied'; end if;
 perform pg_advisory_xact_lock(hashtextextended('agency_business:'||p_tenant_id::text,0));
 if p_action in ('settings','draft') then
  cid:=(p_payload->>'clientId')::uuid;
  if not exists(select 1 from public.agency_business_client_revisions where tenant_id=p_tenant_id and client_id=cid) then raise exception 'Unknown finance client'; end if;
 end if;
 select snapshot into client_snapshot from public.agency_business_client_revisions where tenant_id=p_tenant_id and client_id=cid order by revision desc limit 1;
 -- Validate the complete pay arrangement at both settings save and invoice reservation.
 -- Recipients are user_profiles.user_id values scoped to this tenant, never team_member IDs.
 if p_action = 'settings' then
  if jsonb_typeof(p_payload->'settings') is distinct from 'object' then raise exception 'Invalid finance settings'; end if;
  if p_payload->'settings' ? 'creatorBillingPeriods' then
   creator_periods:=public.agency_creator_periods_normalize(p_payload->'settings'->'creatorBillingPeriods');
   p_payload:=jsonb_set(p_payload,'{settings,creatorBillingPeriods}',creator_periods);
  else
   select settings->'creatorBillingPeriods' into creator_periods from public.agency_finance_settings where tenant_id=p_tenant_id and client_id=cid;
   if creator_periods is not null then p_payload:=jsonb_set(p_payload,'{settings,creatorBillingPeriods}',creator_periods); end if;
  end if;
  if jsonb_typeof(p_payload->'settings') is distinct from 'object' or jsonb_typeof(p_payload->'settings'->'managerTerms') is distinct from 'array' then raise exception 'Invalid finance settings'; end if;
  arrangements := p_payload->'settings'->'managerTerms';
  if jsonb_array_length(arrangements) > 240 or (select count(distinct t->>'effectiveMonth') from jsonb_array_elements(arrangements) t) <> jsonb_array_length(arrangements) then raise exception 'Invalid finance manager arrangement'; end if;
 elsif p_action = 'draft' then
  if jsonb_typeof(p_payload->'snapshot'->'manager') is distinct from 'object' then raise exception 'Invalid finance manager arrangement'; end if;
  arrangements := jsonb_build_array(p_payload->'snapshot'->'manager');
 else arrangements := '[]'::jsonb;
 end if;
 for manager_term in select value from jsonb_array_elements(arrangements) loop
  if jsonb_typeof(manager_term) <> 'object' then raise exception 'Invalid finance manager arrangement'; end if;
  if not manager_term ?& array['effectiveMonth','managerId','fixedMonthly','gmvPercent','payoutDays']
   or exists(select 1 from jsonb_object_keys(manager_term) k where k not in ('effectiveMonth','managerId','fixedMonthly','gmvPercent','payoutDays','compensationModel','allocations','servicePeriod'))
   or jsonb_typeof(manager_term->'effectiveMonth') <> 'string' or manager_term->>'effectiveMonth' !~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$'
   or jsonb_typeof(manager_term->'managerId') <> 'string' or jsonb_typeof(manager_term->'fixedMonthly') <> 'number'
   or jsonb_typeof(manager_term->'gmvPercent') <> 'number' or jsonb_typeof(manager_term->'payoutDays') <> 'number' or (manager_term->>'payoutDays')::numeric <> 7
  then raise exception 'Invalid finance manager arrangement'; end if;
  if manager_term ? 'servicePeriod' then
   if p_action = 'draft' and (manager_term->>'effectiveMonth') is distinct from (p_payload->>'month') then raise exception 'Invalid finance manager service month'; end if;
   perform public.agency_validate_service_period(manager_term->'servicePeriod',manager_term->>'effectiveMonth',client_snapshot);
  end if;
  amount := (manager_term->>'fixedMonthly')::numeric; rate := (manager_term->>'gmvPercent')::numeric;
  if amount < 0 or amount > 100000000 or amount <> round(amount,2) or rate < 0 or rate > 100 or rate <> round(rate,2)
   then raise exception 'Invalid finance manager arrangement'; end if;
  if manager_term ? 'compensationModel' and (jsonb_typeof(manager_term->'compensationModel') <> 'string' or manager_term->>'compensationModel' not in ('additive','minimum')) then raise exception 'Invalid finance manager arrangement'; end if;
  if not exists(select 1 from public.user_profiles u where u.tenant_id=p_tenant_id and u.user_id=(manager_term->>'managerId')::uuid and u.role in ('owner','admin','manager')) then raise exception 'Invalid finance manager'; end if;
  if manager_term ? 'allocations' then
   if jsonb_typeof(manager_term->'allocations') is distinct from 'array' then raise exception 'Invalid finance manager allocations'; end if;
   if jsonb_array_length(manager_term->'allocations') < 1 or jsonb_array_length(manager_term->'allocations') > 20
    or coalesce(manager_term->>'compensationModel','additive') <> 'additive'
    then raise exception 'Invalid finance manager allocations'; end if;
   fixed_total := 0; rate_total := 0;
   for allocation in select value from jsonb_array_elements(manager_term->'allocations') loop
    if jsonb_typeof(allocation) <> 'object' then raise exception 'Invalid finance manager allocations'; end if;
    if not allocation ?& array['managerId','fixedMonthly','gmvPercent']
     or exists(select 1 from jsonb_object_keys(allocation) k where k not in ('managerId','fixedMonthly','gmvPercent','compensationModel'))
     or jsonb_typeof(allocation->'managerId') <> 'string' or jsonb_typeof(allocation->'fixedMonthly') <> 'number' or jsonb_typeof(allocation->'gmvPercent') <> 'number'
     then raise exception 'Invalid finance manager allocations'; end if;
    if allocation ? 'compensationModel' and (jsonb_typeof(allocation->'compensationModel') <> 'string' or allocation->>'compensationModel' not in ('additive','minimum')) then raise exception 'Invalid finance manager allocations'; end if;
    amount := (allocation->>'fixedMonthly')::numeric; rate := (allocation->>'gmvPercent')::numeric;
    if amount < 0 or amount > 100000000 or amount <> round(amount,2) or rate < 0 or rate > 100 or rate <> round(rate,2) then raise exception 'Invalid finance manager allocations'; end if;
    if not exists(select 1 from public.user_profiles u where u.tenant_id=p_tenant_id and u.user_id=(allocation->>'managerId')::uuid and u.role in ('owner','admin','manager')) then raise exception 'Invalid finance manager'; end if;
    fixed_total := fixed_total + amount; rate_total := rate_total + rate;
   end loop;
   if (select count(distinct (a->>'managerId')::uuid) from jsonb_array_elements(manager_term->'allocations') a) <> jsonb_array_length(manager_term->'allocations')
    or (manager_term->'allocations'->0->>'managerId')::uuid <> (manager_term->>'managerId')::uuid
    or fixed_total <> (manager_term->>'fixedMonthly')::numeric or rate_total <> (manager_term->>'gmvPercent')::numeric
    then raise exception 'Invalid finance manager allocations'; end if;
  end if;
 end loop;
 if p_action='settings' then
  select revision into current_revision from public.agency_finance_settings where tenant_id=p_tenant_id and client_id=cid;
  if coalesce(current_revision,0)<>(p_payload->>'expectedRevision')::integer then raise exception 'Finance revision conflict'; end if;
  insert into public.agency_finance_settings values(p_tenant_id,cid,coalesce(current_revision,0)+1,p_payload->'settings')
  on conflict(tenant_id,client_id) do update set revision=excluded.revision,settings=excluded.settings returning to_jsonb(agency_finance_settings.*) into result;
 elsif p_action='draft' then
  if (select max(revision) from public.agency_business_client_revisions where tenant_id=p_tenant_id and client_id=cid)<>(p_payload->'snapshot'->>'clientRevision')::integer
   or (select revision from public.agency_finance_settings where tenant_id=p_tenant_id and client_id=cid) is distinct from (p_payload->'snapshot'->>'settingsRevision')::integer then raise exception 'Finance revision conflict'; end if;
  select t into selected_term from jsonb_array_elements(coalesce(client_snapshot->'terms','[]'::jsonb)) t
   where t->>'effectiveMonth'<=p_payload->>'month' order by t->>'effectiveMonth' desc limit 1;
  if selected_term ? 'servicePeriod' and selected_term->>'effectiveMonth' is distinct from p_payload->>'month' then selected_term:=null; end if;
  if selected_term->>'feeModel'='per_creator' or p_payload->'snapshot'->'agencyTerms'->>'feeModel'='per_creator' or p_payload->'snapshot' ? 'creatorBilling' then
   if selected_term->>'feeModel' is distinct from 'per_creator' or p_payload->'snapshot'->'agencyTerms' is distinct from selected_term then raise exception 'Invalid creator billing agency terms'; end if;
   if jsonb_typeof(p_payload->'month') is distinct from 'string' or p_payload->>'month' !~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$'
    or p_payload->>'month'>=to_char((current_timestamp at time zone 'America/Chicago')::date,'YYYY-MM') then raise exception 'Invalid creator billing invoice month'; end if;
   month_start:=((p_payload->>'month')||'-01')::date; month_end:=(month_start+interval '1 month - 1 day')::date;
   select revision,settings into stored_settings_revision,stored_settings from public.agency_finance_settings where tenant_id=p_tenant_id and client_id=cid;
   if coalesce((stored_settings->>'termsReviewRequired')::boolean,false) then raise exception 'Invalid creator billing agreement review'; end if;
   creator_periods:=public.agency_creator_periods_normalize(coalesce(stored_settings->'creatorBillingPeriods','[]'::jsonb));
   select t into selected_period from jsonb_array_elements(creator_periods) t where t->>'month'=p_payload->>'month';
   billing_result:=public.agency_creator_billing_calculate(client_snapshot,selected_term,selected_period,p_payload->>'month',month_end);
   if (billing_result->>'blocked')::boolean then raise exception 'Invalid creator billing confirmed roster or approvals'; end if;
   expected_snapshot:=jsonb_build_object('settingsRevision',stored_settings_revision,'period',selected_period,'result',billing_result);
   if p_payload->'snapshot'->'creatorBilling' is distinct from expected_snapshot
    or p_payload->'snapshot'->'feeCents' is distinct from billing_result->'feeCents' then raise exception 'Invalid creator billing invoice calculation'; end if;
   select t into selected_manager from jsonb_array_elements(coalesce(stored_settings->'managerTerms','[]'::jsonb)) t
    where t->>'effectiveMonth'<=p_payload->>'month' order by t->>'effectiveMonth' desc limit 1;
   if selected_manager is null or (selected_manager ? 'servicePeriod' and selected_manager->>'effectiveMonth' is distinct from p_payload->>'month') then raise exception 'Invalid creator billing manager arrangement'; end if;
   range_start:=greatest(month_start,(client_snapshot->>'serviceStart')::date);
   range_end:=least(month_end,coalesce((client_snapshot->>'serviceEnd')::date,month_end));
   if (range_start>month_start or range_end<month_end) and not selected_manager ? 'servicePeriod' then raise exception 'Invalid creator billing approved manager service period'; end if;
   if selected_manager ? 'servicePeriod' then perform public.agency_validate_service_period(selected_manager->'servicePeriod',selected_manager->>'effectiveMonth',client_snapshot); end if;
   canonical_manager:=public.agency_manager_canonical(selected_manager);
   if public.agency_manager_canonical(p_payload->'snapshot'->'manager') is distinct from canonical_manager then raise exception 'Invalid creator billing manager arrangement'; end if;
   arrangements:=coalesce(canonical_manager->'allocations',jsonb_build_array(canonical_manager));
   select coalesce(bool_or((a->>'gmvPercent')::numeric<>0),false) into needed_gmv from jsonb_array_elements(arrangements) a;
   actual_gmv:=0;
   if needed_gmv then
    if jsonb_typeof(client_snapshot->'brandIds') is distinct from 'array' or jsonb_array_length(client_snapshot->'brandIds')=0 then raise exception 'Invalid creator billing complete manager GMV'; end if;
    range_start:=greatest(month_start,(client_snapshot->>'serviceStart')::date);
    range_end:=least(month_end,coalesce((client_snapshot->>'serviceEnd')::date,month_end));
    if range_start>range_end then raise exception 'Invalid creator billing complete manager GMV'; end if;
    performance_count:=0;
    for performance_row in select p.* from public.agency_business_range_performance(p_tenant_id,month_start,range_start,range_end) p
     where p.brand_id in (select b::uuid from jsonb_array_elements_text(client_snapshot->'brandIds') b) loop
     if performance_row.complete is distinct from true or performance_row.managed_gmv is null or performance_row.managed_gmv<0 then raise exception 'Invalid creator billing complete manager GMV'; end if;
     actual_gmv:=actual_gmv+round(performance_row.managed_gmv*100)::bigint; performance_count:=performance_count+1;
    end loop;
    if performance_count<>jsonb_array_length(client_snapshot->'brandIds') or p_payload->'snapshot'->'gmvCents' is distinct from to_jsonb(actual_gmv) then raise exception 'Invalid creator billing complete manager GMV'; end if;
   elsif p_payload->'snapshot'->'gmvCents' is distinct from 'null'::jsonb then raise exception 'Invalid creator billing manager GMV'; end if;
   manager_expected:=0;
   for allocation in select value from jsonb_array_elements(arrangements) loop
    allocation_fixed:=round((allocation->>'fixedMonthly')::numeric*100)::bigint;
    allocation_share:=round(actual_gmv*(allocation->>'gmvPercent')::numeric/100)::bigint;
    allocation_amount:=case when allocation->>'compensationModel'='minimum' then greatest(allocation_fixed,allocation_share) else allocation_fixed+allocation_share end;
    manager_expected:=manager_expected+allocation_amount;
   end loop;
   if p_payload->'snapshot'->'managerCents' is distinct from to_jsonb(manager_expected) then raise exception 'Invalid creator billing manager calculation'; end if;
  end if;
  if coalesce((select (snapshot->>'historical')::boolean from public.agency_business_client_revisions
    where tenant_id=p_tenant_id and client_id=cid order by revision desc limit 1),false)
   then raise exception 'Invalid historical finance client'; end if;
  insert into public.agency_client_invoices(tenant_id,client_id,month,snapshot) values(p_tenant_id,cid,p_payload->>'month',p_payload->'snapshot') returning to_jsonb(agency_client_invoices.*) into result;
 else
  select * into invoice from public.agency_client_invoices where tenant_id=p_tenant_id and id=(p_payload->>'id')::uuid for update;
  if not found then raise exception 'Unknown finance invoice'; end if;
  if invoice.revision<>(p_payload->>'expectedRevision')::integer then raise exception 'Finance revision conflict'; end if;
  if p_action='issue' and invoice.status='draft' then
   if coalesce((select (snapshot->>'historical')::boolean from public.agency_business_client_revisions
     where tenant_id=p_tenant_id and client_id=invoice.client_id order by revision desc limit 1),false)
    then raise exception 'Invalid historical finance client'; end if;
   invoice.status:='issued';
  elsif p_action='collect' and invoice.status='issued' then
   action_date:=(p_payload->>'date')::date;
   if action_date is null or action_date>current_date or action_date<(invoice.snapshot->>'issuedDate')::date then raise exception 'Invalid collection date'; end if;
   invoice.status:='paid'; invoice.collected_on:=action_date;
  elsif p_action='pay' and invoice.status='paid' and invoice.manager_paid_on is null then
   action_date:=(p_payload->>'date')::date;
   if action_date is null or action_date>current_date or action_date<invoice.collected_on then raise exception 'Invalid payment date'; end if;
   invoice.manager_paid_on:=action_date;
  elsif p_action='void' and invoice.status in ('draft','issued') then invoice.status:='void';
  else raise exception 'Invalid finance transition'; end if;
  update public.agency_client_invoices set status=invoice.status,collected_on=invoice.collected_on,manager_paid_on=invoice.manager_paid_on,revision=revision+1 where id=invoice.id and tenant_id=p_tenant_id returning to_jsonb(agency_client_invoices.*) into result;
 end if;
 insert into public.agency_finance_audit(tenant_id,actor_id,entity_id,kind,snapshot) values(p_tenant_id,p_actor_id,coalesce((result->>'id')::uuid,cid),p_action,result);
 return result;
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Invalid finance manager arrangement';
end $$;
revoke all on function public.agency_finance_write(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.agency_finance_write(uuid,uuid,text,jsonb) to service_role;


