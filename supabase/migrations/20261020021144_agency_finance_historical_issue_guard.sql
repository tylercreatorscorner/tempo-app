-- The existing tenant advisory lock serializes invoice transitions with client archiving.
-- Historical records cannot create or issue drafts; issued collection and manager obligations remain payable.
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
end $$;
revoke all on function public.agency_finance_write(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.agency_finance_write(uuid,uuid,text,jsonb) to service_role;
