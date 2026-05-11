-- Add thumbnail_url to videos so the Posts card view can render a preview
-- per post without round-tripping to TikTok's oEmbed endpoint per request.
--
-- Why store and not fetch on read?
--   - TikTok's oEmbed is rate-limited and adds ~200-400ms per call
--   - Thumbnails for ~100 cards on a single page load would burn budget
--   - Each video's thumbnail is stable; fetching once and caching is the
--     right cost model
--
-- Populate via scripts/backfill-video-thumbnails.ts (added in same PR).
-- New rows from the upload pipeline should populate this lazily — leaving
-- that to a follow-up since the upload pipeline lives elsewhere.

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

COMMENT ON COLUMN videos.thumbnail_url IS
  'TikTok thumbnail URL fetched from oEmbed. Populated by backfill script and (eventually) by upload pipeline on new rows. May be null while backfill is in progress or for rows where oEmbed failed.';
