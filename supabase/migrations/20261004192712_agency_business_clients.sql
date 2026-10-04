-- Agency business foundation. No backfill from sales or payee earnings: neither proves client service or agency revenue.
-- App handlers enforce workspace leadership/financial permission before using these service-only RPCs.
create table public.agency_business_client_revisions (
 tenant_id uuid not null references public.tenants(id),
 client_id uuid not null,
 revision integer not null check (revision > 0),
 actor_id uuid not null,
 snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
 created_at timestamptz not null default clock_timestamp(),
 primary key (tenant_id, client_id, revision)
);
alter table public.agency_business_client_revisions enable row level security;
revoke all on public.agency_business_client_revisions from public, anon, authenticated, service_role;
grant select, insert on public.agency_business_client_revisions to service_role;

create function public.agency_business_immutable_revision() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
 raise exception 'Agency client revisions are immutable';
end $$;
create trigger agency_business_immutable_revision before update or delete on public.agency_business_client_revisions
for each row execute function public.agency_business_immutable_revision();
revoke all on function public.agency_business_immutable_revision() from public, anon, authenticated;

create function public.agency_business_list_clients(p_tenant_id uuid) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare result jsonb;
begin
 if p_tenant_id is null then raise exception 'Invalid agency scope'; end if;
 select coalesce(jsonb_agg(c.snapshot order by lower(c.snapshot->>'name'), c.client_id), '[]'::jsonb) into result
 from (select distinct on (client_id) client_id, snapshot from public.agency_business_client_revisions
       where tenant_id = p_tenant_id order by client_id, revision desc) c;
 return result;
end $$;
revoke all on function public.agency_business_list_clients(uuid) from public, anon, authenticated;
grant execute on function public.agency_business_list_clients(uuid) to service_role;

create function public.agency_business_save_client(p_tenant_id uuid, p_actor_id uuid, p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
 target uuid; expected integer; previous integer; client_name text; started date; ended date; reason text;
 brand_ids uuid[]; item jsonb; amount numeric; rate numeric; result jsonb; normalized_terms jsonb;
begin
 if p_tenant_id is null or p_actor_id is null or not exists (
   select 1 from public.user_profiles where user_id = p_actor_id and tenant_id = p_tenant_id and role in ('owner','admin')
 ) then raise exception 'Invalid agency scope'; end if;
 if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Invalid agency client'; end if;
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in
   ('id','expectedRevision','name','brandIds','serviceStart','serviceEnd','exitReason','terms'))
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
 if jsonb_typeof(p_payload->'brandIds') <> 'array' then raise exception 'Invalid agency brands'; end if;
 if jsonb_array_length(p_payload->'brandIds') > 100 then raise exception 'Invalid agency brands'; end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'brandIds') b where jsonb_typeof(b) <> 'string'
   or b #>> '{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then raise exception 'Invalid agency brands'; end if;
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
     or exists(select 1 from jsonb_object_keys(item) k where k not in ('effectiveMonth','monthlyRetainer','revSharePercent','feeModel'))
   then raise exception 'Invalid agency terms'; end if;
   if jsonb_typeof(item->'effectiveMonth') <> 'string' or item->>'effectiveMonth' !~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$'
     or jsonb_typeof(item->'monthlyRetainer') <> 'number' or jsonb_typeof(item->'revSharePercent') <> 'number'
     or jsonb_typeof(item->'feeModel') <> 'string' or item->>'feeModel' not in ('fixed','share','additive','minimum')
   then raise exception 'Invalid agency terms'; end if;
   amount := (item->>'monthlyRetainer')::numeric; rate := (item->>'revSharePercent')::numeric;
   if amount < 0 or amount > 100000000 or amount <> round(amount,2) or rate < 0 or rate > 100 or rate <> round(rate,2) then raise exception 'Invalid agency terms'; end if;
 end loop;
 if (select count(distinct t->>'effectiveMonth') from jsonb_array_elements(p_payload->'terms') t) <> jsonb_array_length(p_payload->'terms') then raise exception 'Invalid agency terms'; end if;
 select coalesce(jsonb_agg(t order by t->>'effectiveMonth'), '[]'::jsonb) into normalized_terms from jsonb_array_elements(p_payload->'terms') t;

 -- All saves for a tenant serialize, covering new IDs and cross-client brand reassignments.
 perform pg_advisory_xact_lock(hashtextextended('agency_business:' || p_tenant_id::text, 0));
 select revision into previous from public.agency_business_client_revisions
 where tenant_id = p_tenant_id and client_id = target order by revision desc limit 1;
 if coalesce(previous,0) <> expected then raise exception 'Agency client changed. Reload before saving.'; end if;
 -- Lock owned brand rows against concurrent ownership changes until the revision commits.
 perform b.id from public.brands_v2 b where b.id = any(brand_ids) and b.tenant_id = p_tenant_id and b.parent_brand_id is null for share;
 if (select count(*) from public.brands_v2 b where b.id = any(brand_ids) and b.tenant_id = p_tenant_id and b.parent_brand_id is null) <> cardinality(brand_ids) then raise exception 'Invalid agency brands'; end if;
 if exists (
   select 1 from (select distinct on (client_id) client_id, snapshot from public.agency_business_client_revisions
     where tenant_id = p_tenant_id order by client_id, revision desc) c,
     lateral jsonb_array_elements_text(c.snapshot->'brandIds') b
   where c.client_id <> target and b::uuid = any(brand_ids)
 ) then raise exception 'Agency brand already belongs to another client'; end if;
 result := jsonb_build_object('id',target,'revision',expected+1,'name',client_name,'brandIds',to_jsonb(brand_ids),
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
