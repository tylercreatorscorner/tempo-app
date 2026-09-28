import { getRosterSummaryRetainer } from '@/lib/data/roster-summary-retainer';
import { expandSlugs, resolveUuids, type BrandRegistry } from '@/lib/data/brand-registry';
import { getAnalyticsBrandTotals } from '@/lib/data/rpc';
import { buildManagedLookup, computeManagedGmv, sumManagedGmvForBrands, type ManagedGmvResult } from '@/lib/data/managed-gmv';
import type { WorkspaceScope } from '@/lib/auth/workspace-scope';

export interface RosterSummaryResult {
  totalGmvPeriod: number;
  summary: {
    affiliate_gmv: number;
    affiliate_gmv_prev: number;
    managed_gmv_prev: number;
    managed_gmv_30d: number;
    total_retainer: number | null;
  };
}

export async function loadRosterSummary({ scope, brand, storeFilter, pStartDate, pEndDate, periodDays, reg }: {
  scope: WorkspaceScope;
  brand: string | null;
  storeFilter: string | null;
  pStartDate: string | null;
  pEndDate: string | null;
  periodDays: number;
  reg: BrandRegistry;
}): Promise<RosterSummaryResult> {
  const scoped = scope.brandScope.kind === 'scoped';
  const allowedSlugs = scope.brandScope.kind === 'scoped' ? scope.brandScope.brandSlugs : null;
  const sEnd = pEndDate ?? new Date().toISOString().slice(0, 10);
  const sStart = pStartDate ?? (() => {
    const d = new Date(sEnd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - periodDays);
    return d.toISOString().slice(0, 10);
  })();
  const sStartD = new Date(sStart + 'T00:00:00Z');
  const sEndD = new Date(sEnd + 'T00:00:00Z');
  const winLen = Math.round((sEndD.getTime() - sStartD.getTime()) / 86400000) + 1;
  const pvEndD = new Date(sStartD); pvEndD.setUTCDate(pvEndD.getUTCDate() - 1);
  const pvStartD = new Date(pvEndD); pvStartD.setUTCDate(pvStartD.getUTCDate() - (winLen - 1));
  const pvStartStr = pvStartD.toISOString().slice(0, 10);
  const pvEndStr = pvEndD.toISOString().slice(0, 10);
  const roiEndStr = new Date().toISOString().slice(0, 10);
  const roiStartD = new Date(roiEndStr + 'T00:00:00Z'); roiStartD.setUTCDate(roiStartD.getUTCDate() - 29);
  const roiStartStr = roiStartD.toISOString().slice(0, 10);

  const resolved = resolveUuids(reg, brand);
  const brandIds = resolved && resolved.length === 0 ? ['00000000-0000-0000-0000-000000000000'] : resolved;
  let affBrandIds: string[] = [];
  if (brand && brand !== 'all') {
    affBrandIds = (brandIds ?? []).filter(id => id !== '00000000-0000-0000-0000-000000000000');
  } else {
    const rosterSlugs = scoped
      ? allowedSlugs!
      : reg.rows.filter(r => r.parent_brand_id == null && !r.is_archived).map(r => r.slug);
    affBrandIds = rosterSlugs
      .flatMap(s => expandSlugs(reg, s))
      .map(s => reg.bySlug.get(s)?.id)
      .filter((id): id is string => !!id);
  }

  const kpiStoreSlugs: string[] | null =
    storeFilter ? [storeFilter]
    : (brand && brand !== 'all') ? expandSlugs(reg, brand)
    : scoped ? allowedSlugs!.flatMap(s => expandSlugs(reg, s))
    : null;
  const sumMg = (r: ManagedGmvResult) =>
    kpiStoreSlugs === null
      ? Array.from(r.byStore.values()).reduce((s, v) => s + v, 0)
      : sumManagedGmvForBrands(r, reg, kpiStoreSlugs);

  // Start the two affiliate totals and the retainer read while the date-independent
  // managed lookup is being assembled. The three managed windows share that lookup.
  const affCurPromise = affBrandIds.length
    ? getAnalyticsBrandTotals(affBrandIds, sStart, sEnd).catch(e => {
        console.error('[roster] analytics_brand_totals (current period) failed:', e);
        return [];
      })
    : Promise.resolve([]);
  const affPrevPromise = affBrandIds.length
    ? getAnalyticsBrandTotals(affBrandIds, pvStartStr, pvEndStr).catch(e => {
        console.error('[roster] analytics_brand_totals (previous period) failed:', e);
        return [];
      })
    : Promise.resolve([]);
  const retainerPromise = storeFilter ? Promise.resolve(null) : getRosterSummaryRetainer(scope, brand);
  const kpiLookup = await buildManagedLookup(kpiStoreSlugs, reg);
  const [affCur, affPrev, mgCur, mgPrev, mg30, summaryRetainer] = await Promise.all([
    affCurPromise,
    affPrevPromise,
    computeManagedGmv(sStart, sEnd, kpiStoreSlugs, reg, kpiLookup),
    computeManagedGmv(pvStartStr, pvEndStr, kpiStoreSlugs, reg, kpiLookup),
    computeManagedGmv(roiStartStr, roiEndStr, kpiStoreSlugs, reg, kpiLookup),
    retainerPromise,
  ]);
  const sumTotalGmv = (rows: unknown) => ((rows as Array<{ total_gmv: number | string }> | null) ?? [])
    .reduce((s, r) => s + (Number(r.total_gmv) || 0), 0);
  return {
    totalGmvPeriod: sumMg(mgCur),
    summary: {
      affiliate_gmv: sumTotalGmv(affCur),
      affiliate_gmv_prev: sumTotalGmv(affPrev),
      managed_gmv_prev: sumMg(mgPrev),
      managed_gmv_30d: sumMg(mg30),
      total_retainer: summaryRetainer,
    },
  };
}
