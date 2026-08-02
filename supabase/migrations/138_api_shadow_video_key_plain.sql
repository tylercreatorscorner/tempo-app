-- 138_api_shadow_video_key_plain.sql
--
-- Replace an EXPRESSION unique index with a plain-column one so ON CONFLICT can
-- infer it.
--
-- 137 created it as UNIQUE (run_id, video_id, coalesce(product_id, '')). That is
-- correct as a constraint and USELESS as an upsert arbiter: Postgres cannot
-- infer an index built on an expression from a column list, and PostgREST's
-- onConflict parameter can only express column names. Every video write failed
-- with "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification".
--
-- ⚠️ SECOND TIME IN ONE SESSION. Migration 132 fixed the identical mistake on
-- tiktok_compass_tasks, where the index was PARTIAL (WHERE task_id IS NOT NULL)
-- and equally un-inferrable. The rule, learned twice: an index an upsert must
-- target has to be on PLAIN COLUMNS — no expression, no WHERE clause.
--
-- The coalesce existed because product_id is nullable (the video-level row) and
-- Postgres treats NULLs as DISTINCT by default, so plain (run_id, video_id,
-- product_id) would permit duplicate video-level rows. Postgres 17 answers this
-- directly: NULLS NOT DISTINCT makes one NULL equal another for uniqueness,
-- which is exactly the intent, without an expression.
DROP INDEX IF EXISTS public.api_shadow_video_key;

CREATE UNIQUE INDEX api_shadow_video_key
  ON public.api_shadow_video_performance (run_id, video_id, product_id)
  NULLS NOT DISTINCT;
