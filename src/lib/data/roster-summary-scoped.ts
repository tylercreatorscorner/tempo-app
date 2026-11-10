import { getRosterSummaryRetainer } from '@/lib/data/roster-summary-retainer';
import { buildRegistry, expandSlugs, type BrandRegistry, type BrandRow } from '@/lib/data/brand-registry-core';
import { getPublishedVideoCounts } from '@/lib/data/published-videos';
import { createAdminClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/data/fetch-all-rows';
import type { WorkspaceScope } from '@/lib/auth/workspace-scope';

export interface RosterSummaryResult {
  totalGmvPeriod: number | null;
  summary: {
    affiliate_gmv: number | null; affiliate_gmv_prev: number | null;
    managed_gmv_prev: number | null; managed_gmv_30d: number | null;
    total_retainer: number | null; videos_published: number | null;
    retainer_complete: boolean; retainer_missing_count: number | null;
    gmv_complete: boolean; videos_complete: boolean;
    period_start: string; period_end: string;
  };
}

/** Service-role reads must bind the registry to the workspace, including all-brands. */
export async function getRosterSummaryRegistry(scope: WorkspaceScope): Promise<BrandRegistry> {
  const admin = await createAdminClient();
  return buildRegistry(await fetchAllRows<BrandRow>(() => admin.from('brands_v2')
    .select('id, slug, name, display_name, color, is_archived, is_umbrella, parent_brand_id, store_order')
    .eq('tenant_id', scope.tenantId).order('id'), 'roster-summary-brands'));
}

export function rosterSummarySelection(scope: WorkspaceScope, reg: BrandRegistry, brand: string | null, store: string | null) {
  const allowed = scope.brandScope.kind === 'scoped' ? new Set(scope.brandScope.brandSlugs) : null;
  const selected = brand && brand !== 'all' ? [brand] : reg.rows.filter(b => !b.is_archived
    && (allowed ? allowed.has(b.slug) && !(b.parent_brand_id && allowed.has(reg.byId.get(b.parent_brand_id)?.slug ?? '')) : b.parent_brand_id === null)).map(b => b.slug);
  if (selected.some(slug => !reg.bySlug.has(slug) || reg.bySlug.get(slug)!.is_archived || (allowed && !allowed.has(slug)))) throw new Error('Roster summary brand is outside the workspace scope.');
  const expanded = [...new Set(selected.flatMap(slug => expandSlugs(reg, slug)))].filter(slug => {
    const row = reg.bySlug.get(slug);
    return row && !row.is_archived && !row.is_umbrella;
  });
  if (store && !expanded.includes(store)) throw new Error('Roster summary store is outside the selected brand scope.');
  const dataSlugs = store ? [store] : expanded;
  // Disjoint store groups prevent management for A from granting attribution on B.
  const groups = dataSlugs.map(slug => ({ data: slug, roster: [...new Set(selected.filter(roster => expandSlugs(reg, roster).includes(slug)).flatMap(roster => [roster, slug]))] }));
  return { rosterSlugs: selected, dataSlugs, groups };
}

function shift(day: string, count: number) {
  const value = new Date(day + 'T00:00:00Z');
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}
function number(value: unknown): number {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) throw new Error('Roster summary metric is missing.');
  return Number(value);
}
async function optional<T>(operation: () => Promise<T>): Promise<T | null> {
  try { return await operation(); } catch { return null; }
}

export async function loadRosterSummary({ scope, brand, storeFilter, pStartDate, pEndDate, periodDays, reg }: {
  scope: WorkspaceScope; brand: string | null; storeFilter: string | null;
  pStartDate: string | null; pEndDate: string | null; periodDays: number; reg: BrandRegistry;
}): Promise<RosterSummaryResult> {
  const end = pEndDate ?? new Date().toISOString().slice(0, 10);
  const start = pStartDate ?? shift(end, -periodDays);
  const length = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  // Legacy days_back is inclusive (366 means 367 dates). Wider custom windows
  // keep the roster usable while these bounded optional metrics are unavailable.
  const supportedWindow = Number.isFinite(length) && length > 0 && length <= 400;
  const selection = rosterSummarySelection(scope, reg, brand, storeFilter);
  const admin = await createAdminClient();
  const budgetSlugs = [...new Set(selection.groups.flatMap(group => group.roster))];
  const budgetScope: WorkspaceScope = { ...scope, brandScope: { kind: 'scoped',
    brandSlugs: budgetSlugs, brandIds: budgetSlugs.map(slug => reg.bySlug.get(slug)!.id) } };
  // Slug expansion selects each saved contract once, including child-only terms.
  // Identity dedup stays creator+brand; distinct contracts are never guessed equal.
  const retainer = optional(() => storeFilter ? Promise.resolve(null) : getRosterSummaryRetainer(budgetScope, null, budgetSlugs));
  const publications = optional(() => !supportedWindow ? Promise.resolve(null) : getPublishedVideoCounts({ tenantId: scope.tenantId,
    rosterSlugs: selection.rosterSlugs, dataSlugs: selection.dataSlugs,
    // Only the selected-period count is displayed here. Reusing that window
    // avoids scanning a second month solely for an unused comparison.
    start, end, priorStart: start, priorEnd: end }));
  const performance = optional(async () => {
    if (!supportedWindow || !selection.groups.length) return null;
    const { data, error } = await admin.rpc('get_roster_summary_workspace', {
      p_tenant_id: scope.tenantId, p_data_slugs: selection.dataSlugs,
      p_roster_slugs: budgetSlugs, p_start: start, p_end: end,
    }).abortSignal(AbortSignal.timeout(25_000));
    if (error || !data) throw new Error('Managed performance unavailable.');
    const complete = data.coverage_complete === true;
    const recordedGmv = data.managed_gmv === null ? null : number(data.managed_gmv);
    const recordedAffiliate = data.affiliate_gmv === null ? null : number(data.affiliate_gmv);
    return { gmv: complete || recordedGmv !== 0 ? recordedGmv : null,
      affiliate: complete || recordedAffiliate !== 0 ? recordedAffiliate : null, complete };

  });
  const [budget, videos, gmv] = await Promise.all([retainer, publications, performance]);
  return { totalGmvPeriod: gmv?.gmv ?? null, summary: {
    affiliate_gmv: gmv?.affiliate ?? null, affiliate_gmv_prev: null,
    managed_gmv_prev: null, managed_gmv_30d: null,
    total_retainer: budget?.total ?? null, retainer_complete: budget?.complete === true,
    retainer_missing_count: budget?.missingCount ?? null,
    videos_published: videos && (videos.currentComplete || videos.total > 0) ? videos.total : null,
    gmv_complete: gmv?.complete === true, videos_complete: videos?.currentComplete === true,
    period_start: start, period_end: end,
  } };
}
