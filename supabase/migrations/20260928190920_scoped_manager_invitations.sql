-- A manager may invite only scoped roles into brands they currently hold.
-- Keep this separate from the owner/admin provisioning RPC: an existing
-- member's role and other brand assignments must never be changed here.
CREATE FUNCTION public.provision_manager_invited_member(
  p_actor_id uuid, p_user_id uuid, p_email text, p_role text, p_brand_ids uuid[]
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  actor_tenant uuid;
  target_tenant uuid;
  target_role text;
  target_status text;
  requested_count integer;
  active_brand_count integer;
  actor_access_count integer;
BEGIN
  SELECT tenant_id INTO actor_tenant FROM public.user_profiles
    WHERE user_id = p_actor_id AND role = 'manager' AND status = 'active' FOR SHARE;
  IF actor_tenant IS NULL OR p_user_id IS NULL OR p_actor_id = p_user_id
     OR p_role IS NULL OR p_role NOT IN ('manager', 'coach', 'brand')
     OR p_email IS NULL OR length(trim(p_email)) = 0
     OR p_brand_ids IS NULL OR cardinality(p_brand_ids) NOT BETWEEN 1 AND 32
     OR array_position(p_brand_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid manager invitation' USING ERRCODE = '42501';
  END IF;

  SELECT count(DISTINCT id) INTO requested_count FROM unnest(p_brand_ids) AS ids(id);
  IF requested_count <> cardinality(p_brand_ids) THEN
    RAISE EXCEPTION 'Duplicate brand selection' USING ERRCODE = '22023';
  END IF;

  -- Lock the currently assigned access rows until provisioning commits.
  PERFORM brand_id FROM public.user_brand_access
    WHERE user_id = p_actor_id AND tenant_id = actor_tenant
      AND brand_id = ANY(p_brand_ids) FOR SHARE;
  GET DIAGNOSTICS actor_access_count = ROW_COUNT;
  IF actor_access_count <> requested_count THEN
    RAISE EXCEPTION 'Brand outside manager access' USING ERRCODE = '42501';
  END IF;

  PERFORM id FROM public.brands_v2
    WHERE id = ANY(p_brand_ids) AND tenant_id = actor_tenant
      AND is_archived IS NOT TRUE FOR SHARE;
  GET DIAGNOSTICS active_brand_count = ROW_COUNT;
  IF active_brand_count <> requested_count THEN
    RAISE EXCEPTION 'Brand unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id, role, status INTO target_tenant, target_role, target_status
    FROM public.user_profiles WHERE user_id = p_user_id FOR UPDATE;
  IF FOUND THEN
    IF target_tenant IS DISTINCT FROM actor_tenant OR target_status IS DISTINCT FROM 'active'
       OR NOT (target_role = p_role OR (p_role = 'brand' AND target_role = 'brand_contact')) THEN
      RAISE EXCEPTION 'Existing member requires an administrator' USING ERRCODE = '42501';
    END IF;
  ELSE
    INSERT INTO public.user_profiles(user_id,email,role,role_id,tenant_id,status,can_view_finance)
      VALUES (p_user_id,lower(trim(p_email)),p_role,NULL,actor_tenant,'active',false);
  END IF;

  INSERT INTO public.user_brand_access(user_id,brand_id,tenant_id)
    SELECT p_user_id,id,actor_tenant FROM unnest(p_brand_ids) AS ids(id)
    ON CONFLICT(user_id,brand_id) DO NOTHING;
  IF (SELECT count(*) FROM public.user_brand_access
      WHERE user_id = p_user_id AND tenant_id = actor_tenant
        AND brand_id = ANY(p_brand_ids)) <> requested_count THEN
    RAISE EXCEPTION 'Brand assignment failed' USING ERRCODE = '42501';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.provision_manager_invited_member(uuid,uuid,text,text,uuid[])
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.provision_manager_invited_member(uuid,uuid,text,text,uuid[])
  TO service_role;
