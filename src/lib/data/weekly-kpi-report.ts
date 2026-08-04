/**
 * Weekly client KPI report — data fetcher.
 *
 * Server-only. One round-trip to get_weekly_kpi_report, which computes store
 * and managed GMV/SV for the window and the prior window, plus the roster
 * movements behind sections 3 and 4. Message building lives in the pure
 * ./weekly-kpi-format module so the client panel can re-render the preview as
 * the operator edits the narrative sections.
 *
 * Window: a '7d'/'30d' preset anchors to the latest day present in
 * creator_performance for these brands (uploads run a few days behind, so
 * anchoring to today would return a mostly-empty window). A custom
 * { start, end } is used verbatim, because the operator picked it. Either way
 * the resolved window is returned and shown in the UI, so what the client
 * receives is never a window nobody looked at.
 *
 * Unlike the brand client report this reads ONLY creator_performance, so it
 * anchors on that table alone rather than taking the oldest-of-latest across
 * creator and video tables. There is no second table to fall out of sync with.
 *
 * Throws on RPC failure. A client-facing money number must never render as a
 * fabricated zero.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getBrandRegistry, expandSlugs, brandLabel, type BrandRegistry } from '@/lib/data/brand-registry';
import {
  delta,
  type Delta,
  type PairedMetric,
  type RosterCreator,
  type WeeklyKpiData,
} from '@/lib/data/weekly-kpi-format';

export type KpiPeriod = '7d' | '30d' | { start: string; end: string };

/** Rows returned inside the aggregate's jsonb creator lists. */
interface AggCreator {
  name?: unknown;
  retainer?: unknown;
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isNaN(n) ? 0 : n;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "Jul 26 - Aug 1, 2026". Hyphen, not an en dash (house style). */
function rangeLabel(start: Date, end: Date): string {
  const s = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const e = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${s} - ${e}, ${end.getUTCFullYear()}`;
}

/** Latest daily report_date present for these brands, +1 so endDate lands on it. */
async function resolveAnchor(supabase: SupabaseClient, brandSlugs: string[] | null): Promise<Date> {
  let q = supabase
    .from('creator_performance')
    .select('report_date')
    .eq('period_type', 'daily')
    .order('report_date', { ascending: false })
    .limit(1);
  if (brandSlugs) q = q.in('brand', brandSlugs);
  const { data, error } = await q;
  if (error) throw new Error(`[weekly-kpi] anchor lookup failed: ${error.message}`);
  if (!data || data.length === 0) return new Date();
  const latest = new Date(data[0].report_date + 'T12:00:00Z');
  latest.setUTCDate(latest.getUTCDate() + 1);
  return latest;
}

/** Roster-grain slugs: a store slug also needs its parent umbrella, because
 *  managed_creators rows live at the roster/umbrella slug. Mirrors the brand
 *  client report's resolution so the two surfaces agree on who is managed. */
function resolveRosterSlugs(reg: BrandRegistry, brandSlug: string): string[] | null {
  if (!brandSlug || brandSlug === 'all') return null;
  const row = reg.bySlug.get(brandSlug);
  const parentSlug = row?.parent_brand_id ? reg.byId.get(row.parent_brand_id)?.slug : undefined;
  return parentSlug ? [brandSlug, parentSlug] : [brandSlug];
}

function pair(cur: number, prior: number, mCur: number, mPrior: number): PairedMetric {
  return {
    store: cur,
    storePrior: prior,
    storeDelta: delta(cur, prior),
    managed: mCur,
    managedPrior: mPrior,
    managedDelta: delta(mCur, mPrior),
  };
}

/** Map a capped jsonb creator list, reporting how many rows the cap dropped. */
function creatorList(raw: unknown, total: number): { creators: RosterCreator[]; truncated: number } {
  const rows = Array.isArray(raw) ? (raw as AggCreator[]) : [];
  const creators = rows.map(r => ({
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : 'Unnamed creator',
    retainer: num(r.retainer),
  }));
  return { creators, truncated: Math.max(0, total - creators.length) };
}

export async function getWeeklyKpiReport(
  brandSlug: string,
  period: KpiPeriod = '7d',
  clientOverride?: SupabaseClient,
): Promise<WeeklyKpiData> {
  const supabase = clientOverride ?? (await createClient());
  const reg = await getBrandRegistry();
  const brandName = brandSlug === 'all' ? 'All Brands' : brandLabel(reg, brandSlug);

  const dataSlugs = brandSlug && brandSlug !== 'all' ? expandSlugs(reg, brandSlug) : null;
  const rosterSlugs = resolveRosterSlugs(reg, brandSlug);

  // ── Resolve the window
  let startDate: Date, endDate: Date, periodDays: number;
  if (typeof period === 'object') {
    startDate = new Date(period.start + 'T12:00:00Z');
    endDate = new Date(period.end + 'T12:00:00Z');
    periodDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1);
  } else {
    periodDays = period === '30d' ? 30 : 7;
    const anchor = await resolveAnchor(supabase, dataSlugs);
    endDate = new Date(anchor);
    endDate.setUTCDate(anchor.getUTCDate() - 1);
    startDate = new Date(endDate);
    startDate.setUTCDate(endDate.getUTCDate() - (periodDays - 1));
  }

  const priorEnd = new Date(startDate);
  priorEnd.setUTCDate(startDate.getUTCDate() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setUTCDate(priorEnd.getUTCDate() - (periodDays - 1));

  const { data: raw, error } = await supabase.rpc('get_weekly_kpi_report', {
    p_data_slugs: dataSlugs,
    p_roster_slugs: rosterSlugs,
    p_start: fmtDate(startDate),
    p_end: fmtDate(endDate),
    p_prior_start: fmtDate(priorStart),
    p_prior_end: fmtDate(priorEnd),
  });
  if (error) throw new Error(`[weekly-kpi] get_weekly_kpi_report failed: ${error.message}`);
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const agg = (raw ?? {}) as Record<string, any>;

  const g = agg.gmv ?? {};
  const s = agg.sv ?? {};
  const adds = agg.roster_adds ?? {};
  const gone = agg.departures ?? {};
  const inact = agg.inactive ?? {};

  const gmv = pair(num(g.store), num(g.store_prior), num(g.managed), num(g.managed_prior));
  const sv = pair(num(s.store), num(s.store_prior), num(s.managed), num(s.managed_prior));

  const addsCount = num(adds.count);
  const goneCount = num(gone.count);
  const inactCount = num(inact.count);

  return {
    brandName,
    brandSlug,
    periodLabel: rangeLabel(startDate, endDate),
    priorLabel: rangeLabel(priorStart, priorEnd),
    startDate: fmtDate(startDate),
    endDate: fmtDate(endDate),
    periodDays,

    gmv,
    sv,
    // Share of store GMV. Null (renders as nothing) when the store total is
    // zero, rather than a 0% that reads as "we contributed nothing".
    managedSharePct: gmv.store > 0 ? (gmv.managed / gmv.store) * 100 : null,
    rosterSize: num(agg.roster_size),

    rosterAdds: {
      count: addsCount,
      withRetainer: num(adds.with_retainer),
      retainerBudget: num(adds.retainer_budget),
      ...creatorList(adds.creators, addsCount),
    },
    departures: {
      count: goneCount,
      retainerFreed: num(gone.retainer_freed),
      ...creatorList(gone.creators, goneCount),
    },
    inactive: {
      count: inactCount,
      contractedTotal: num(inact.contracted_total),
      retainerAtRisk: num(inact.retainer_at_risk),
      ...creatorList(inact.creators, inactCount),
    },
  };
}

export type { Delta, WeeklyKpiData };
