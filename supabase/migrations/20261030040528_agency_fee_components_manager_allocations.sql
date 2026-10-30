-- Add gross client fee components and effective manager allocation terms.
-- No existing JSON, immutable invoice snapshots, revisions, audit events, or payment records are rewritten.
-- Archive past agreements without inventing service start/end dates or changing issued obligations.
-- Omitted flags preserve the previous value for older callers; legacy clients default to current.
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
     or exists(select 1 from jsonb_object_keys(item) k where k not in ('effectiveMonth','monthlyRetainer','revSharePercent','feeModel','revShareTiers','tierCalculation','gmvBasis','managerComponent'))
   then raise exception 'Invalid agency terms'; end if;
   if jsonb_typeof(item->'effectiveMonth') <> 'string' or item->>'effectiveMonth' !~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$'
     or jsonb_typeof(item->'monthlyRetainer') <> 'number' or jsonb_typeof(item->'revSharePercent') <> 'number'
     or jsonb_typeof(item->'feeModel') <> 'string' or item->>'feeModel' not in ('fixed','share','additive','minimum','tiered','components')
   then raise exception 'Invalid agency terms'; end if;
   amount := (item->>'monthlyRetainer')::numeric; rate := (item->>'revSharePercent')::numeric;
   if amount < 0 or amount > 100000000 or amount <> round(amount,2) or rate < 0 or rate > 100 or rate <> round(rate,2) then raise exception 'Invalid agency terms'; end if;
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

-- The existing tenant advisory lock serializes invoice transitions with client archiving.
-- Historical records cannot create or issue drafts; issued collection and manager obligations remain payable.
create or replace function public.agency_finance_write(p_tenant_id uuid,p_actor_id uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare cid uuid; current_revision integer; result jsonb; invoice public.agency_client_invoices; action_date date; manager_term jsonb; allocation jsonb; arrangements jsonb; amount numeric; rate numeric; fixed_total numeric; rate_total numeric;
begin
 if not exists(select 1 from public.user_profiles where tenant_id=p_tenant_id and user_id=p_actor_id and role in ('owner','admin')) then raise exception 'Finance access denied'; end if;
 perform pg_advisory_xact_lock(hashtextextended('agency_business:'||p_tenant_id::text,0));
 if p_action in ('settings','draft') then
  cid:=(p_payload->>'clientId')::uuid;
  if not exists(select 1 from public.agency_business_client_revisions where tenant_id=p_tenant_id and client_id=cid) then raise exception 'Unknown finance client'; end if;
 end if;
 -- Validate the complete pay arrangement at both settings save and invoice reservation.
 -- Recipients are user_profiles.user_id values scoped to this tenant, never team_member IDs.
 if p_action = 'settings' then
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
   or exists(select 1 from jsonb_object_keys(manager_term) k where k not in ('effectiveMonth','managerId','fixedMonthly','gmvPercent','payoutDays','compensationModel','allocations'))
   or jsonb_typeof(manager_term->'effectiveMonth') <> 'string' or manager_term->>'effectiveMonth' !~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$'
   or jsonb_typeof(manager_term->'managerId') <> 'string' or jsonb_typeof(manager_term->'fixedMonthly') <> 'number'
   or jsonb_typeof(manager_term->'gmvPercent') <> 'number' or jsonb_typeof(manager_term->'payoutDays') <> 'number' or (manager_term->>'payoutDays')::numeric <> 7
  then raise exception 'Invalid finance manager arrangement'; end if;
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
