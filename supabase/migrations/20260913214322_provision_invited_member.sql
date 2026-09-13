-- Actor ID is derived from the verified server session. Never callable by clients.
CREATE OR REPLACE FUNCTION public.provision_invited_member(
  p_actor_id uuid, p_user_id uuid, p_email text, p_role text,
  p_finance boolean, p_brand_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE actor_tenant uuid; target_tenant uuid; target_role text; account_email text;
BEGIN
  SELECT tenant_id INTO actor_tenant FROM public.user_profiles
    WHERE user_id=p_actor_id AND role IN ('owner','admin') FOR SHARE;
  IF actor_tenant IS NULL OR p_user_id IS NULL OR p_actor_id=p_user_id
    OR p_role IS NULL OR p_role NOT IN ('admin','manager','coach','brand') OR p_finance IS NULL THEN
    RAISE EXCEPTION 'Invalid invitation' USING ERRCODE='42501';
  END IF;
  SELECT email INTO account_email FROM auth.users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND OR account_email IS NULL OR p_email IS NULL OR lower(account_email)<>lower(p_email) THEN
    RAISE EXCEPTION 'Account changed. Retry invitation.' USING ERRCODE='42501';
  END IF;
  IF p_brand_id IS NOT NULL THEN
    IF p_role <> 'brand' THEN RAISE EXCEPTION 'Invalid contact role' USING ERRCODE='42501'; END IF;
    PERFORM id FROM public.brands_v2 WHERE id=p_brand_id AND tenant_id=actor_tenant FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Brand is not in your tenant' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT tenant_id,role INTO target_tenant,target_role FROM public.user_profiles WHERE user_id=p_user_id FOR UPDATE;
  IF FOUND THEN
    IF target_tenant IS DISTINCT FROM actor_tenant OR target_role IS NULL OR target_role='owner' THEN
      RAISE EXCEPTION 'Account cannot be invited to this team' USING ERRCODE='42501';
    END IF;
    IF p_brand_id IS NOT NULL THEN
      IF target_role NOT IN ('brand','brand_contact') THEN
        RAISE EXCEPTION 'Existing member is not a brand contact' USING ERRCODE='42501';
      END IF;
      -- Adding another client preserves an existing contact's role and access.
    ELSE
      UPDATE public.user_profiles SET role=p_role,role_id=NULL,status='active',
        can_view_finance=CASE WHEN p_role='coach' THEN false ELSE p_finance END
        WHERE user_id=p_user_id AND tenant_id=actor_tenant;
    END IF;
  ELSE
    -- Plain INSERT deliberately fails on a concurrent profile creation.
    INSERT INTO public.user_profiles(user_id,email,role,role_id,tenant_id,status,can_view_finance)
      VALUES(p_user_id,account_email,p_role,NULL,actor_tenant,'active',
        CASE WHEN p_role='coach' THEN false ELSE p_finance END);
  END IF;
  IF p_brand_id IS NOT NULL THEN
    INSERT INTO public.user_brand_access(user_id,brand_id,tenant_id)
      VALUES(p_user_id,p_brand_id,actor_tenant) ON CONFLICT(user_id,brand_id) DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM public.user_brand_access WHERE user_id=p_user_id AND brand_id=p_brand_id AND tenant_id=actor_tenant) THEN
      RAISE EXCEPTION 'Existing brand assignment has inconsistent ownership' USING ERRCODE='42501';
    END IF;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.provision_invited_member(uuid,uuid,text,text,boolean,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.provision_invited_member(uuid,uuid,text,text,boolean,uuid) TO service_role;
