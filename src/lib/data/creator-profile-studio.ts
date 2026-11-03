import 'server-only';
import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope, type WorkspaceScope } from '@/lib/auth/workspace-scope';
import { authorizeCreator } from '@/lib/auth/authorize-creator';
import { getCreatorReportBrands } from '@/lib/auth/creator-report-scope';
import { can } from '@/lib/auth/permissions';
import { normalizeCreatorTag } from '@/lib/roster/creator-tags';
import { rosterStudioDate } from '@/lib/roster/studio-model';
import type { RosterStudioData } from '@/lib/roster/studio-types';
import { getRosterStudio } from './roster-studio';
import { getPublishedVideoEvidence } from './published-video-evidence';

/** Current roster membership with period-specific, read-only agreement context. */
export interface CreatorStudioContract {
  managedId: number;
  brand: string;
  notes: string | null;
  status: string | null;
  retainerStartDate: string | null;
  reportingStartDate: string | null;
  /** Tags describe current membership, not a historical snapshot. */
  creatorTags: string[];
  studio: RosterStudioData;
}
export type CreatorStudioContractsResult = {
  status: 'ready'; contracts: CreatorStudioContract[];
} | { status: 'denied' | 'unavailable'; contracts: [] };

export interface CreatorPublicationVideo {
  videoId: string;
  creatorHandle: string;
  matchedHandles: string[];
  publishedAt: string;
  watchUrl: string | null;
  title: string | null;
  /** The stable publication packet does not currently supply covers. */
  thumbnailUrl: null;
}
export type CreatorPublicationEvidenceResult = {
  status: 'ready'; videos: CreatorPublicationVideo[];
  source: { basis: 'recorded_publications'; capturedAt: string; start: string; end: string; brand: string };
} | { status: 'denied' | 'unavailable'; videos: []; source: null };

