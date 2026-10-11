-- One transaction for identity, accountable manager and access.
create function public.save_brand_setup(p_tenant uuid,p_actor uuid,p_brand uuid,p_name text,p_slug text,p_manager uuid)
returns uuid language plpgsql security invoker set search_path=public as $$
declare v_brand uuid;
begin
 if not exists(select 1 from user_profiles where user_id=p_actor and tenant_id=p_tenant and role in ('owner','admin') and status='active') then raise exception 'Brand setup requires an active administrator'; end if;
 if p_manager is not null and not exists(select 1 from user_profiles where user_id=p_manager and tenant_id=p_tenant and role in ('owner','admin','manager') and status='active') then raise exception 'Manager is not available in this workspace'; end if;
 if p_brand is null then
  if p_name is null or length(trim(p_name)) not between 1 and 120 or p_slug is null or p_slug !~ '^[a-z0-9_]{1,80}$' then raise exception 'Invalid brand identity'; end if;
  insert into brands_v2(tenant_id,name,display_name,slug,is_archived,is_umbrella) values(p_tenant,trim(p_name),trim(p_name),p_slug,false,false) returning id into v_brand;
 else
  select id into v_brand from brands_v2 where id=p_brand and tenant_id=p_tenant and not is_archived for update;
  if v_brand is null then raise exception 'Brand is unavailable'; end if;
 end if;
 if p_manager is not null then
  insert into user_brand_access(user_id,brand_id,tenant_id) values(p_manager,v_brand,p_tenant) on conflict do nothing;
  insert into brand_manager_assignments(brand_id,manager_user_id,assigned_by) values(v_brand,p_manager,p_actor::text)
  on conflict(brand_id) do update set manager_user_id=excluded.manager_user_id,assigned_by=excluded.assigned_by,updated_at=now();
 end if;
 return v_brand;
end $$;
revoke all on function public.save_brand_setup(uuid,uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.save_brand_setup(uuid,uuid,uuid,text,text,uuid) to service_role;
