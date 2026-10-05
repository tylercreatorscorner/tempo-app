-- Append-only agency billing. Application routes are the transition authority; no client grants.
create table public.agency_billing_revisions (
 tenant_id uuid not null references public.tenants(id), client_id uuid not null,
 service_month date not null check (extract(day from service_month)=1),
 revision integer not null check(revision>0), actor_id uuid not null,
 request_id uuid not null, request_hash text not null check(length(request_hash)=64),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 created_at timestamptz not null default clock_timestamp(),
 primary key(tenant_id,client_id,service_month,revision), unique(tenant_id,request_id)
);
alter table public.agency_billing_revisions enable row level security;
revoke all on public.agency_billing_revisions from public, anon, authenticated, service_role;
grant select,insert on public.agency_billing_revisions to service_role;
create trigger agency_billing_immutable before update or delete on public.agency_billing_revisions
for each row execute function public.agency_business_immutable_revision();

create function public.agency_billing_list(p_tenant_id uuid,p_month date default null) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if (select count(*) from (select 1 from public.agency_billing_revisions where tenant_id=p_tenant_id and (p_month is null or service_month=p_month) limit 10001) bounded)>10000 then raise exception 'Billing history exceeds the current history limit'; end if;
 with versions as (
  select client_id,service_month,revision,snapshot from public.agency_billing_revisions
  where tenant_id=p_tenant_id and (p_month is null or service_month=p_month)
 ), latest as (
  select distinct on(client_id,service_month) * from versions order by client_id,service_month,revision desc
 ) select jsonb_build_object('records',coalesce((select jsonb_agg(snapshot order by service_month desc,client_id) from latest),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(snapshot order by service_month,client_id,revision) from versions),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.agency_billing_list(uuid,date) from public,anon,authenticated;
grant execute on function public.agency_billing_list(uuid,date) to service_role;

create function public.agency_billing_append(p_tenant_id uuid,p_actor_id uuid,p_client_id uuid,p_month date,
 p_expected_revision integer,p_request_id uuid,p_request_hash text,p_snapshot jsonb,p_client_revision integer default null) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare previous integer; client_version integer; retry public.agency_billing_revisions; action text; ref text;
begin
 if p_tenant_id is null or p_actor_id is null or not exists(select 1 from public.user_profiles where tenant_id=p_tenant_id and user_id=p_actor_id and role in('owner','admin')) then raise exception 'Invalid agency scope'; end if;
 if p_client_id is null or p_month is null or extract(day from p_month)<>1 or p_month>=date_trunc('month',now() at time zone 'America/Chicago')::date
 or p_expected_revision is null or p_expected_revision<0 or p_request_id is null or p_request_hash is null or p_request_hash!~'^[0-9a-f]{64}$'
 or p_snapshot is null or jsonb_typeof(p_snapshot)<>'object' or pg_column_size(p_snapshot)>500000 then raise exception 'Invalid agency billing'; end if;
 -- Same lock as client edits prevents review/client-revision races. Also serializes external references.
 perform pg_advisory_xact_lock(hashtextextended('agency_business:'||p_tenant_id::text,0));
 select * into retry from public.agency_billing_revisions where tenant_id=p_tenant_id and request_id=p_request_id;
 if found then
  if retry.actor_id<>p_actor_id or retry.request_hash<>p_request_hash then raise exception 'Billing request already used'; end if;
  return retry.snapshot;
 end if;
 select revision into client_version from public.agency_business_client_revisions where tenant_id=p_tenant_id and client_id=p_client_id order by revision desc limit 1;
 if client_version is null then raise exception 'Invalid agency client'; end if;
 if p_client_revision is not null and p_client_revision<>client_version then raise exception 'Agency client changed'; end if;
 select revision into previous from public.agency_billing_revisions where tenant_id=p_tenant_id and client_id=p_client_id and service_month=p_month order by revision desc limit 1;
 if coalesce(previous,0)<>p_expected_revision then raise exception 'Billing record changed'; end if;
 if p_snapshot->>'clientId' is distinct from p_client_id::text or p_snapshot->>'month' is distinct from to_char(p_month,'YYYY-MM')
 or (p_snapshot->>'revision')::integer is distinct from p_expected_revision+1
 or jsonb_typeof(p_snapshot->'events') is distinct from 'array'
 then raise exception 'Invalid agency billing snapshot'; end if;
 if jsonb_array_length(p_snapshot->'events')<>p_expected_revision+1 or p_snapshot->'events'->-1->>'actorId' is distinct from p_actor_id::text then raise exception 'Invalid agency billing audit'; end if;
 action:=p_snapshot->'events'->-1->>'action';
 if action is null or action not in('review','correct_review','invoice','void_invoice','receipt','reverse_receipt') then raise exception 'Invalid agency billing action'; end if;
 if action in('review','correct_review') and (p_client_revision is null or (p_snapshot->'evidence'->'client'->>'revision')::integer is distinct from p_client_revision) then raise exception 'Invalid agency billing evidence'; end if;
 -- External references remain reserved after void/reversal to prevent accidental duplicate books.
 if action='invoice' then
  ref:=trim(p_snapshot->'record'->'invoice'->>'reference');
  if ref is null or ref='' or exists(select 1 from public.agency_billing_revisions where tenant_id=p_tenant_id and lower(trim(snapshot->'record'->'invoice'->>'reference'))=lower(ref)) then raise exception 'Invoice reference already recorded'; end if;
 end if;
 if action='receipt' then
  ref:=trim(p_snapshot->'record'->'receipts'->-1->>'reference');
  if ref is null or ref='' or exists(select 1 from public.agency_billing_revisions r cross join lateral jsonb_array_elements(r.snapshot->'record'->'receipts') receipt where r.tenant_id=p_tenant_id and lower(trim(receipt->>'reference'))=lower(ref)) then raise exception 'Receipt reference already recorded'; end if;
 end if;
 insert into public.agency_billing_revisions(tenant_id,client_id,service_month,revision,actor_id,request_id,request_hash,snapshot)
 values(p_tenant_id,p_client_id,p_month,p_expected_revision+1,p_actor_id,p_request_id,p_request_hash,p_snapshot);
 return p_snapshot;
end $$;
revoke all on function public.agency_billing_append(uuid,uuid,uuid,date,integer,uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.agency_billing_append(uuid,uuid,uuid,date,integer,uuid,text,jsonb,integer) to service_role;
