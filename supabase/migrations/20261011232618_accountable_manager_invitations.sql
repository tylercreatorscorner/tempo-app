-- New service-only entry point; does not change existing callers before release.
-- The accountability and access checks share the provisioning transaction.
create function public.provision_accountable_manager_invited_member(p_actor_id uuid,p_user_id uuid,p_email text,p_role text,p_brand_ids uuid[])
returns void language plpgsql security invoker set search_path='' as $$
declare v_tenant uuid; v_count integer;
begin
 select tenant_id into v_tenant from public.user_profiles where user_id=p_actor_id and role='manager' and status='active' for share;
 if v_tenant is null or p_brand_ids is null or cardinality(p_brand_ids) not between 1 and 32 then raise exception 'Invalid manager invitation' using errcode='42501'; end if;
 perform a.brand_id from public.brand_manager_assignments a join public.brands_v2 b on b.id=a.brand_id
 where a.manager_user_id=p_actor_id and b.tenant_id=v_tenant and not b.is_archived and b.id=any(p_brand_ids) for share of a,b;
 get diagnostics v_count=row_count;
 if v_count<>cardinality(p_brand_ids) then raise exception 'Only the assigned manager can invite users to this brand' using errcode='42501'; end if;
 perform public.provision_manager_invited_member(p_actor_id,p_user_id,p_email,p_role,p_brand_ids);
end $$;
revoke all on function public.provision_accountable_manager_invited_member(uuid,uuid,text,text,uuid[]) from public,anon,authenticated;
grant execute on function public.provision_accountable_manager_invited_member(uuid,uuid,text,text,uuid[]) to service_role;
