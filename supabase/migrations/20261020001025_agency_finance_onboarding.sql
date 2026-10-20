-- Leadership-only agency receivables. Existing individual-payee invoices are unchanged.
create table public.agency_finance_settings (
 tenant_id uuid not null references public.tenants(id), client_id uuid not null,
 revision integer not null check (revision > 0), settings jsonb not null check (jsonb_typeof(settings)='object'),
 primary key(tenant_id,client_id)
);
create table public.agency_client_invoices (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), client_id uuid not null,
 month text not null check(month ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$'), revision integer not null default 1,
 status text not null default 'draft' check(status in ('draft','issued','paid','void')),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'), collected_on date, manager_paid_on date,
 created_at timestamptz not null default now(),
 check((status='paid')=(collected_on is not null)), check(manager_paid_on is null or (collected_on is not null and manager_paid_on>=collected_on))
);
create unique index agency_client_invoice_period on public.agency_client_invoices(tenant_id,client_id,month) where status<>'void';
create index agency_client_invoice_tenant on public.agency_client_invoices(tenant_id,created_at);
create table public.agency_finance_audit (
 id bigint generated always as identity primary key, tenant_id uuid not null references public.tenants(id),
 actor_id uuid not null, entity_id uuid not null, kind text not null, snapshot jsonb not null, created_at timestamptz not null default now()
);
create index agency_finance_audit_tenant on public.agency_finance_audit(tenant_id,entity_id);
create table public.agency_contracts (
 id uuid primary key, tenant_id uuid not null references public.tenants(id), client_id uuid not null,
 name text not null check(length(name) between 1 and 200), storage_path text not null unique,
 uploaded_by uuid not null, created_at timestamptz not null default now(), extraction jsonb
);
create index agency_contracts_client on public.agency_contracts(tenant_id,client_id);
alter table public.agency_finance_settings enable row level security;
alter table public.agency_client_invoices enable row level security;
alter table public.agency_finance_audit enable row level security;
alter table public.agency_contracts enable row level security;
revoke all on public.agency_finance_settings, public.agency_client_invoices, public.agency_finance_audit, public.agency_contracts from public,anon,authenticated,service_role;
grant select,insert,update on public.agency_finance_settings, public.agency_client_invoices, public.agency_contracts to service_role;
grant select,insert on public.agency_finance_audit to service_role;
grant usage on sequence public.agency_finance_audit_id_seq to service_role;
create trigger agency_finance_audit_immutable before update or delete on public.agency_finance_audit for each row execute function public.agency_business_immutable_revision();

create or replace function public.agency_finance_write(p_tenant_id uuid,p_actor_id uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare cid uuid; current_revision integer; result jsonb; invoice public.agency_client_invoices; action_date date;
begin
 if not exists(select 1 from public.user_profiles where tenant_id=p_tenant_id and user_id=p_actor_id and role in ('owner','admin')) then raise exception 'Finance access denied'; end if;
 perform pg_advisory_xact_lock(hashtextextended('agency_business:'||p_tenant_id::text,0));
 if p_action in ('settings','draft') then
  cid:=(p_payload->>'clientId')::uuid;
  if not exists(select 1 from public.agency_business_client_revisions where tenant_id=p_tenant_id and client_id=cid) then raise exception 'Unknown finance client'; end if;
 end if;
 if p_action='settings' then
  select revision into current_revision from public.agency_finance_settings where tenant_id=p_tenant_id and client_id=cid;
  if coalesce(current_revision,0)<>(p_payload->>'expectedRevision')::integer then raise exception 'Finance revision conflict'; end if;
  if jsonb_typeof(p_payload->'settings')<>'object' or jsonb_typeof(p_payload->'settings'->'managerTerms')<>'array' then raise exception 'Invalid finance settings'; end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'settings'->'managerTerms') t where not exists(select 1 from public.user_profiles u where u.tenant_id=p_tenant_id and u.user_id=(t->>'managerId')::uuid and u.role in ('owner','admin','manager'))) then raise exception 'Invalid finance manager'; end if;
  insert into public.agency_finance_settings values(p_tenant_id,cid,coalesce(current_revision,0)+1,p_payload->'settings')
  on conflict(tenant_id,client_id) do update set revision=excluded.revision,settings=excluded.settings returning to_jsonb(agency_finance_settings.*) into result;
 elsif p_action='draft' then
  if (select max(revision) from public.agency_business_client_revisions where tenant_id=p_tenant_id and client_id=cid)<>(p_payload->'snapshot'->>'clientRevision')::integer
   or (select revision from public.agency_finance_settings where tenant_id=p_tenant_id and client_id=cid) is distinct from (p_payload->'snapshot'->>'settingsRevision')::integer then raise exception 'Finance revision conflict'; end if;
  insert into public.agency_client_invoices(tenant_id,client_id,month,snapshot) values(p_tenant_id,cid,p_payload->>'month',p_payload->'snapshot') returning to_jsonb(agency_client_invoices.*) into result;
 else
  select * into invoice from public.agency_client_invoices where tenant_id=p_tenant_id and id=(p_payload->>'id')::uuid for update;
  if not found then raise exception 'Unknown finance invoice'; end if;
  if invoice.revision<>(p_payload->>'expectedRevision')::integer then raise exception 'Finance revision conflict'; end if;
  if p_action='issue' and invoice.status='draft' then
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
end $$;
revoke all on function public.agency_finance_write(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.agency_finance_write(uuid,uuid,text,jsonb) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('agency-contracts','agency-contracts',false,4000000,array['application/pdf']) on conflict(id) do nothing;
