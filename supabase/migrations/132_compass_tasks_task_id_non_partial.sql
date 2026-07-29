-- 132_compass_tasks_task_id_non_partial.sql
--
-- Make the task_id unique index NON-PARTIAL so ON CONFLICT can infer it.
--
-- Migration 122 created it as `UNIQUE (task_id) WHERE task_id IS NOT NULL`, on
-- the reasoning that several rows may exist with a NULL task_id (a create that
-- failed before an id came back) and must not collide.
--
-- That predicate was unnecessary AND actively harmful:
--   · UNNECESSARY — Postgres treats NULLs as DISTINCT in a unique index by
--     default, so `UNIQUE (task_id)` already permits unlimited NULL rows.
--   · HARMFUL — Postgres cannot infer a PARTIAL unique index from
--     `ON CONFLICT (task_id)`; the arbiter has to repeat the predicate, which
--     PostgREST's `onConflict` parameter cannot express. Every upsert threw.
--
-- Why an upsert is required at all: TikTok DEDUPES export tasks, returning the
-- same id for the same module_type + window_type + end_day. With the partial
-- index the upsert failed, recordTask returned null, and a null row id silently
-- no-ops every later updateTask — which is why task
-- 01KYR32HERNETNZ3HTD2562YY5v2 (jiyu 2026-07-24) left no row at all despite
-- reaching the poll stage and logging a warning about it.

DROP INDEX IF EXISTS public.idx_compass_tasks_task_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_compass_tasks_task_id
  ON public.tiktok_compass_tasks (task_id);
