import {
  getAnalyticsBrandSummaries,
  getAnalyticsCreatorRankings,
  getAnalyticsVideos,
  getAnalyticsDailyTrend,
  getAnalyticsProducts,
} from '@/lib/data/rpc';
import { getBrandRegistry, expandSlugs } from '@/lib/data/brand-registry';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import type { DailyMetrics } from '@/components/analytics/performance-chart';
import type { BrandChange, CreatorBreakout, HotPost, TopProduct } from '@/components/analytics/notable-changes';

/**
 * The trend chart, Notable Changes, and month-end Pacing — extracted from the
 * (retired) Analytics page so the Dashboard can fold them in. Resolves brand_ids
 * + the managed-creator lookup, runs the analytics_* RPCs (current / prior / YoY),
 * and derives the props the three components need. Self-contained + brand-scoped.
 */

export interface FoldInAnalytics {
  trend: { data: DailyMetrics[]; priorData: DailyMetrics[]; yoyData?: DailyMetrics[]; accentColor?: string };
  notable: {
    brandRiser: BrandChange | null;
    brandFaller: BrandChange | null;
    creatorBreakout: CreatorBreakout | null;
    hotPost: HotPost | null;
    topProduct: TopProduct | null;
    hasAny: boolean;
  };
  pacing: { daysElapsed: number; periodLength: number; gmvToDate: number; periodLabel: string } | null;
}

const fmtISO = (d: Date) => d.toISOString().split('T')[0];

function priorPeriod(startDate: string, endDate: string) {
  const start = new Date(startDate), end = new Date(endDate);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - (days - 1));
  return { prevStart: fmtISO(prevStart), prevEnd: fmtISO(prevEnd) };
}
function yoyPeriod(startDate: string, endDate: string) {
  const shift = (s: string) => { const d = new Date(s); d.setFullYear(d.getFullYear() - 1); return fmtISO(d); };
  return { start: shift(startDate), end: shift(endDate) };
}
function dateRange(startDate: string, endDate: string): string[] {
  const out: string[] = []; const cur = new Date(startDate); const end = new Date(endDate);
  while (cur <= end) { out.push(fmtISO(cur)); cur.setDate(cur.getDate() + 1); }
  return out;
}

