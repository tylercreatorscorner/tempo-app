import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { parseTikTokVideoUrl } from '@/lib/media/tiktok-video-cover';
import { parsePublishedVideoEvidence } from './published-video-evidence';

/** Only stored watch identities can authorize media. Never accept an export CDN URL. */
function savedVideoIdentity(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'].includes(url.hostname)
      || url.username || url.password || url.port || url.search || url.hash) return null;
    url.hostname = 'www.tiktok.com';
    return parseTikTokVideoUrl(url.toString())?.url.toLowerCase() ?? null;
  } catch { return null; }
}

function containsVideo(rows: unknown, identity: string): boolean {
  return Array.isArray(rows) && rows.some(value => value && typeof value === 'object'
    && !Array.isArray(value) && savedVideoIdentity(value.videoUrl) === identity);
}

/**
 * A public report token authorizes only identities already frozen in that report.
 * The narrow projection avoids reading contacts, terms, notes, or live roster data.
 * Every request checks revocation before the public-image cache can be consulted.
 */
export async function getClientReportMediaUrl(token: string, input: string, clientOverride?: SupabaseClient): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(token)) return null;
  const video = parseTikTokVideoUrl(input);
  if (!video || video.url !== input) return null;
  const identity = video.url.toLowerCase();
  const db = clientOverride ?? await createAdminClient();
  const { data, error } = await db.from('client_reports')
    .select('revoked_at,period_start,period_end,top_videos:snapshot->report->topVideos,managed_top_videos:snapshot->report->creatorsCorner->topVideos,published_evidence:snapshot->publishedVideoEvidence')
    .eq('token', token).is('revoked_at', null).abortSignal(AbortSignal.timeout(5_000)).maybeSingle();
  if (error) throw new Error('Report media authorization could not be checked.');
  if (!data || data.revoked_at !== null) return null;
  if (containsVideo(data.top_videos, identity) || containsVideo(data.managed_top_videos, identity)) return video.url;
  if (data.published_evidence === undefined || data.published_evidence === null) return null;
  try {
    const evidence = parsePublishedVideoEvidence(data.published_evidence);
    if (evidence.periodStart !== data.period_start || evidence.periodEnd !== data.period_end) return null;
    return evidence.videos.some(item => {
      const saved = savedVideoIdentity(item.watchUrl);
      const creatorIdentity = savedVideoIdentity(`https://www.tiktok.com/@${item.creatorHandle}/video/${item.videoId}`);
      // Verify the handle as well as the video ID, including historical alias URLs.
      return saved === creatorIdentity && saved === identity;
    }) ? video.url : null;
  } catch { return null; }
}
