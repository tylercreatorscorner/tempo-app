-- Path B migration: link managed_creators to creators_v2 and move handle
-- storage to tiktok_accounts as the single source of truth.
--
-- Why: today the same handle data lives in two places — `tiktok_accounts`
-- (normalized, supports N handles per creator) and `managed_creators`
-- (denormalized, hardcoded 10 columns). This causes a UI ceiling and is
-- a source of bugs. This migration keeps the columns intact as a safety
-- net while making `tiktok_accounts` the canonical store.
--
-- This file documents what was applied via Supabase MCP on 2026-05-12.

-- 1. FK column linking managed_creators → creators_v2.
ALTER TABLE public.managed_creators
  ADD COLUMN IF NOT EXISTS creator_id uuid REFERENCES public.creators_v2(id);

CREATE INDEX IF NOT EXISTS managed_creators_creator_id_idx
  ON public.managed_creators (creator_id);

-- 2. Idempotent backfill function.
--    For each managed_creators row:
--      a. Collect non-null handles from account_1..account_10
--      b. If any of those handles already has a tiktok_accounts row in the
--         same tenant, adopt that row's creator_id
--      c. Otherwise create a new creators_v2 row (copying real_name +
--         discord identity) and use its id
--      d. Set managed_creators.creator_id
--      e. Upsert tiktok_accounts rows for every handle (one row per handle)
--    Safe to re-run; idempotent.
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

COMMENT ON FUNCTION public.migrate_managed_accounts_to_tiktok_accounts() IS
  'Backfill: link every managed_creators row to a creators_v2 row via creator_id, and ensure every account_1..10 handle has a tiktok_accounts row. Idempotent.';

-- 3. Run the backfill on the existing data.
SELECT public.migrate_managed_accounts_to_tiktok_accounts();
