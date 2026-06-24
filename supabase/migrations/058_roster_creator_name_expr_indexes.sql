-- Roster page perf: index the creator_name expression the roster RPCs filter on.
--
-- /api/roster fans out to get_creator_handle_perf (+ get_unmanaged_top_perf),
-- whose `all_posts` CTE matches videos / video_performance with
--   lower(trim(regexp_replace(creator_name, '^@', '')))
-- The existing indexes are on the RAW creator_name column, which a btree
-- cannot use for an EXPRESSION predicate — so every roster load sequentially
-- scanned videos (~1.5M rows) and video_performance (~500K), discarding 99.9%
-- of rows. Measured: get_creator_handle_perf went from ~7.6s to ~0.66s for 40
-- handles once these expression indexes existed (the planner switches from a
-- seq scan to an index scan that returns ~tens of rows per handle).
--
-- The expression is IMMUTABLE (lower / trim / regexp_replace), so it is index-
-- able. Applied to PROD via the Supabase MCP using CREATE INDEX CONCURRENTLY
-- (no write lock on the 900MB+ tables); this file mirrors it for fresh
-- environments. CONCURRENTLY can't run inside the migration runner's
-- transaction, so the repo copy is a plain idempotent CREATE INDEX IF NOT
-- EXISTS — a no-op on prod (the concurrently-built index already exists) and a
-- brief lock only on an empty fresh database.

create index if not exists idx_videos_creator_norm
  on public.videos (lower(trim(regexp_replace(creator_name, '^@', ''))));

create index if not exists idx_video_perf_creator_norm
  on public.video_performance (lower(trim(regexp_replace(creator_name, '^@', ''))));