type Client = Awaited<ReturnType<typeof createAdminClient>>;
type ManagedRow = {
  id: number; brand: string; creator_id: string | null; notes: string | null;
  status: string | null; employment_status: string | null;
  retainer_start_date: string | null; reporting_start_date: string | null; tags: unknown;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normalizeHandle = (value: unknown) => typeof value === 'string' ? value.trim().replace(/^@+/, '').toLowerCase() : '';
const currentDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const contractsFailure = (): CreatorStudioContractsResult => ({ status: 'unavailable', contracts: [] });

/** Scoped canonical handles are request-cached, never shared between viewers. */
const readContext = cache(async (creatorId: string): Promise<{ scope: WorkspaceScope; client: Client; handles: string[] } | null> => {
  if (!uuid.test(creatorId)) return null;
  const scope = await getWorkspaceScope();
  if (!scope || !can(scope, 'roster', 'read') || await authorizeCreator(scope, creatorId)) return null;
  const client = await createAdminClient();
  const { data, error, count } = await client.from('tiktok_accounts')
    .select('tiktok_username', { count: 'exact' }).eq('tenant_id', scope.tenantId)
    .eq('creator_id', creatorId).limit(101).abortSignal(AbortSignal.timeout(5_000));
  if (error || !data || count !== data.length || data.length > 100) throw new Error('Creator accounts are unavailable.');
  const handles = [...new Set(data.map(account => normalizeHandle(account.tiktok_username)).filter(Boolean))];
  // Handles become a PostgREST OR filter below; reject rather than interpolate unsafe input.
  if (handles.some(handle => !/^[a-z0-9._]{1,64}$/.test(handle))) throw new Error('Creator accounts are unavailable.');
  return { scope, client, handles };
});

/** No renewal/ensure/write function is invoked by the Studio profile reader. */
export async function getCreatorStudioContracts(creatorId: string, asOf: string, brand?: string): Promise<CreatorStudioContractsResult> {
  if (!rosterStudioDate(asOf) || asOf > currentDay()) return contractsFailure();
  try {
    const context = await readContext(creatorId);
    if (!context) return { status: 'denied', contracts: [] };
    if (brand && !(await getCreatorReportBrands(creatorId, brand)).length) return { status: 'denied', contracts: [] };
    const { scope, client, handles } = context;
    const aliases = Array.from({ length: 10 }, (_, index) => `account_${index + 1}.in.(${handles.join(',')})`).join(',');
    // A linked row must belong to this creator. Only legacy rows without a creator FK use handle overlap.
    const identity = handles.length ? `creator_id.eq.${creatorId},and(creator_id.is.null,or(${aliases}))` : `creator_id.eq.${creatorId}`;
    let query = client.from('managed_creators')
      .select('id,brand,creator_id,notes,status,employment_status,retainer_start_date,reporting_start_date,tags', { count: 'exact' })
      .eq('tenant_id', scope.tenantId).is('archived_at', null).or(identity).order('id').limit(101);
    if (scope.brandScope.kind === 'scoped') query = query.in('brand', scope.brandScope.brandSlugs.length ? scope.brandScope.brandSlugs : ['__no_access__']);
    if (brand) query = query.eq('brand', brand);
    const { data, error, count } = await query.abortSignal(AbortSignal.timeout(5_000));
    if (error || !data || count !== data.length || data.length > 100) return contractsFailure();
    const rows = data as ManagedRow[];
    if (!rows.length) return { status: 'ready', contracts: [] };
    const result = await getRosterStudio(scope, { ids: rows.map(row => row.id), asOf });
    if (result.status !== 200) return result.status === 403 ? { status: 'denied', contracts: [] } : contractsFailure();
    const studios = new Map(result.body.rows.map(row => [row.id, row.studio]));
    if (rows.some(row => !studios.has(String(row.id)))) return contractsFailure();
    return { status: 'ready', contracts: rows.map(row => ({
      managedId: row.id, brand: row.brand, notes: row.notes,
      status: row.status ?? row.employment_status ?? null,
      retainerStartDate: row.retainer_start_date, reportingStartDate: row.reporting_start_date,
      creatorTags: [...new Set((Array.isArray(row.tags) ? row.tags : []).map(normalizeCreatorTag).filter((tag): tag is string => tag !== null))],
      studio: studios.get(String(row.id))!,
    })).sort((left, right) => left.brand.localeCompare(right.brand) || left.managedId - right.managedId) };
  } catch { return contractsFailure(); }
}

/** Recorded identities include videos without sales; membership is not acceptance/qualification. */
export async function getCreatorPublicationEvidence(creatorId: string, brand: string, start: string, end: string): Promise<CreatorPublicationEvidenceResult> {
  const failure = (status: 'denied' | 'unavailable'): CreatorPublicationEvidenceResult => ({ status, videos: [], source: null });
  if (!brand || !rosterStudioDate(start) || !rosterStudioDate(end) || start > end || end > currentDay()
    || Date.parse(end) - Date.parse(start) > 366 * 86_400_000) return failure('unavailable');
  try {
    const context = await readContext(creatorId);
    if (!context) return failure('denied');
    if (!context.handles.length) return failure('unavailable');
    const dataSlugs = await getCreatorReportBrands(creatorId, brand);
    if (!dataSlugs.length) return failure('denied');
    const evidence = await getPublishedVideoEvidence({
      tenantId: context.scope.tenantId, rosterSlugs: [brand], dataSlugs,
      start, end, frozenHandles: context.handles,
    }, context.client);
    return {
      status: 'ready',
      videos: evidence.videos.map(video => ({
        videoId: video.videoId, creatorHandle: video.creatorHandle, matchedHandles: [...video.qualifyingHandles],
        publishedAt: video.publishedAt, watchUrl: video.watchUrl, title: video.title, thumbnailUrl: null,
      })),
      source: { basis: 'recorded_publications', capturedAt: evidence.capturedAt, start, end, brand },
    };
  } catch { return failure('unavailable'); }
}
