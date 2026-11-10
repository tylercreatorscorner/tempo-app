import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope, isBrandInScope } from '@/lib/auth/workspace-scope';
import { reportGuard } from '@/lib/auth/client-report-access';
import { reviveReportDates, type ClientReportSnapshot } from './client-reports';
import { parsePublishedVideoEvidence } from './published-video-evidence';
import { normalizeReportVideoHandle, reportVideoCreatorKey, type ReportVideoLibrary } from './published-video-evidence-types';
import { parseTikTokVideoUrl } from '@/lib/media/tiktok-video-cover';

export const PRIVATE_REPORT_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
};

export interface ClientReportRevisionDraft {
  id: string;
  tenant_id: string;
  source_report_id: string;
  brand_slug: string;
  brand_name: string;
  report_type: 'performance' | 'weekly' | 'monthly';
  period_start: string;
  period_end: string;
  period_label: string;
  status: 'draft';
  snapshot: ClientReportSnapshot;
  notes: string | null;
  plan: string | null;
  provenance: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export class PrivateReportDraftError extends Error {
  constructor(public readonly status: number) {
    super(status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : status === 404 ? 'Not found' : 'Private report preview is unavailable.');
  }
}

/** All private HTML, export and media entry points independently call this guard. */
export async function loadClientReportRevisionDraft(id: string): Promise<ClientReportRevisionDraft> {
  const scope = await getWorkspaceScope();
  if (!scope) throw new PrivateReportDraftError(401);
  if (scope.impersonating || reportGuard(scope, 'write')) throw new PrivateReportDraftError(403);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new PrivateReportDraftError(404);
  const db = await createAdminClient();
  const { data, error } = await db.from('client_report_revision_drafts')
    .select('id,tenant_id,source_report_id,brand_slug,brand_name,report_type,period_start,period_end,period_label,status,snapshot,notes,plan,provenance,created_at,updated_at')
    .eq('id', id).eq('tenant_id', scope.tenantId).eq('status', 'draft').maybeSingle();
  if (error) throw new PrivateReportDraftError(503);
  if (!data) throw new PrivateReportDraftError(404);
  if (data.tenant_id !== scope.tenantId || (data.brand_slug === 'all'
    ? scope.brandScope.kind !== 'all' : !isBrandInScope(scope, { slug: data.brand_slug }))) throw new PrivateReportDraftError(404);
  // A private draft never becomes a bearer report, nor the specialized August
  // reconciliation template. Source linkage is checked again before rendering.
  const { data: source, error: sourceError } = await db.from('client_reports')
    .select('id,tenant_id,brand_slug,report_type,period_start,period_end')
    .eq('id', data.source_report_id).eq('tenant_id', scope.tenantId).maybeSingle();
  if (sourceError) throw new PrivateReportDraftError(503);
  if (!source || source.brand_slug !== data.brand_slug || source.report_type !== data.report_type
    || source.period_start !== data.period_start || source.period_end !== data.period_end) throw new PrivateReportDraftError(404);
  const snapshot = data.snapshot as ClientReportSnapshot | null;
  if (!snapshot?.report || snapshot.reconciliation || !['performance', 'weekly', 'monthly'].includes(data.report_type)) throw new PrivateReportDraftError(503);
  try {
    const report = reviveReportDates(snapshot.report);
    if (!Number.isFinite(report.startDate.getTime()) || !Number.isFinite(report.endDate.getTime())
      || report.startDate.toISOString().slice(0, 10) !== data.period_start
      || report.endDate.toISOString().slice(0, 10) !== data.period_end
      || report.brandSlug !== data.brand_slug) throw new Error('Invalid snapshot scope');
  } catch { throw new PrivateReportDraftError(503); }
  return data as ClientReportRevisionDraft;
}

export function privateReportDraftRoutes(id: string) {
  const report = '/reporting/revisions/' + encodeURIComponent(id);
  const api = '/api/client-report-revisions/' + encodeURIComponent(id);
  return { report, pdf: api + '/pdf', csv: api + '/csv', videoLibrary: report + '/videos', videoCsv: api + '/videos', videoCover: api + '/cover' };
}

/** Optional live branding only; callers must first authorize the private draft. */
export async function privateReportDraftLogoUrl(draft: ClientReportRevisionDraft): Promise<string | null> {
  if (draft.brand_slug === 'all') return null;
  try {
    const db = await createAdminClient();
    const { data, error } = await db.from('brands_v2').select('logo_url')
      .eq('tenant_id', draft.tenant_id).eq('slug', draft.brand_slug).maybeSingle();
    return !error && typeof data?.logo_url === 'string' ? data.logo_url : null;
  } catch { return null; }
}

/** Private drafts use only saved evidence. Viewing must not reconstruct live data. */
export function privateReportDraftVideoLibrary(draft: ClientReportRevisionDraft): ReportVideoLibrary {
  const report = draft.snapshot.report;
  const creators: ReportVideoLibrary['creators'] = [];
  for (const creator of report.granular?.creators ?? []) {
    const key = reportVideoCreatorKey(creator);
    if (!key) continue;
    const handles = [...new Set([creator.handle, ...(creator.handles ?? [])].map(normalizeReportVideoHandle).filter(Boolean))];
    creators.push({ key, name: creator.realName || creator.name, handles });
  }
  const library: ReportVideoLibrary = {
    token: draft.id, preview: true, brandName: draft.brand_name, periodLabel: draft.period_label,
    reportCount: Number.isSafeInteger(report.creatorsCorner.videos) ? report.creatorsCorner.videos : null,
    basis: 'unavailable', evidence: null, creators,
    unavailableReason: 'A verified publication list was not saved with this private revision.',
  };
  try {
    const evidence = parsePublishedVideoEvidence(draft.snapshot.publishedVideoEvidence);
    if (evidence.periodStart !== draft.period_start || evidence.periodEnd !== draft.period_end) return library;
    return { ...library, basis: 'frozen', evidence, unavailableReason: undefined };
  } catch { return library; }
}

export function privateReportDraftMediaUrl(draft: ClientReportRevisionDraft, input: string): string | null {
  const parsed = parseTikTokVideoUrl(input);
  if (!parsed || parsed.url !== input) return null;
  const identity = parsed.url.toLowerCase();
  const topVideos = [...(draft.snapshot.report.topVideos ?? []), ...(draft.snapshot.report.creatorsCorner.topVideos ?? [])];
  if (topVideos.some(video => typeof video.videoUrl === 'string' && parseTikTokVideoUrl(video.videoUrl)?.url.toLowerCase() === identity)) return parsed.url;
  const evidence = privateReportDraftVideoLibrary(draft).evidence;
  return evidence?.videos.some(video => {
    const expected = `https://www.tiktok.com/@${video.creatorHandle}/video/${video.videoId}`;
    return parseTikTokVideoUrl(expected)?.url.toLowerCase() === identity
      && video.watchUrl != null && parseTikTokVideoUrl(video.watchUrl)?.url.toLowerCase() === identity;
  }) ? parsed.url : null;
}

export function privateReportDraftFailure(error: unknown): Response {
  const known = error instanceof PrivateReportDraftError ? error : new PrivateReportDraftError(503);
  return Response.json({ error: known.message }, { status: known.status, headers: PRIVATE_REPORT_HEADERS });
}
