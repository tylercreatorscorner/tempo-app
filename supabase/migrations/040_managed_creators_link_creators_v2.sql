-- Path B: link managed_creators to creators_v2; tiktok_accounts becomes the
-- single source of truth for handles (unlimited per creator). The
-- account_1..account_10 columns stay as a back-compat safety net until a
-- later migration drops them.
--
-- This file documents state applied to production via Supabase MCP on
-- 2026-05-12. It was originally part of PR #15 (closed); re-cut into the
-- unlimited-handles PR after PR #17 (period + per-store) merged. Idempotent.

ALTER TABLE public.managed_creators
  ADD COLUMN IF NOT EXISTS creator_id uuid REFERENCES public.creators_v2(id);

CREATE INDEX IF NOT EXISTS managed_creators_creator_id_idx
  ON public.managed_creators (creator_id);

CREATE OR REPLACE FUNCTION public.migrate_managed_accounts_to_tiktok_accounts()
RETURNS TABLE (
  out_managed_id      integer,
  out_creator_id      uuid,
  out_handles_count   integer,
  out_was_new_creator boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mc            record;
  handle_text   text;
  found_cid     uuid;
  use_cid       uuid;
  is_new        boolean;
  handles_arr   text[];
  handle_count  integer;
BEGIN
  FOR mc IN
    SELECT id, real_name, discord_id, discord_name AS discord_username, discord_avatar,
           tenant_id, brand, archived_at,
           account_1, account_2, account_3, account_4, account_5,
           account_6, account_7, account_8, account_9, account_10
    FROM public.managed_creators
  LOOP
    handles_arr := ARRAY[]::text[];
    FOREACH handle_text IN ARRAY ARRAY[
      mc.account_1, mc.account_2, mc.account_3, mc.account_4, mc.account_5,
      mc.account_6, mc.account_7, mc.account_8, mc.account_9, mc.account_10
    ] LOOP
      IF handle_text IS NOT NULL AND btrim(handle_text) <> '' THEN
        handles_arr := array_append(handles_arr, lower(btrim(handle_text)));
      END IF;
    END LOOP;
    handles_arr := ARRAY(SELECT DISTINCT unnest(handles_arr));
    handle_count := array_length(handles_arr, 1);

    found_cid := NULL;
    IF handle_count IS NOT NULL AND handle_count > 0 THEN
      SELECT ta.creator_id
      INTO found_cid
      FROM public.tiktok_accounts ta
      WHERE lower(ta.tiktok_username) = ANY(handles_arr)
        AND ta.tenant_id = mc.tenant_id
      LIMIT 1;
    END IF;

    is_new := false;
    IF found_cid IS NOT NULL THEN
      use_cid := found_cid;
    ELSE
      INSERT INTO public.creators_v2 (real_name, discord_id, discord_username, discord_avatar, tenant_id)
      VALUES (
        COALESCE(mc.real_name, COALESCE(handles_arr[1], 'Unnamed Creator')),
        mc.discord_id,
        mc.discord_username,
        mc.discord_avatar,
        mc.tenant_id
      )
      RETURNING creators_v2.id INTO use_cid;
      is_new := true;
    END IF;

    UPDATE public.managed_creators m
       SET creator_id = use_cid
     WHERE m.id = mc.id
       AND (m.creator_id IS NULL OR m.creator_id <> use_cid);

    IF handle_count IS NOT NULL AND handle_count > 0 THEN
      FOR i IN 1..array_length(handles_arr, 1) LOOP
        INSERT INTO public.tiktok_accounts (
          creator_id, tenant_id, tiktok_username, is_primary
        )
        SELECT use_cid, mc.tenant_id, handles_arr[i], (i = 1)
        WHERE NOT EXISTS (
          SELECT 1 FROM public.tiktok_accounts ta
          WHERE ta.creator_id = use_cid
            AND lower(ta.tiktok_username) = handles_arr[i]
            AND ta.tenant_id = mc.tenant_id
        );
      END LOOP;
    END IF;

    out_managed_id      := mc.id;
    out_creator_id      := use_cid;
    out_handles_count   := COALESCE(handle_count, 0);
    out_was_new_creator := is_new;
    RETURN NEXT;
  END LOOP;
END;
$$;

SELECT public.migrate_managed_accounts_to_tiktok_accounts();
