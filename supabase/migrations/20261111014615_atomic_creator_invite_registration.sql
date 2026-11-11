-- Public invitation redemption is a single transaction. An invite authorizes
-- creation of a NEW, unverified record in its own brand; it is never proof of
-- ownership of an existing email address, TikTok handle, or creator identity.
-- Execute is restricted to the server's service role. Browser roles cannot call
-- this RPC directly, and SECURITY INVOKER preserves the caller's table authority.
CREATE OR REPLACE FUNCTION public.register_creator_invite(
  p_code text,
  p_name text,
  p_email text,
  p_tiktok_usernames text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_invite public.invites%ROWTYPE;
  v_brand_id uuid;
  v_creator_id uuid;
  v_name text := btrim(p_name);
  v_email text := lower(btrim(p_email));
  v_handles text[];
BEGIN
  IF p_code IS NULL OR p_code !~ '^[a-zA-Z0-9_-]{8,128}$'
     OR v_name IS NULL OR length(v_name) NOT BETWEEN 1 AND 100
     OR v_name ~ '[[:cntrl:]]'
     OR v_email IS NULL OR length(v_email) > 254
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR v_email ~ '[[:cntrl:]]'
     OR p_tiktok_usernames IS NULL
     OR array_ndims(p_tiktok_usernames) IS DISTINCT FROM 1
     OR cardinality(p_tiktok_usernames) NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid invitation details';
  END IF;

  SELECT array_agg(lower(regexp_replace(btrim(value), '^@', '')) ORDER BY position)
  INTO v_handles FROM unnest(p_tiktok_usernames) WITH ORDINALITY AS handles(value, position);
  IF EXISTS (SELECT 1 FROM unnest(v_handles) AS handle
             WHERE handle IS NULL OR handle !~ '^[a-z0-9_.]{1,24}$' OR right(handle, 1) = '.')
     OR (SELECT count(DISTINCT handle) FROM unnest(v_handles) AS handle) <> cardinality(v_handles) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid invitation details';
  END IF;

  SELECT * INTO v_invite FROM public.invites WHERE code = p_code FOR UPDATE;
  IF NOT FOUND OR v_invite.active IS DISTINCT FROM true
     OR v_invite.tenant_id IS NULL OR v_invite.brand IS NULL
     OR v_invite.expires_at IS NULL OR v_invite.expires_at <= clock_timestamp()
     OR v_invite.current_uses IS NULL OR v_invite.max_uses IS NULL
     OR v_invite.current_uses < 0 OR v_invite.max_uses < 1
     OR v_invite.current_uses >= v_invite.max_uses THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Invite unavailable';
  END IF;

  SELECT id INTO v_brand_id FROM public.brands_v2
  WHERE tenant_id = v_invite.tenant_id AND slug = v_invite.brand AND is_archived = false
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Invite unavailable';
  END IF;

  -- Serialize public registrations in a tenant, including different invite codes.
  -- This prevents the same email or handle being registered by two concurrent
  -- public requests. Existing database uniqueness still protects trusted writes.
  PERFORM pg_advisory_xact_lock(hashtextextended('creator-invite:' || v_invite.tenant_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.creators_v2
             WHERE tenant_id = v_invite.tenant_id AND lower(btrim(email)) = v_email)
     OR EXISTS (SELECT 1 FROM public.tiktok_accounts
                WHERE tenant_id = v_invite.tenant_id
                  AND lower(regexp_replace(btrim(tiktok_username), '^@+', '')) = ANY(v_handles))
     OR EXISTS (SELECT 1 FROM public.managed_creators legacy
                WHERE legacy.tenant_id = v_invite.tenant_id
                  AND EXISTS (
                    SELECT 1 FROM unnest(ARRAY[
                      legacy.account_1, legacy.account_2, legacy.account_3,
                      legacy.account_4, legacy.account_5, legacy.account_6,
                      legacy.account_7, legacy.account_8, legacy.account_9, legacy.account_10
                    ]) AS handle
                    WHERE lower(regexp_replace(btrim(handle), '^@+', '')) = ANY(v_handles)
                  )) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Creator identity requires review';
  END IF;

  INSERT INTO public.creators_v2 (tenant_id, real_name, email)
  VALUES (v_invite.tenant_id, v_name, v_email) RETURNING id INTO v_creator_id;
  INSERT INTO public.creator_brands (tenant_id, creator_id, brand_id, status, is_managed, applied_at)
  VALUES (v_invite.tenant_id, v_creator_id, v_brand_id, 'Applied', false, clock_timestamp());
  INSERT INTO public.tiktok_accounts
    (tenant_id, creator_id, brand_id, tiktok_username, is_primary, verified, verified_at)
  SELECT v_invite.tenant_id, v_creator_id, v_brand_id, handle, position = 1, false, null
  FROM unnest(v_handles) WITH ORDINALITY AS handles(handle, position);
  UPDATE public.invites SET current_uses = current_uses + 1
  WHERE id = v_invite.id AND tenant_id = v_invite.tenant_id;
  RETURN v_creator_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_creator_invite(text, text, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_creator_invite(text, text, text, text[]) TO service_role;
