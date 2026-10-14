-- Deliberately not inferred from Admin, brand access, or finance permissions.
-- Designations are provisioned by trusted server administration, never a client.
create table public.agency_leadership_access (
 tenant_id uuid not null references public.tenants(id),
 user_id uuid not null,
 designation text not null check (designation in ('owner','vp')),
 created_at timestamptz not null default now(),
 primary key (tenant_id,user_id)
);
alter table public.agency_leadership_access enable row level security;
revoke all on public.agency_leadership_access from public,anon,authenticated;
grant select,insert,update,delete on public.agency_leadership_access to service_role;

create function public.agency_is_leadership(p_tenant_id uuid,p_user_id uuid) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.user_profiles p
 where p.tenant_id=p_tenant_id and p.user_id=p_user_id
 and (p.role='owner' or (p.role='admin' and exists(
 select 1 from public.agency_leadership_access a
 where a.tenant_id=p.tenant_id and a.user_id=p.user_id
 and a.designation in ('owner','vp')))));
$$;
revoke all on function public.agency_is_leadership(uuid,uuid) from public,anon,authenticated;
grant execute on function public.agency_is_leadership(uuid,uuid) to service_role;

-- Defense in depth for both existing write RPCs, including callers running
-- an earlier app build. Read RPCs remain service-only behind the app gate.
create function public.agency_require_leadership_write() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not public.agency_is_leadership(new.tenant_id,new.actor_id) then
  raise exception 'Invalid agency scope';
 end if;
 return new;
end $$;
revoke all on function public.agency_require_leadership_write() from public,anon,authenticated;
grant execute on function public.agency_require_leadership_write() to service_role;
create trigger agency_clients_leadership before insert on public.agency_business_client_revisions
 for each row execute function public.agency_require_leadership_write();
create trigger agency_billing_leadership before insert on public.agency_billing_revisions
 for each row execute function public.agency_require_leadership_write();