export async function getFoldInAnalytics(opts: {
  startDate: string;
  endDate: string;
  preset?: string;
  brandFilter: string | null;
  allowedBrands: string[] | null;
}): Promise<FoldInAnalytics> {
  const { startDate, endDate, preset, brandFilter, allowedBrands } = opts;
  const { prevStart, prevEnd } = priorPeriod(startDate, endDate);
  const yoy = yoyPeriod(startDate, endDate);

  const reg = await getBrandRegistry();
  const supabase = await createClient();

  let brandsQuery = supabase.from('brands_v2').select('id, slug').eq('is_archived', false);
  if (allowedBrands) brandsQuery = brandsQuery.in('slug', allowedBrands);
  const { data: dbBrands } = await brandsQuery;
  const slugToId = new Map<string, string>();
  for (const b of dbBrands ?? []) slugToId.set(b.slug, b.id);

  const dataSlugs = brandFilter
    ? expandSlugs(reg, brandFilter)
    : (dbBrands ?? [])
        .map((b) => b.slug)
        .filter((s) => !reg.rows.find((r) => r.slug === s)?.parent_brand_id)
        .flatMap((b) => expandSlugs(reg, b));
  const BRAND_IDS = dataSlugs.map((s) => slugToId.get(s)).filter((id): id is string => Boolean(id));

  // managed (handle|||data-slug) lookup
  const admin = await createAdminClient();
  let mq = admin.from('managed_creators')
    .select('id, brand, account_1, account_2, account_3, account_4, account_5')
    .is('archived_at', null);
  if (allowedBrands) mq = mq.in('brand', allowedBrands);
  const { data: managedRows } = await mq;
  const managedSet = new Set<string>();
  const norm = (h: string) => h.replace(/^@/, '').trim().toLowerCase();
  for (const m of managedRows ?? []) {
    if (!m.brand) continue;
    for (const acct of [m.account_1, m.account_2, m.account_3, m.account_4, m.account_5]) {
      if (!acct) continue;
      for (const db of expandSlugs(reg, m.brand)) managedSet.add(`${norm(acct)}|||${db}`);
    }
  }

  const swallow = () => [] as never[];
  const [bsCur, bsPrev, trendCur, trendPrev, trendYoy, crCur, crPrev, videos, prodCur, prodPrev] = await Promise.all([
    getAnalyticsBrandSummaries(BRAND_IDS, startDate, endDate).catch(swallow),
    getAnalyticsBrandSummaries(BRAND_IDS, prevStart, prevEnd).catch(swallow),
    getAnalyticsDailyTrend(BRAND_IDS, startDate, endDate).catch(swallow),
    getAnalyticsDailyTrend(BRAND_IDS, prevStart, prevEnd).catch(swallow),
    getAnalyticsDailyTrend(BRAND_IDS, yoy.start, yoy.end).catch(swallow),
    getAnalyticsCreatorRankings(BRAND_IDS, startDate, endDate, 500).catch(swallow),
    getAnalyticsCreatorRankings(BRAND_IDS, prevStart, prevEnd, 500).catch(swallow),
    getAnalyticsVideos(BRAND_IDS, startDate, endDate, 200).catch(swallow),
    getAnalyticsProducts(BRAND_IDS, startDate, endDate, 50).catch(swallow),
    getAnalyticsProducts(BRAND_IDS, prevStart, prevEnd, 200).catch(swallow),
  ]);

  const totals = bsCur.reduce((a, s) => { a.gmv += s.total_gmv; return a; }, { gmv: 0 });

  // ── Trend (zero-filled for index-aligned overlays) ──
  const buildTrend = (rows: Awaited<ReturnType<typeof getAnalyticsDailyTrend>>, s: string, e: string): DailyMetrics[] => {
    const byDate = new Map<string, { gmv: number; orders: number; items: number; videos: number }>();
    for (const r of rows) byDate.set(r.report_date, { gmv: r.daily_gmv, orders: r.daily_orders, items: r.daily_items_sold, videos: r.daily_videos });
    return dateRange(s, e).map((date) => ({ date, ...(byDate.get(date) ?? { gmv: 0, orders: 0, items: 0, videos: 0 }) }));
  };
  const data = buildTrend(trendCur, startDate, endDate);
  const priorData = buildTrend(trendPrev, prevStart, prevEnd);
  const yoyData = buildTrend(trendYoy, yoy.start, yoy.end);
  const yoyHasData = yoyData.some((d) => d.gmv > 0 || d.orders > 0 || d.videos > 0);

  // ── Notable changes ──
  const prevByBrand = new Map<string, number>();
  for (const s of bsPrev) prevByBrand.set(s.brand_slug, s.total_gmv);
  const brandDeltas: BrandChange[] = bsCur.map((s) => {
    const cur = s.total_gmv, pri = prevByBrand.get(s.brand_slug) ?? 0;
    const delta_pct = pri === 0 ? (cur > 0 ? 100 : 0) : ((cur - pri) / pri) * 100;
    return { brand: s.brand_slug, current: cur, prior: pri, delta_pct };
  }).filter((b) => b.current > 500 || b.prior > 500);
  const riser = brandDeltas.filter((b) => b.delta_pct > 0).sort((a, b) => b.delta_pct - a.delta_pct)[0] ?? null;
  const faller = brandDeltas.filter((b) => b.delta_pct < 0).sort((a, b) => a.delta_pct - b.delta_pct)[0] ?? null;
  const brandRiser = brandDeltas.length > 1 ? riser : null;
  const brandFaller = brandDeltas.length > 1 ? faller : null;

  const prevCreatorMap = new Map<string, number>();
  for (const c of crPrev) prevCreatorMap.set(`${norm(c.creator_name)}|||${c.brand_slug}`, c.total_gmv);
  let creatorBreakout: CreatorBreakout | null = null;
  let bestScore = 0;
  for (const c of crCur) {
    if (c.total_gmv < 1000) continue;
    const key = `${norm(c.creator_name)}|||${c.brand_slug}`;
    const prior = prevCreatorMap.get(key) ?? 0;
    const delta_pct = prior === 0 ? (c.total_gmv > 1000 ? 999 : 0) : ((c.total_gmv - prior) / prior) * 100;
    const score = delta_pct * Math.log(c.total_gmv);
    if (delta_pct > 50 && score > bestScore) {
      bestScore = score;
      creatorBreakout = { creator_name: c.creator_name, brand: c.brand_slug, current_gmv: c.total_gmv, prior_gmv: prior, delta_pct, is_managed: managedSet.has(key) };
    }
  }

  let hotPost: HotPost | null = null;
  let bestVelocity = 0;
  for (const v of videos) {
    if (v.days_active === 0 || v.days_active > 7 || v.total_gmv < 500) continue;
    const velocity = v.total_gmv / v.days_active;
    if (velocity > bestVelocity) {
      bestVelocity = velocity;
      hotPost = { video_id: v.video_id, video_title: v.video_title || 'Untitled', creator_name: v.creator_name, brand: v.brand_slug, total_gmv: v.total_gmv, days_active: v.days_active, velocity };
    }
  }

  const topRow = prodCur[0] ?? null;
  const topProduct: TopProduct | null = topRow ? (() => {
    const prior = prodPrev.find((p) => p.brand_slug === topRow.brand_slug && p.product_name === topRow.product_name)?.total_gmv ?? 0;
    const delta_pct = prior === 0 ? (topRow.total_gmv > 0 ? 100 : 0) : ((topRow.total_gmv - prior) / prior) * 100;
    return { product_name: topRow.product_name, brand: topRow.brand_slug, current_gmv: topRow.total_gmv, prior_gmv: prior, delta_pct };
  })() : null;

  // ── Pacing (only for an in-progress 'thisMonth' view) ──
  const pacing = (() => {
    if (preset !== 'thisMonth') return null;
    const start = new Date(startDate), end = new Date(endDate);
    const daysElapsed = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
    const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    const periodLength = Math.round((monthEnd.getTime() - monthStart.getTime()) / 86400000) + 1;
    if (daysElapsed >= periodLength) return null;
    return { daysElapsed, periodLength, gmvToDate: totals.gmv, periodLabel: monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
  })();

  return {
    trend: { data, priorData, yoyData: yoyHasData ? yoyData : undefined, accentColor: brandFilter ? (reg.bySlug.get(brandFilter)?.color ?? undefined) : undefined },
    notable: { brandRiser, brandFaller, creatorBreakout, hotPost, topProduct, hasAny: !!(brandRiser || brandFaller || creatorBreakout || hotPost || topProduct) },
    pacing,
  };
}
