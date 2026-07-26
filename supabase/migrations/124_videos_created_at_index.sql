-- get_upload_export_layout (migration 123) asks "which brands wrote to the
-- videos registry recently, and did those writes carry pre-merge impressions?"
-- — the signal that separates brands on TikTok's old split export from those on
-- the merged one. Without an index on created_at that question parallel-seq-
-- scans all ~604k rows of `videos` (~765 MB touched, ~516k rows discarded per
-- worker): 403 ms warm and multiple seconds cold, for a metadata lookup on a
-- page an operator opens every morning.
--
-- Created CONCURRENTLY against prod (no write lock on the uploads path), so
-- this file records what is already there rather than creating it.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_videos_created_at
  ON public.videos (created_at);
