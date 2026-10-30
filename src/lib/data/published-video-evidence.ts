import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import type { PublishedVideoEvidence, PublishedVideoEvidenceItem } from './published-video-evidence-types';

export interface PublishedVideoEvidenceInput {
  tenantId: string;
  rosterSlugs: string[];
  dataSlugs?: string[];
  start: string;
  end: string;
  /** Presence selects reconstruction from the frozen roster, including an empty roster. */
  frozenHandles?: string[];
}

const MAX_VIDEOS = 250_000;
const normalize = (value: string) => value.trim().replace(/^@+/, '').toLowerCase();
const failure = () => new Error('Published video evidence could not be loaded.');
const validDate = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value;
const stringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');

/** Stored export links may be CDN assets; expose only watch URLs for this ID. */
function safeWatchUrl(value: unknown, videoId: string, creatorHandle: string): string | null {
  if (/^[0-9]+$/.test(videoId) && typeof value === 'string') {
    try {
      const url = new URL(value);
      const match = url.pathname.match(/^\/@[A-Za-z0-9._]+\/video\/([0-9]+)\/?$/);
      if (url.protocol === 'https:' && ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'].includes(url.hostname)
        && !url.username && !url.password && !url.port && match?.[1] === videoId) return url.toString();
    } catch { /* Fall back to a canonical identity URL only when it is constructible. */ }
  }
  return /^[0-9]+$/.test(videoId) && /^[a-z0-9._]+$/.test(creatorHandle)
    ? `https://www.tiktok.com/@${creatorHandle}/video/${videoId}` : null;
}

/** Validate and whitelist a saved evidence packet without any source query. */
export function parsePublishedVideoEvidence(value: unknown): PublishedVideoEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure();
  const row = value as Record<string, unknown>;
  if (row.v !== 1 || row.scope !== 'managed-published' || !validDate(row.periodStart) || !validDate(row.periodEnd)
    || row.periodStart > row.periodEnd || Date.parse(row.periodEnd) - Date.parse(row.periodStart) > 800 * 86_400_000
    || typeof row.capturedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(row.capturedAt) || !Number.isFinite(Date.parse(row.capturedAt))
    || typeof row.total !== 'number' || !Number.isSafeInteger(row.total) || row.total < 0 || row.total > MAX_VIDEOS
    || !Array.isArray(row.videos) || row.videos.length !== row.total) throw failure();
  const start = row.periodStart, end = row.periodEnd;
  const ids = new Set<string>();
  const videos: PublishedVideoEvidenceItem[] = row.videos.map((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure();
    const video = value as Record<string, unknown>;
    if (typeof video.videoId !== 'string' || !video.videoId.trim() || video.videoId !== video.videoId.trim()
      || video.videoId.length > 256 || ids.has(video.videoId)
      || typeof video.creatorHandle !== 'string' || video.creatorHandle !== normalize(video.creatorHandle)
      || !stringArray(video.qualifyingHandles) || !video.qualifyingHandles.length
      || video.qualifyingHandles.some(handle => handle !== normalize(handle))
      || new Set(video.qualifyingHandles).size !== video.qualifyingHandles.length
      || !video.qualifyingHandles.includes(video.creatorHandle)
      || !validDate(video.publishedAt) || video.publishedAt < start || video.publishedAt > end
      || (video.watchUrl !== null && typeof video.watchUrl !== 'string')
      || (video.title !== null && typeof video.title !== 'string')) throw failure();
    ids.add(video.videoId);
    return {
      videoId: video.videoId, creatorHandle: video.creatorHandle, qualifyingHandles: [...video.qualifyingHandles],
      publishedAt: video.publishedAt, watchUrl: safeWatchUrl(video.watchUrl, video.videoId, video.creatorHandle),
      title: typeof video.title === 'string' && video.title.trim() ? video.title.trim().slice(0, 240) : null,
    };
  });
  return { v: 1, capturedAt: row.capturedAt, periodStart: start, periodEnd: end, scope: 'managed-published', total: row.total, videos };
}

/**
 * Capture all counted identities in a single MVCC read. Callers authorize the
 * tenant and roster/data-store scope before calling this service-only loader.
 * New report builders freeze the result; frozen report reads never call it.
 * Legacy reconstruction calls it with explicit saved handles and data stores.
 */
export async function getPublishedVideoEvidence(input: PublishedVideoEvidenceInput, clientOverride?: SupabaseClient): Promise<PublishedVideoEvidence> {
  const { tenantId, start, end } = input;
  const reconstruction = Object.prototype.hasOwnProperty.call(input, 'frozenHandles');
  if (!tenantId || !stringArray(input.rosterSlugs)
    || (input.dataSlugs !== undefined && !stringArray(input.dataSlugs))
    || (reconstruction && (!stringArray(input.frozenHandles) || !stringArray(input.dataSlugs)))
    || !validDate(start) || !validDate(end) || start > end
    || Date.parse(end) - Date.parse(start) > 800 * 86_400_000) throw failure();
  const rosterSlugs = [...new Set(input.rosterSlugs.map(slug => slug.trim()).filter(Boolean))];
  const dataSlugs = input.dataSlugs === undefined ? null : [...new Set(input.dataSlugs.map(slug => slug.trim()).filter(Boolean))];
  const frozenHandles = reconstruction ? [...new Set(input.frozenHandles!.map(normalize).filter(Boolean))] : null;
  try {
    const client = clientOverride ?? await createAdminClient();
    const { data, error } = await client.rpc('get_report_published_video_evidence_workspace', {
      p_tenant_id: tenantId, p_roster_slugs: rosterSlugs, p_data_slugs: dataSlugs,
      p_start: start, p_end: end, p_frozen_handles: frozenHandles,
    }).abortSignal(AbortSignal.timeout(25_000));
    if (error) throw failure();
    const evidence = parsePublishedVideoEvidence(data);
    if (evidence.periodStart !== start || evidence.periodEnd !== end
      || (frozenHandles && evidence.videos.some(video => video.qualifyingHandles.some(handle => !frozenHandles.includes(handle))))) throw failure();
    return evidence;
  } catch {
    // Provider messages can contain source data. Never return or re-log them.
    throw failure();
  }
}
