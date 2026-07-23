/**
 * Brand Client Report — data fetcher.
 *
 * Pulls everything needed for the polished weekly/monthly PDF that goes to
 * brand clients (matching the structure of the old Netlify dashboard report):
 *
 *   Cover · Executive Summary · Highlight Cards · Total GMV · KPIs ·
 *   Managed vs Organic · New vs Returning · Day-of-Week · Daily Perf ·
 *   Top Creators · Top Videos · Top Products · Product↔Creator Breakdown
 *
 * Reads the CSV-fed source-of-truth tables (keyed by brand SLUG), same as the
 * roster and text reports after migration 042. The v2 daily_* tables were a
 * lossy ~17-22% subset fed by a sync trigger that silently dropped whole brands
 * (e.g. cosrx), so the client PDF disagreed with the roster — repointing here
 * fixes that and makes every brand's report consistent.
 *
 *   creator_performance  — creator-level daily rows (GMV, orders, videos,
 *                          est_commission, WoW deltas, new/returning, daily perf)
 *   video_performance    — video×product daily rows (top videos with titles/links,
 *                          top products, per-product creator breakdown)
 *   managed_creators     — flags which tiktok handles are signed (managed vs organic)
 *
 * Like discord-posts, anchors the period to the latest report_date in the
 * data tables — uploads are usually a few days behind real time and we'd
 * otherwise return empty windows.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getBrandRegistry, expandSlugs, type BrandRegistry } from '@/lib/data/brand-registry';

export type ReportPeriod = '7d' | '30d';

export interface BrandClientReportData {
  brandName: string;
  brandSlug: string;
  startDate: Date;
  endDate: Date;
  periodLabel: string;          // "Apr 7 – Apr 13, 2026"
  periodLengthDays: number;     // 7 or 30

  // Headline numbers
  totalGmv: number;
  totalOrders: number;
  totalVideos: number;
  activeCreators: number;
  avgOrderValue: number;
  avgGmvPerCreator: number;
  estCommission: number;

  // WoW (or MoM) comparisons
  priorTotalGmv: number;
  priorTotalOrders: number;
  priorActiveCreators: number;
  priorTotalVideos: number;
  gmvChangePct: number | null;       // null when prior was 0
  orderChangePct: number | null;
  creatorChangePct: number | null;
  videoChangePct: number | null;

  // Highlight cards
  topCreator: { name: string; gmv: number; orders: number; videos: number } | null;
  topVideo: { title: string; creator: string; gmv: number; orders: number; videoUrl: string | null } | null;
  bestDay: { date: Date; weekday: string; gmv: number; orders: number; creators: number } | null;

  // Managed vs Organic
  managed: { gmv: number; creatorCount: number; orders: number };
  organic: { gmv: number; creatorCount: number; orders: number };
  managedPct: number;            // 0–100

  // Dedicated "What Creators Corner Is Delivering" section. All figures are
  // the managed (signed-creator) subset of this brand's store performance.
  creatorsCorner: {
    // Contribution + trend
    gmv: number;
    orders: number;
    creatorCount: number;        // signed creators active this period
    videos: number;
    commission: number;          // estimated, managed subset
    pctOfStoreGmv: number;       // managed GMV / total store GMV * 100
    priorGmv: number;
    priorOrders: number;
    priorCreatorCount: number;
    gmvChangePct: number | null; // null = "from zero" (render as "new")
    orderChangePct: number | null;
    // Efficiency vs organic (managed creators usually outperform; honest when not)
    managedAov: number;
    organicAov: number;
    managedGmvPerCreator: number;
    organicGmvPerCreator: number;
    // Roster activation
    signedCreatorCount: number;  // total signed creators on the brand
    activeCreatorCount: number;  // signed creators active this period
    newlyActivatedCount: number; // active now, not active prior period
    // Leaderboards (managed only)
    topCreators: { name: string; videos: number; gmv: number; orders: number; pctOfManaged: number }[];
    topVideos: { title: string; creator: string; gmv: number; orders: number; videoUrl: string | null }[];
  };

  // New vs Returning
  newCreators: { count: number; gmv: number };
  returningCreators: { count: number; gmv: number };

  // Day of week + Daily perf
  dayOfWeek: { day: string; gmv: number; isPeak: boolean }[];   // Sun..Sat
  dailyPerformance: { date: Date; weekday: string; gmv: number; orders: number; creators: number; isPeak: boolean }[];

  // Leaderboards
  topCreators: { name: string; videos: number; gmv: number; orders: number; pctOfTotal: number }[];
  topVideos: { title: string; creator: string; gmv: number; orders: number; videoUrl: string | null }[];
  topProducts: { name: string; gmv: number; orders: number; pctOfTotal: number }[];

  // Per-product creator breakdown (top 5 products, top 3 creators each)
  productCreatorBreakdown: {
    productName: string;
    productGmv: number;
    productOrders: number;
    pctOfTotal: number;
    topCreators: { name: string; gmv: number }[];
  }[];
}

// ── Helpers ────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

/**
 * Resolve a roster brand slug to the data-table brand slugs to filter on.
 * Umbrella brands (leefar) expand to their per-store slugs — creator_performance
 * and video_performance are keyed by store slug, not the umbrella. 'all' (or
 * empty) returns null = no brand filter (every brand).
 */
