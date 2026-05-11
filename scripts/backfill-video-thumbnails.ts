/**
 * One-shot backfill for videos.thumbnail_url.
 *
 * Pulls every videos row with a video_link but no thumbnail_url, calls
 * TikTok's oEmbed endpoint to resolve a thumbnail, and writes it back.
 * Throttled to be polite to TikTok (rate-limited, no official quota
 * documented — ~5 req/sec is the field-observed safe bound).
 *
 * Run once after migration 039 lands:
 *   npx tsx scripts/backfill-video-thumbnails.ts
 *
 * Env required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Idempotent — re-running skips rows that already have a thumbnail. Rows
 * that fail oEmbed (deleted/private videos) get marked with a sentinel
 * empty string so we don't keep retrying them on every run.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 5 req/sec is the field-observed safe bound for TikTok oEmbed. We pause
// between requests rather than firing concurrently — sequential is slower
// but much more predictable when something goes wrong.
const REQUEST_INTERVAL_MS = 200;

// Don't pull every row in one go — work in pages so we can resume cleanly
// if the script is interrupted.
const PAGE_SIZE = 500;

interface OEmbedResponse {
  thumbnail_url?: string;
  title?: string;
}

async function fetchThumbnail(videoUrl: string): Promise<string | null> {
  const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`;
  try {
    const res = await fetch(oembedUrl, { headers: { 'User-Agent': 'tempo-thumbnail-backfill/1.0' } });
    if (!res.ok) return null;
    const json = await res.json() as OEmbedResponse;
    return json.thumbnail_url ?? null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  let totalProcessed = 0;
  let totalSuccess = 0;
  let totalFailed = 0;

  // Keep paging until we get an empty batch. Order by id so resumes pick
  // up roughly where we left off.
  let lastId = 0;
  for (;;) {
    const { data: rows, error } = await supabase
      .from('videos')
      .select('id, video_link')
      .is('thumbnail_url', null)
      .not('video_link', 'is', null)
      .gt('id', lastId)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);

    if (error) {
      console.error('Query failed:', error.message);
      process.exit(1);
    }
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const thumb = await fetchThumbnail(row.video_link as string);
      // Empty string sentinel for "we tried and oEmbed had nothing" so
      // we don't retry these on every backfill run. UI treats both null
      // and '' as missing.
      const value = thumb ?? '';
      const { error: updateErr } = await supabase
        .from('videos')
        .update({ thumbnail_url: value })
        .eq('id', row.id);
      if (updateErr) {
        console.error(`  ❌ id=${row.id}: ${updateErr.message}`);
        totalFailed++;
      } else if (thumb) {
        totalSuccess++;
      } else {
        totalFailed++;
      }
      totalProcessed++;
      if (totalProcessed % 50 === 0) {
        console.log(`Processed ${totalProcessed} (${totalSuccess} ok, ${totalFailed} no thumb)`);
      }
      await sleep(REQUEST_INTERVAL_MS);
    }
    lastId = (rows[rows.length - 1].id as number);
  }

  console.log(`\nDone. Processed ${totalProcessed} rows: ${totalSuccess} thumbnails fetched, ${totalFailed} unresolved.`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
