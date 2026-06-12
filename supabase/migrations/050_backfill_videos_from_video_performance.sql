-- 050_backfill_videos_from_video_performance.sql
--
-- One-time recovery for posts the Video List parser silently dropped.
--
-- Bug (fixed in the same change, src/lib/upload/parse-rows.ts): the Video List
-- parser derived each post's id by regex-scraping "/video/<digits>" out of the
-- link and DROPPED any row that didn't match — e.g. TikTok CDN links
-- (.../video/tos/useast8/...) and photo/carousel posts (/photo/<id>). Those
-- posts never reached the `videos` table, so the roster + /posts under-counted.
-- The Video file parser was never affected because it reads the real "Video ID"
-- column, so `video_performance` still holds those exact videos with correct
-- ids. This backfills the missing ones into `videos` so historical counts are
-- correct without re-uploading.
--
-- Idempotent: ON CONFLICT (video_id, brand) DO NOTHING — only inserts videos
-- that aren't already present, never overwrites a real Video List row.
-- Engagement (impressions/likes/comments) is Video-List-only, so it's left at 0
-- for these recovered rows; the post COUNT (distinct video_id) is what matters,
-- and the next clean Video List upload fills the engagement in.

INSERT INTO public.videos (
  video_id, brand, creator_name, video_name, video_link, post_date,
  total_gmv, affiliate_gmv, items_sold, orders, impressions, likes, comments, est_commission
)
SELECT DISTINCT ON (vp.video_id, vp.brand)
  vp.video_id,
  vp.brand,
  vp.creator_name,
  vp.video_title,
  vp.video_link,
  vp.post_date,
  COALESCE(vp.gmv, 0),
  COALESCE(vp.gmv, 0),   -- vp.gmv is the creator-video-attributed GMV
  COALESCE(vp.items_sold, 0),
  COALESCE(vp.orders, 0),
  0, 0, 0,               -- engagement is Video-List-only; unknown here
  COALESCE(vp.est_commission, 0)
FROM public.video_performance vp
WHERE vp.video_id IS NOT NULL AND vp.video_id <> ''
  AND vp.post_date IS NOT NULL
ORDER BY vp.video_id, vp.brand, vp.gmv DESC NULLS LAST
ON CONFLICT (video_id, brand) DO NOTHING;
