-- Only the server may supply the actor, after verifying the session and view-as guard.
CREATE OR REPLACE FUNCTION public.manage_workspace_role(
  p_actor_id uuid, p_operation text, p_role_id uuid,
  p_name text DEFAULT NULL, p_permissions jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  actor_tenant uuid; actor_role text; actor_permission_role uuid;
  target public.roles%ROWTYPE; result_id uuid;
BEGIN
  SELECT tenant_id, role, role_id INTO actor_tenant, actor_role, actor_permission_role
    FROM public.user_profiles WHERE user_id = p_actor_id FOR SHARE;
  IF actor_tenant IS NULL OR actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can manage roles.' USING ERRCODE = '42501';
  END IF;
  -- Explicit role IDs never inherit grants from a different workspace.
  SELECT id INTO actor_permission_role FROM public.roles
    WHERE tenant_id = actor_tenant AND
      ((actor_permission_role IS NOT NULL AND id = actor_permission_role) OR
       (actor_permission_role IS NULL AND key = actor_role)) FOR SHARE;
  IF actor_permission_role IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.role_permissions WHERE role_id = actor_permission_role
      AND screen = 'team' AND level = 'configure'
  ) THEN
    RAISE EXCEPTION 'Role configuration permission required.' USING ERRCODE = '42501';
  END IF;
  IF p_operation IS NULL OR p_operation NOT IN ('clone', 'replace', 'delete') THEN
    RAISE EXCEPTION 'Invalid role operation.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO target FROM public.roles
    WHERE id = p_role_id AND tenant_id = actor_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role not found.' USING ERRCODE = 'P0002';
  END IF;
  IF p_operation <> 'clone' AND target.is_default THEN
    RAISE EXCEPTION 'Default roles are read-only. Duplicate one to edit it.' USING ERRCODE = '23514';
  END IF;
  IF (p_operation = 'clone' AND p_name IS NULL) OR
     (p_name IS NOT NULL AND (length(btrim(p_name)) = 0 OR length(p_name) > 60)) THEN
    RAISE EXCEPTION 'Role name must contain 1 to 60 characters.' USING ERRCODE = '22023';
  END IF;
  IF p_permissions IS NOT NULL THEN
    IF jsonb_typeof(p_permissions) <> 'array' THEN
      RAISE EXCEPTION 'Permissions must be an array.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_permissions) AS item(value)
      WHERE jsonb_typeof(value) <> 'string' OR (value #>> '{}') !~
        '^(dashboard|roster|retention|affiliates|segments|contests|drops|posts|reporting|messages|earnings|invoicing|payments|products|settings|team|upload|automations|integrations|outreach):(read|write|configure)$') THEN
      RAISE EXCEPTION 'Invalid permission.' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_operation = 'clone' THEN
    result_id := gen_random_uuid();
    INSERT INTO public.roles(id, tenant_id, key, name, description, is_default)
      VALUES (result_id, actor_tenant, 'custom_' || replace(result_id::text, '-', ''),
        btrim(p_name), target.description, false);
    INSERT INTO public.role_permissions(role_id, screen, level)
      SELECT result_id, screen, level FROM public.role_permissions WHERE role_id = target.id;
  ELSIF p_operation = 'replace' THEN
    result_id := target.id;
    IF p_name IS NOT NULL THEN UPDATE public.roles SET name = btrim(p_name) WHERE id = target.id; END IF;
    IF p_permissions IS NOT NULL THEN
      DELETE FROM public.role_permissions WHERE role_id = target.id;
      INSERT INTO public.role_permissions(role_id, screen, level)
        SELECT DISTINCT target.id, split_part(value, ':', 1), split_part(value, ':', 2)
          FROM jsonb_array_elements_text(p_permissions);
    END IF;
  ELSE
    -- FOR UPDATE also conflicts with FK assignment locks. Check membership after locking.
    IF EXISTS (SELECT 1 FROM public.user_profiles WHERE role_id = target.id) THEN
      RAISE EXCEPTION 'Members still hold this role. Move them first.' USING ERRCODE = '23514';
    END IF;
    result_id := target.id;
    DELETE FROM public.roles WHERE id = target.id;
  END IF;
  RETURN result_id;
END $$;
REVOKE ALL ON FUNCTION public.manage_workspace_role(uuid,text,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_workspace_role(uuid,text,uuid,text,jsonb) TO service_role;
