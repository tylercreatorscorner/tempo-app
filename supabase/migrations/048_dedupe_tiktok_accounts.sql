-- 048_dedupe_tiktok_accounts.sql
--
-- Fixes the "saving a creator multiplies their handles" data-corruption bug.
--
-- Root cause
-- ----------
-- tiktok_accounts has a single unique constraint:
--     tiktok_accounts_tenant_id_tiktok_username_brand_id_key
--       UNIQUE (tenant_id, tiktok_username, brand_id)
-- The roster PATCH/POST handlers upserted handles with brand_id left NULL and
-- `onConflict: 'tenant_id,tiktok_username,brand_id'`. Postgres treats NULL as
-- DISTINCT in a unique index, so the conflict target NEVER matched a null-brand
-- row — every save INSERTED a brand-new duplicate instead of being ignored.
-- Each "remove a handle and save" therefore multiplied the rows (the user saw
-- @evewellness1 grow to "+15"). The API code is fixed in the same change to
-- diff against existing rows instead of upserting on a null brand_id.
--
-- This migration (a) cleans up the rows the bug already created and (b) adds a
-- partial unique index so a null-brand handle can never be duplicated again.
-- Both steps are idempotent: re-running on already-clean or fresh data is a
-- no-op. (Prod was cleaned interactively when the bug was diagnosed; this file
-- is the canonical, replayable record of that cleanup.)

BEGIN;

-- (a) Drop redundant null-brand rows when a real brand-keyed row already exists
--     for the same creator + handle. The brand row is the source of truth; the
--     null row was bug debris.
DELETE FROM public.tiktok_accounts t
WHERE t.brand_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.tiktok_accounts o
    WHERE o.creator_id = t.creator_id
      AND lower(o.tiktok_username) = lower(t.tiktok_username)
      AND o.brand_id IS NOT NULL
  );

-- (b) Collapse any remaining duplicate null-brand rows (creator + handle with
--     NO brand row at all) down to a single keeper — the lowest id.
DELETE FROM public.tiktok_accounts t
WHERE t.brand_id IS NULL
  AND t.id::text <> (
    SELECT min(o.id::text) FROM public.tiktok_accounts o
    WHERE o.creator_id = t.creator_id
      AND lower(o.tiktok_username) = lower(t.tiktok_username)
      AND o.brand_id IS NULL
  );

-- (c) Structural backstop: at most ONE null-brand row per (creator, handle).
--     Case-insensitive to match how the API compares handles. This closes the
--     NULL-is-distinct gap left by the existing (tenant, username, brand_id)
--     constraint, which still covers the brand-keyed rows (a creator may keep
--     one row per brand for the same handle — legitimate multi-brand selling).
CREATE UNIQUE INDEX IF NOT EXISTS tiktok_accounts_creator_handle_nullbrand_uniq
  ON public.tiktok_accounts (creator_id, lower(tiktok_username))
  WHERE brand_id IS NULL;

COMMIT;
