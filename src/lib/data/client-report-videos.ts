import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import { buildRegistry, expandSlugs, type BrandRow } from './brand-registry-core';
import { getPublishedVideoEvidence, parsePublishedVideoEvidence } from './published-video-evidence';
import { normalizeReportVideoHandle, reportVideoCreatorKey, type ReportVideoLibrary } from './published-video-evidence-types';
import type { ClientReportSnapshot } from './client-reports';

/** Read a report by its existing bearer token. Public inputs never select scope or dates. */
export async function getClientReportVideoLibrary(token: string): Promise<ReportVideoLibrary | null> {
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(token)) return null;
  const db = await createAdminClient();
  const { data: row, error } = await db.from('client_reports')
    .select('tenant_id,brand_slug,brand_name,period_start,period_end,period_label,snapshot,revoked_at')
    .eq('token', token).maybeSingle();
  if (error) throw new Error('The report video library could not be loaded.');
  if (!row || row.revoked_at) return null;
  const snapshot = row.snapshot as ClientReportSnapshot | null;
  const report = snapshot?.report;
  const exclusions = report?.reportingExclusions;
  const excludedHandles = new Set((Array.isArray(exclusions?.handles) ? exclusions.handles : [])
    .filter(value => typeof value === 'string').map(normalizeReportVideoHandle));
  const excludedIds = new Set(Array.isArray(exclusions?.creatorIds) ? exclusions.creatorIds : []);
  const creators = new Map<string, ReportVideoLibrary['creators'][number]>();
  let malformedCohort = Boolean(exclusions && (!Array.isArray(exclusions.handles) || !Array.isArray(exclusions.creatorIds)));
  for (const creator of Array.isArray(report?.granular?.creators) ? report.granular.creators : []) {
    if (!creator || typeof creator !== 'object') { malformedCohort = true; continue; }
    if ((creator.handles !== undefined && (!Array.isArray(creator.handles) || creator.handles.some(value => typeof value !== 'string')))
      || (creator.handle != null && typeof creator.handle !== 'string')) malformedCohort = true;
    const handle = typeof creator.handle === 'string' ? creator.handle : null;
    const aliases = (Array.isArray(creator.handles) ? creator.handles : []).filter(value => typeof value === 'string');
    const creatorId = typeof creator.creatorId === 'string' ? creator.creatorId : null;
    const key = reportVideoCreatorKey({ creatorId, handle, handles: aliases });
    const handles = [...new Set([handle, ...aliases]
      .map(normalizeReportVideoHandle).filter(Boolean))];
    if (!key || excludedIds.has(creatorId ?? '') || handles.some(value => excludedHandles.has(value))) continue;
    const existing = creators.get(key);
    creators.set(key, {
      key, name: (typeof creator.realName === 'string' && creator.realName)
        || (typeof creator.name === 'string' && creator.name) || (handles[0] ? `@${handles[0]}` : 'Creator'),
      handles: [...new Set([...(existing?.handles ?? []), ...handles])],
    });
  }
  const reported = report?.creatorsCorner?.videos;
  const library: ReportVideoLibrary = {
    token, brandName: row.brand_name, periodLabel: row.period_label,
    reportCount: typeof reported === 'number' && Number.isSafeInteger(reported) && reported >= 0 ? reported : null,
    basis: 'unavailable', evidence: null,
    creators: [...creators.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };

  if (snapshot?.publishedVideoEvidence !== undefined) {
    // A frozen list is authoritative. Never silently replace a damaged list
    // with current records or query today's roster to widen it.
    try {
      const evidence = parsePublishedVideoEvidence(snapshot.publishedVideoEvidence);
      if (evidence.periodStart !== row.period_start || evidence.periodEnd !== row.period_end) throw new Error('Period mismatch');
      return { ...library, basis: 'frozen', evidence };
    } catch {
      return { ...library, unavailableReason: 'This report’s saved video list could not be verified. Ask your agency contact for a corrected report.' };
    }
  }

  if (!report?.granular || !Array.isArray(report.granular.creators)) {
    return { ...library, unavailableReason: 'This older report did not save a complete creator roster, so Tempo cannot safely reconstruct its published videos.' };
  }
  if (malformedCohort) {
    return { ...library, unavailableReason: 'This older report’s saved creator accounts could not be verified. Ask your agency contact for a new report.' };
  }
  if (!row.tenant_id || !row.brand_slug || row.brand_slug === 'all') {
    return { ...library, unavailableReason: 'This older report did not preserve the brand scope needed to reconstruct its videos. Ask your agency contact for a new report.' };
  }

  // Legacy reports have no frozen video evidence. Use only their frozen
  // creator handles; current roster edits and roles must not select people.
  const handles = [...new Set(library.creators.flatMap(creator => creator.handles))];
  if (report.granular.creators.length > 0 && handles.length === 0) {
    return { ...library, unavailableReason: 'This older report did not save usable TikTok accounts for its creators.' };
  }
  try {
    const registryResult = await db.from('brands_v2')
      .select('id,slug,name,display_name,color,is_archived,is_umbrella,parent_brand_id,store_order', { count: 'exact' })
      .eq('tenant_id', row.tenant_id);
    if (registryResult.error || !registryResult.data || registryResult.count !== registryResult.data.length) throw new Error('Brand scope unavailable');
    const registry = buildRegistry(registryResult.data as BrandRow[]);
    if (!registry.bySlug.has(row.brand_slug)) throw new Error('Brand scope unavailable');
    const evidence = await getPublishedVideoEvidence({
      tenantId: row.tenant_id, rosterSlugs: [], dataSlugs: expandSlugs(registry, row.brand_slug),
      start: row.period_start, end: row.period_end, frozenHandles: handles,
    }, db);
    return { ...library, basis: 'reconstructed', evidence };
  } catch {
    return { ...library, unavailableReason: 'The saved video records could not be loaded. Your original report is unchanged; please try again shortly.' };
  }
}