function getBrandDataSlugs(reg: BrandRegistry, brandFilter: string): string[] | null {
  if (!brandFilter || brandFilter === 'all') return null;
  return expandSlugs(reg, brandFilter);
}

function pctChange(curr: number, prior: number): number | null {
  if (prior === 0) return curr > 0 ? null : 0;     // null = "from zero" (we'll render as "new")
  return ((curr - prior) / prior) * 100;
}

// Anchor to the oldest of the latest dates across all tables we'll query.
// For a client-facing report, internal consistency across sections matters
// more than freshness — if video data is from Mar 14 but creator data is from
// Apr 26, anchoring to creator latest would produce a report where the
// headline GMV is from one week and "Top Videos" is from another (or empty).
// Using the oldest shared date guarantees every section reports on the
// same window, even if it means the report is a few weeks behind real time.
async function resolveSharedAnchor(supabase: any, brandSlugs: string[] | null): Promise<Date> {
  // Anchor to the oldest of the latest dates across the creator- and
  // video-level source tables so every section reports on the same window.
  const tables: ('creator_performance' | 'video_performance')[] = [
    'creator_performance',
    'video_performance',
  ];
  const latests = await Promise.all(tables.map(async (t) => {
    let q = supabase.from(t).select('report_date')
      .eq('period_type', 'daily')
      .order('report_date', { ascending: false }).limit(1);
    if (brandSlugs) q = q.in('brand', brandSlugs);
    const { data } = await q;
    if (!data || data.length === 0) return null;
    return new Date(data[0].report_date + 'T12:00:00Z');
  }));
  const valid = latests.filter((d): d is Date => d !== null);
  if (valid.length === 0) return new Date();
  // Oldest of the latest dates
  const oldestLatest = valid.reduce((min, d) => d.getTime() < min.getTime() ? d : min);
  // Add 1 day so endDate (= today - 1) lands on that latest data day
  oldestLatest.setUTCDate(oldestLatest.getUTCDate() + 1);
  return oldestLatest;
}

// Paginated fetch helper (same as discord-posts but inlined to avoid coupling)
async function paginatedFetch(
  supabase: any,
  table: string,
  columns: string,
  filters: { column: string; op: string; value: any }[]
): Promise<any[]> {
  const PAGE_SIZE = 1000;
  const allData: any[] = [];
  let from = 0;
  while (true) {
    let query = supabase.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    for (const f of filters) {
      switch (f.op) {
        case 'eq':  query = query.eq(f.column, f.value); break;
        case 'in':  query = query.in(f.column, f.value); break;
        case 'gte': query = query.gte(f.column, f.value); break;
        case 'lte': query = query.lte(f.column, f.value); break;
        case 'lt':  query = query.lt(f.column, f.value); break;
        case 'gt':  query = query.gt(f.column, f.value); break;
      }
    }
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;
    allData.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allData;
}

// Build the set of "managed" tiktok handles for this brand filter.
// managed_creators stores up to 10 handles per signed creator; flatten and lowercase them.
//
// Paged past PostgREST's silent 1000-row cap: managed_creators is over it, and
// the truncated tail silently misclassified real signed creators as "organic"
// on the client-facing managed/organic split. Errors THROW — a partial handle
// set is a confidently wrong money number on a client PDF, same class of lie
// as rendering $0 for a failed read.
async function getManagedHandleSet(supabase: any, brandSlug: string): Promise<Set<string>> {
  const PAGE = 1000;
  const set = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from('managed_creators')
      .select('account_1, account_2, account_3, account_4, account_5, account_6, account_7, account_8, account_9, account_10')
      .order('id')
      .range(from, from + PAGE - 1);
    if (brandSlug && brandSlug !== 'all') {
      query = query.eq('brand', brandSlug);
    }
    const { data, error } = await query;
    if (error) throw new Error(`[brand-client-report] managed_creators read failed: ${error.message}`);
    (data || []).forEach((row: any) => {
      for (const k of ['account_1','account_2','account_3','account_4','account_5','account_6','account_7','account_8','account_9','account_10']) {
        const v = row[k];
        if (typeof v === 'string') {
          const handle = v.replace('@','').trim().toLowerCase();
          if (handle) set.add(handle);
        }
      }
    });
    if (!data || data.length < PAGE) break;
  }
  return set;
}

