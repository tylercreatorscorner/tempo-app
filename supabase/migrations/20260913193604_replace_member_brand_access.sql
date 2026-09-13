-- Service-only transaction; actor comes from the verified server session.
CREATE OR REPLACE FUNCTION public.replace_member_brand_access(
  p_actor_id uuid, p_user_id uuid, p_brand_ids uuid[]
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE actor_tenant uuid; target_role text; target_tenant uuid; requested_count integer;
BEGIN
  SELECT tenant_id INTO actor_tenant FROM public.user_profiles
    WHERE user_id = p_actor_id AND role IN ('owner', 'admin') FOR SHARE;
  IF actor_tenant IS NULL OR p_actor_id = p_user_id OR p_brand_ids IS NULL THEN
    RAISE EXCEPTION 'Unauthorized member access change' USING ERRCODE = '42501';
  END IF;
  SELECT role, tenant_id INTO target_role, target_tenant FROM public.user_profiles
    WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR target_tenant IS DISTINCT FROM actor_tenant OR target_role = 'owner' THEN
    RAISE EXCEPTION 'Member cannot be edited' USING ERRCODE = '42501';
  END IF;
  IF array_position(p_brand_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid brand access' USING ERRCODE = '22023';
  END IF;
  SELECT count(DISTINCT id) INTO requested_count FROM unnest(p_brand_ids) AS ids(id);
  -- Lock brands against concurrent transfer until the access rows are replaced.
  PERFORM id FROM public.brands_v2 WHERE id = ANY(p_brand_ids) AND tenant_id = actor_tenant FOR SHARE;
  IF (SELECT count(*) FROM public.brands_v2 WHERE id = ANY(p_brand_ids) AND tenant_id = actor_tenant) <> requested_count THEN
    RAISE EXCEPTION 'Brand is not in your tenant' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.user_brand_access WHERE user_id = p_user_id AND tenant_id = actor_tenant;
  INSERT INTO public.user_brand_access(user_id, brand_id, tenant_id)
    SELECT p_user_id, id, actor_tenant FROM (SELECT DISTINCT id FROM unnest(p_brand_ids) AS ids(id)) AS requested;
END $$;
REVOKE ALL ON FUNCTION public.replace_member_brand_access(uuid,uuid,uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_member_brand_access(uuid,uuid,uuid[]) TO service_role;