// Group an aggregated creator map into a top-N leaderboard with pct-of-total
function buildLeaderboard<T extends { gmv: number }>(
  rows: T[],
  totalGmv: number,
  limit: number
): (T & { pctOfTotal: number })[] {
  return rows.slice(0, limit).map(r => ({
    ...r,
    pctOfTotal: totalGmv > 0 ? (r.gmv / totalGmv) * 100 : 0,
  }));
}

// ── Main fetcher ───────────────────────────────────────────────────

export async function getBrandClientReportData(
  brandSlug: string,
  brandName: string,
  period: ReportPeriod | { start: string; end: string } = '7d',
  /**
   * Optional pre-built Supabase client. The brand portal passes the admin
   * client here to bypass RLS — access is already validated at the layout
   * level, and the per-row RLS subqueries cause statement timeouts on the
   * large stats tables.
   */
  clientOverride?: SupabaseClient,
): Promise<BrandClientReportData> {
  const supabase = clientOverride ?? (await createClient());
  const reg = await getBrandRegistry();
  const brandSlugs = getBrandDataSlugs(reg, brandSlug);

  // ── Resolve the time window. A preset ('7d'/'30d') anchors to the oldest of
  // the latest dates across creator/video tables so every section reports on
  // the same window. A custom { start, end } uses the picked dates verbatim —
  // the operator chose them, so we don't anchor.
  let startDate: Date, endDate: Date, periodDays: number;
  if (typeof period === 'object') {
    startDate = new Date(period.start + 'T12:00:00Z');
    endDate = new Date(period.end + 'T12:00:00Z');
    periodDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1);
  } else {
    periodDays = period === '30d' ? 30 : 7;
    const today = await resolveSharedAnchor(supabase, brandSlugs);
    endDate = new Date(today);
    endDate.setDate(today.getDate() - 1);
    startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (periodDays - 1));   // inclusive — N days through endDate
  }

  // Prior window = the same-length window immediately before the selected one
  // (drives the WoW/MoM deltas).
  const priorEnd = new Date(startDate);
  priorEnd.setDate(startDate.getDate() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setDate(priorEnd.getDate() - (periodDays - 1));

  const startStr = formatDate(startDate);
  const endStr = formatDate(endDate);
  const priorStartStr = formatDate(priorStart);
  const priorEndStr = formatDate(priorEnd);

  // ── Filter builders (keep DRY). Source tables are keyed by brand SLUG and
  // hold multiple period_types — scope to daily so we never double-count.
  const dateRange = (s: string, e: string) => {
    const f: { column: string; op: string; value: any }[] = [
      { column: 'report_date', op: 'gte', value: s },
      { column: 'report_date', op: 'lte', value: e },
      { column: 'period_type', op: 'eq', value: 'daily' },
    ];
    if (brandSlugs) f.push({ column: 'brand', op: 'in', value: brandSlugs });
    return f;
  };

  // ── Fire all queries in parallel.
  // creator_performance is creator-level (one row per creator/day). ONE
  // video_performance pull carries the superset of columns for the three
  // video×product-grained sections (top videos by video_id, products by
  // product_name, product↔creator breakdown) — it was three separate paged
  // pulls of the SAME window with different column sets, i.e. 3x the
  // round-trips for identical rows.
  const [
    creatorRowsCur,
    creatorRowsPrior,
    videoProductRows,
    managedHandles,
  ] = await Promise.all([
    paginatedFetch(supabase, 'creator_performance',
      'creator_name, gmv, orders, videos, est_commission, report_date',
      dateRange(startStr, endStr)),
    paginatedFetch(supabase, 'creator_performance',
      'creator_name, gmv, orders, videos',
      dateRange(priorStartStr, priorEndStr)),
    paginatedFetch(supabase, 'video_performance',
      'video_id, video_title, video_link, creator_name, product_name, gmv, orders',
      dateRange(startStr, endStr)),
    getManagedHandleSet(supabase, brandSlug),
  ]);
  // The three legacy row shapes all derive from the single pull.
  const videoRows = videoProductRows;
  const productRows = videoProductRows;

  // ── Aggregate creators (current period)
  const creatorMap = new Map<string, { name: string; gmv: number; orders: number; videos: number; commission: number }>();
  const dayCreatorSet = new Map<string, Set<string>>();   // report_date → handles (for daily creators count)
  let totalCommission = 0;

  for (const row of (creatorRowsCur || []) as any[]) {
    const handle = (row.creator_name || '').toLowerCase().replace('@', '');
    if (!handle) continue;
    if (!creatorMap.has(handle)) {
      creatorMap.set(handle, { name: row.creator_name || handle, gmv: 0, orders: 0, videos: 0, commission: 0 });
    }
    const c = creatorMap.get(handle)!;
    const gmv = parseFloat(row.gmv) || 0;
    const ord = parseInt(row.orders) || 0;
    const vid = parseInt(row.videos) || 0;
    const com = parseFloat(row.est_commission) || 0;
    c.gmv += gmv;
    c.orders += ord;
    c.videos += vid;
    c.commission += com;
    totalCommission += com;

    // For daily aggregation
    const dStr = row.report_date as string;
    if (!dayCreatorSet.has(dStr)) dayCreatorSet.set(dStr, new Set());
    dayCreatorSet.get(dStr)!.add(handle);
  }

  // ── Aggregate creators (prior period — just GMV per handle, for new/returning + WoW)
  const priorCreatorMap = new Map<string, { gmv: number; orders: number; videos: number }>();
  for (const row of (creatorRowsPrior || []) as any[]) {
    const handle = (row.creator_name || '').toLowerCase().replace('@', '');
    if (!handle) continue;
    if (!priorCreatorMap.has(handle)) priorCreatorMap.set(handle, { gmv: 0, orders: 0, videos: 0 });
    const p = priorCreatorMap.get(handle)!;
    p.gmv += parseFloat(row.gmv) || 0;
    p.orders += parseInt(row.orders) || 0;
    p.videos += parseInt(row.videos) || 0;
  }

  // ── Headline totals
  const totalGmv = Array.from(creatorMap.values()).reduce((s, c) => s + c.gmv, 0);
  const totalOrders = Array.from(creatorMap.values()).reduce((s, c) => s + c.orders, 0);
  const totalVideos = Array.from(creatorMap.values()).reduce((s, c) => s + c.videos, 0);
  const activeCreators = creatorMap.size;
  const avgOrderValue = totalOrders > 0 ? totalGmv / totalOrders : 0;
  const avgGmvPerCreator = activeCreators > 0 ? totalGmv / activeCreators : 0;
  // Falls back to estimated 20% if est_commission column was zero/null in the data
  const estCommission = totalCommission > 0 ? totalCommission : totalGmv * 0.20;

  const priorTotalGmv = Array.from(priorCreatorMap.values()).reduce((s, c) => s + c.gmv, 0);
  const priorTotalOrders = Array.from(priorCreatorMap.values()).reduce((s, c) => s + c.orders, 0);
  const priorActiveCreators = priorCreatorMap.size;
  const priorTotalVideos = Array.from(priorCreatorMap.values()).reduce((s, c) => s + c.videos, 0);

  // ── Managed vs Organic split
  let managedGmv = 0, managedOrders = 0, organicGmv = 0, organicOrders = 0;
  const managedSet = new Set<string>();
  const organicSet = new Set<string>();
  for (const [handle, c] of creatorMap) {
    if (managedHandles.has(handle)) {
      managedGmv += c.gmv; managedOrders += c.orders; managedSet.add(handle);
    } else {
      organicGmv += c.gmv; organicOrders += c.orders; organicSet.add(handle);
    }
  }
  const managedPct = totalGmv > 0 ? (managedGmv / totalGmv) * 100 : 0;

  // ── New vs Returning
  let newCount = 0, newGmv = 0, returningCount = 0, returningGmv = 0;
  for (const [handle, c] of creatorMap) {
    if (priorCreatorMap.has(handle)) {
      returningCount += 1; returningGmv += c.gmv;
    } else {
      newCount += 1; newGmv += c.gmv;
    }
  }

  // ── Daily performance (per report_date)
  const dailyMap = new Map<string, { gmv: number; orders: number }>();
  for (const row of (creatorRowsCur || []) as any[]) {
    const dStr = row.report_date as string;
    if (!dailyMap.has(dStr)) dailyMap.set(dStr, { gmv: 0, orders: 0 });
    const d = dailyMap.get(dStr)!;
    d.gmv += parseFloat(row.gmv) || 0;
    d.orders += parseInt(row.orders) || 0;
  }
  const dailyArray = Array.from(dailyMap.entries())
    .map(([dStr, m]) => ({
      date: new Date(dStr + 'T12:00:00Z'),
      weekday: new Date(dStr + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long' }),
      gmv: m.gmv,
      orders: m.orders,
      creators: dayCreatorSet.get(dStr)?.size ?? 0,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const peakGmv = Math.max(0, ...dailyArray.map(d => d.gmv));
  const dailyPerformance = dailyArray.map(d => ({ ...d, isPeak: d.gmv === peakGmv && peakGmv > 0 }));

  // ── Day of week aggregation (Sun=0..Sat=6)
  const dowOrder = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dowMap = new Map<string, number>();
  for (const d of dailyPerformance) {
    const key = dowOrder[d.date.getUTCDay()];
    dowMap.set(key, (dowMap.get(key) || 0) + d.gmv);
  }
  const dowPeak = Math.max(0, ...Array.from(dowMap.values()));
  const dayOfWeek = dowOrder.map(day => ({
    day,
    gmv: dowMap.get(day) || 0,
    isPeak: (dowMap.get(day) || 0) === dowPeak && dowPeak > 0,
  }));

  // ── Top creators leaderboard
  const sortedCreators = Array.from(creatorMap.values()).sort((a, b) => b.gmv - a.gmv);
  const topCreatorsRaw = sortedCreators.slice(0, 10).map(c => ({
    name: c.name, gmv: c.gmv, orders: c.orders, videos: c.videos,
  }));
  const topCreators = buildLeaderboard(topCreatorsRaw, totalGmv, 10);

  // ── Top videos leaderboard (aggregate by video_id)
  const videoMap = new Map<string, { title: string; creator: string; gmv: number; orders: number; videoUrl: string | null }>();
  for (const row of (videoRows || []) as any[]) {
    const id = row.video_id;
    if (!id) continue;
    if (!videoMap.has(id)) {
      videoMap.set(id, {
        title: row.video_title || '(untitled)',
        creator: row.creator_name || '',
        gmv: 0,
        orders: 0,
        videoUrl: row.video_link || null,
      });
    }
    const v = videoMap.get(id)!;
    v.gmv += parseFloat(row.gmv) || 0;
    v.orders += parseInt(row.orders) || 0;
  }
  const topVideos = Array.from(videoMap.values()).sort((a, b) => b.gmv - a.gmv).slice(0, 10);

  // ── Top products
  const productMap = new Map<string, { gmv: number; orders: number }>();
  for (const row of (productRows || []) as any[]) {
    const name = row.product_name || 'Unknown Product';
    if (!productMap.has(name)) productMap.set(name, { gmv: 0, orders: 0 });
    const p = productMap.get(name)!;
    p.gmv += parseFloat(row.gmv) || 0;
    p.orders += parseInt(row.orders) || 0;
  }
  const sortedProducts = Array.from(productMap.entries())
    .map(([name, p]) => ({ name, gmv: p.gmv, orders: p.orders }))
    .sort((a, b) => b.gmv - a.gmv);
  const topProducts = buildLeaderboard(sortedProducts.slice(0, 10), totalGmv, 10);

  // ── Product → Creator breakdown (top 5 products, top 3 creators each)
  const productCreatorMap = new Map<string, Map<string, number>>();
  for (const row of (videoProductRows || []) as any[]) {
    const pname = row.product_name || 'Unknown Product';
    const handle = (row.creator_name || '').replace('@', '');
    if (!handle) continue;
    if (!productCreatorMap.has(pname)) productCreatorMap.set(pname, new Map());
    const m = productCreatorMap.get(pname)!;
    m.set(handle, (m.get(handle) || 0) + (parseFloat(row.gmv) || 0));
  }
  const productCreatorBreakdown = sortedProducts.slice(0, 5).map(p => ({
    productName: p.name,
    productGmv: p.gmv,
    productOrders: p.orders,
    pctOfTotal: totalGmv > 0 ? (p.gmv / totalGmv) * 100 : 0,
    topCreators: Array.from(productCreatorMap.get(p.name)?.entries() ?? [])
      .map(([name, gmv]) => ({ name, gmv }))
      .sort((a, b) => b.gmv - a.gmv)
      .slice(0, 3),
  }));

  // ── Highlight cards
  const topCreator = topCreatorsRaw[0]
    ? { name: topCreatorsRaw[0].name, gmv: topCreatorsRaw[0].gmv, orders: topCreatorsRaw[0].orders, videos: topCreatorsRaw[0].videos }
    : null;
  const topVideo = topVideos[0]
    ? { title: topVideos[0].title, creator: topVideos[0].creator, gmv: topVideos[0].gmv, orders: topVideos[0].orders, videoUrl: topVideos[0].videoUrl }
    : null;
  const peakDay = dailyPerformance.find(d => d.isPeak);
  const bestDay = peakDay
    ? { date: peakDay.date, weekday: peakDay.weekday, gmv: peakDay.gmv, orders: peakDay.orders, creators: peakDay.creators }
    : null;

  // ── Creators Corner (managed) contribution detail
  // Prior-period managed totals (for the contribution trend).
  let ccPriorGmv = 0, ccPriorOrders = 0;
  const ccPriorCreators = new Set<string>();
  for (const [handle, p] of priorCreatorMap) {
    if (managedHandles.has(handle)) {
      ccPriorGmv += p.gmv; ccPriorOrders += p.orders; ccPriorCreators.add(handle);
    }
  }
  // Current managed creators (videos, commission, leaderboard).
  let ccVideos = 0, ccCommission = 0;
  const ccCreatorRows: { name: string; gmv: number; orders: number; videos: number }[] = [];
  for (const [handle, c] of creatorMap) {
    if (!managedHandles.has(handle)) continue;
    ccVideos += c.videos;
    ccCommission += c.commission;
    ccCreatorRows.push({ name: c.name, gmv: c.gmv, orders: c.orders, videos: c.videos });
  }
  ccCreatorRows.sort((a, b) => b.gmv - a.gmv);
  const ccTopCreators = ccCreatorRows.slice(0, 5).map(c => ({
    ...c,
    pctOfManaged: managedGmv > 0 ? (c.gmv / managedGmv) * 100 : 0,
  }));
  // Top videos from managed creators only.
  const ccVideoMap = new Map<string, { title: string; creator: string; gmv: number; orders: number; videoUrl: string | null }>();
  for (const row of (videoRows || []) as any[]) {
    const h = (row.creator_name || '').toLowerCase().replace('@', '');
    if (!h || !managedHandles.has(h)) continue;
    const id = row.video_id;
    if (!id) continue;
    if (!ccVideoMap.has(id)) {
      ccVideoMap.set(id, {
        title: row.video_title || '(untitled)',
        creator: row.creator_name || '',
        gmv: 0, orders: 0,
        videoUrl: row.video_link || null,
      });
    }
    const v = ccVideoMap.get(id)!;
    v.gmv += parseFloat(row.gmv) || 0;
    v.orders += parseInt(row.orders) || 0;
  }
  const ccTopVideos = Array.from(ccVideoMap.values()).sort((a, b) => b.gmv - a.gmv).slice(0, 5);
  // Roster activation.
  let ccNewlyActivated = 0;
  for (const h of managedSet) { if (!priorCreatorMap.has(h)) ccNewlyActivated += 1; }
  // Efficiency vs organic.
  const ccManagedAov = managedOrders > 0 ? managedGmv / managedOrders : 0;
  const ccOrganicAov = organicOrders > 0 ? organicGmv / organicOrders : 0;
  const ccManagedPerCreator = managedSet.size > 0 ? managedGmv / managedSet.size : 0;
  const ccOrganicPerCreator = organicSet.size > 0 ? organicGmv / organicSet.size : 0;

  const creatorsCorner = {
    gmv: managedGmv,
    orders: managedOrders,
    creatorCount: managedSet.size,
    videos: ccVideos,
    commission: ccCommission > 0 ? ccCommission : managedGmv * 0.20,
    pctOfStoreGmv: managedPct,
    priorGmv: ccPriorGmv,
    priorOrders: ccPriorOrders,
    priorCreatorCount: ccPriorCreators.size,
    gmvChangePct: pctChange(managedGmv, ccPriorGmv),
    orderChangePct: pctChange(managedOrders, ccPriorOrders),
    managedAov: ccManagedAov,
    organicAov: ccOrganicAov,
    managedGmvPerCreator: ccManagedPerCreator,
    organicGmvPerCreator: ccOrganicPerCreator,
    signedCreatorCount: managedHandles.size,
    activeCreatorCount: managedSet.size,
    newlyActivatedCount: ccNewlyActivated,
    topCreators: ccTopCreators,
    topVideos: ccTopVideos,
  };

  // ── Period label
  const periodLabel = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${endDate.getFullYear()}`;

  return {
    brandName,
    brandSlug,
    startDate,
    endDate,
    periodLabel,
    periodLengthDays: periodDays,

    totalGmv,
    totalOrders,
    totalVideos,
    activeCreators,
    avgOrderValue,
    avgGmvPerCreator,
    estCommission,

    priorTotalGmv,
    priorTotalOrders,
    priorActiveCreators,
    priorTotalVideos,
    gmvChangePct: pctChange(totalGmv, priorTotalGmv),
    orderChangePct: pctChange(totalOrders, priorTotalOrders),
    creatorChangePct: pctChange(activeCreators, priorActiveCreators),
    videoChangePct: pctChange(totalVideos, priorTotalVideos),

    topCreator,
    topVideo,
    bestDay,

    managed: { gmv: managedGmv, creatorCount: managedSet.size, orders: managedOrders },
    organic: { gmv: organicGmv, creatorCount: organicSet.size, orders: organicOrders },
    managedPct,
    creatorsCorner,

    newCreators: { count: newCount, gmv: newGmv },
    returningCreators: { count: returningCount, gmv: returningGmv },

    dayOfWeek,
    dailyPerformance,

    topCreators,
    topVideos,
    topProducts,
    productCreatorBreakdown,
  };
}

// ── Slack message builder ──────────────────────────────────────────
// A concise, copy-paste Slack message the operator sends to the brand contact
// alongside the PDF. Slack markdown: *bold*, _italic_, bullets via "•".

function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function deltaTag(pct: number | null, days: number): string {
  if (pct === null) return ' _(new)_';
  const arrow = pct >= 0 ? '▲' : '▼';
  return ` (${arrow} ${Math.abs(pct).toFixed(0)}% vs prior ${days}d)`;
}

export function buildBrandClientSlackMessage(data: BrandClientReportData): string {
  const cc = data.creatorsCorner;
  const lines: string[] = [];

  lines.push(`*${data.brandName} - creator performance*`);
  lines.push(data.periodLabel);
  lines.push('');
  lines.push(`*${money(data.totalGmv)} GMV*${deltaTag(data.gmvChangePct, data.periodLengthDays)}`);
  lines.push(
    `• ${data.totalVideos} posts · ${data.activeCreators} creators · ` +
    `${data.totalOrders.toLocaleString('en-US')} orders · ${money(data.avgOrderValue)} AOV`,
  );
  lines.push('');
  lines.push(
    `*Creators Corner delivered ${money(cc.gmv)}* - ${cc.pctOfStoreGmv.toFixed(0)}% of store GMV ` +
    `from ${cc.activeCreatorCount} signed creator${cc.activeCreatorCount === 1 ? '' : 's'}` +
    `${cc.newlyActivatedCount > 0 ? `, ${cc.newlyActivatedCount} newly activated` : ''}.`,
  );

  if (data.topCreator) {
    lines.push(
      `Top creator: *${data.topCreator.name}* - ${money(data.topCreator.gmv)} ` +
      `(${data.topCreator.videos} post${data.topCreator.videos === 1 ? '' : 's'})`,
    );
  }
  if (data.topVideo) {
    lines.push(`Top video: ${data.topVideo.title} - ${money(data.topVideo.gmv)} (${data.topVideo.creator})`);
  }
  if (data.bestDay) {
    lines.push(`Best day: ${data.bestDay.weekday} - ${money(data.bestDay.gmv)}`);
  }

  lines.push('');
  lines.push('Full breakdown in the attached report.');

  return lines.join('\n');
}
