/**
 * Reports library — generates the 3 long-form text reports surfaced on the Reporting page.
 *
 * Reports are markdown-flavored plain text designed to be:
 *  - Read in the in-app preview
 *  - Copy-pasted into email or docs
 *  - Forwarded to clients (brand-report)
 *
 * Sources data via the existing get_brand_summary / get_creator_rankings /
 * get_video_summary / get_daily_trend RPCs (all SECURITY DEFINER), which means
 * we can fan out across brands in parallel without RLS gotchas.
 */

import {
  getBrandSummary,
  getCreatorRankings,
  getVideoSummary,
  getDailyTrend,
  getAnalyticsBrandTotals,
  getAnalyticsCreatorRankings,
  getAnalyticsVideos,
} from './rpc';
import { createClient } from '@/lib/supabase/server';
import { getBrandRegistry, brandLabel, activeBrandSlugs, resolveUuids, type BrandRegistry } from '@/lib/data/brand-registry';
import { format } from 'date-fns';

export type ReportType = 'performance-summary' | 'creator-activity' | 'brand-report';
export type ReportPeriod = '7d' | '30d';

/** Rankings fetch cap. High enough that the Behind/Ghost tail is included for
 *  every real roster; if a window ever exceeds it we say so in the report. */
const RANKINGS_LIMIT = 5000;

function fmtDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/**
 * Latest report_date in daily_creator_stats for the given brands (the table the
 * report RPCs aggregate). The UI's freshness banner promises reports anchor to
 * the latest upload — anchoring to real "today" instead produced $0 reports
 * whenever uploads ran a few days behind. Same anchoring idea as
 * resolveAnchorToday in discord-posts.ts. Null when the table has no data.
 */
async function resolveLatestDataDate(brandIds: string[]): Promise<Date | null> {
  const supabase = await createClient();
  let query = supabase
    .from('daily_creator_stats')
    .select('report_date')
    .order('report_date', { ascending: false })
    .limit(1);
  if (brandIds.length > 0) query = query.in('brand_id', brandIds);
  const { data, error } = await query;
  if (error) {
    console.error('[reports] latest data date read failed - falling back to real today:', error.message);
    return null;
  }
  if (!data || data.length === 0) return null;
  return new Date(data[0].report_date + 'T12:00:00Z');
}

/** Resolve current and prior date ranges for the requested period, anchored to
 *  the latest data date (end = latest report_date with data). */
function resolveRanges(period: ReportPeriod, anchor: Date | null) {
  // Fallback when the tables are empty: yesterday relative to real now.
  const end = anchor ?? addDays(new Date(), -1);
  const days = period === '30d' ? 30 : 7;
  const start = addDays(end, -(days - 1));
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(days - 1));
  return {
    start: fmtDay(start),
    end: fmtDay(end),
    prevStart: fmtDay(prevStart),
    prevEnd: fmtDay(prevEnd),
    days,
  };
}

/** Data-table brand uuids for a set of umbrella-grain brand slugs. Umbrellas
 *  expand to their store uuids (resolveUuids) — the daily_* fact tables are
 *  keyed at store grain, and an umbrella row's own uuid holds no data. */
function brandIdsForSlugs(reg: BrandRegistry, slugs: string[]): string[] {
  const out = new Set<string>();
  for (const s of slugs) {
    for (const id of resolveUuids(reg, s) ?? []) out.add(id);
  }
  return [...out];
}

/** Collapse a data-table brand slug (store grain) back to the umbrella-grain
 *  slug the report displays, so an umbrella's stores roll up under one name. */
function toReportSlug(reg: BrandRegistry, dataSlug: string): string {
  const row = reg.bySlug.get(dataSlug);
  if (row?.parent_brand_id) {
    return reg.byId.get(row.parent_brand_id)?.slug ?? dataSlug;
  }
  return dataSlug;
}

/** Brands to query based on the user's brand filter. */
function brandsToQuery(reg: BrandRegistry, brand: string): string[] {
  const active = activeBrandSlugs(reg);
  if (!brand || brand === 'all') return active;
  if (active.includes(brand)) return [brand];
  return [];
}

// Whole-dollar money — report copy never shows cents.
const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
const fmtNumber = (n: number) =>
  new Intl.NumberFormat('en-US').format(Math.round(n));

function pctDelta(cur: number, prev: number): string {
  if (prev === 0) return cur > 0 ? 'new' : 'n/a';
  const pct = ((cur - prev) / prev) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function periodLabel(period: ReportPeriod): string {
  return period === '30d' ? 'Last 30 Days' : 'Last 7 Days';
}

function brandHeading(reg: BrandRegistry, brand: string): string {
  if (!brand || brand === 'all') return 'All Brands';
  return brandLabel(reg, brand);
}

// ────────────────────────────────────────────────────────────────────────────
// 1. PERFORMANCE SUMMARY — internal "how are we doing" report
// ────────────────────────────────────────────────────────────────────────────

export async function generatePerformanceSummary(brand: string, period: ReportPeriod): Promise<string> {
  const reg = await getBrandRegistry();
  const brands = brandsToQuery(reg, brand);
  if (brands.length === 0) return 'No brands available for this user.';
  const brandIds = brandIdsForSlugs(reg, brands);

  // Anchor to the latest upload (what the freshness banner promises) so a stale
  // week never produces a $0 report.
  const anchor = await resolveLatestDataDate(brandIds);
  const { start, end, prevStart, prevEnd } = resolveRanges(period, anchor);

  // 5 multi-brand RPC round-trips total, replacing the old per-brand fan-out
  // (4 single-brand RPCs x N brands, ~52 round-trips on All Brands).
  const [totalsCur, totalsPrev, rankingsCur, rankingsPrev, videosAll] = await Promise.all([
    getAnalyticsBrandTotals(brandIds, start, end),
    getAnalyticsBrandTotals(brandIds, prevStart, prevEnd),
    getAnalyticsCreatorRankings(brandIds, start, end, RANKINGS_LIMIT),
    getAnalyticsCreatorRankings(brandIds, prevStart, prevEnd, RANKINGS_LIMIT),
    getAnalyticsVideos(brandIds, start, end, 100),
  ]);

  // Aggregate totals. Active-creator counts come from the rankings row counts
  // (analytics_brand_totals deliberately dropped unique_creators for perf);
  // same per-brand-distinct semantics the old get_brand_summary sum had.
  const sumTotals = (rows: typeof totalsCur) => rows.reduce((a, r) => ({
    gmv: a.gmv + r.total_gmv,
    orders: a.orders + r.total_orders,
    items: a.items + r.total_items_sold,
    videos: a.videos + r.total_videos,
  }), { gmv: 0, orders: 0, items: 0, videos: 0 });
  const totals = sumTotals(totalsCur);
  const prev = sumTotals(totalsPrev);
  const curCreators = rankingsCur.length;
  const prevCreators = rankingsPrev.length;
  const creatorsCapped = curCreators >= RANKINGS_LIMIT || prevCreators >= RANKINGS_LIMIT;

  // Sort top creators / videos (tag with umbrella-grain display slug)
  const topCreators = [...rankingsCur]
    .sort((a, b) => b.total_gmv - a.total_gmv)
    .slice(0, 10)
    .map((c) => ({ ...c, brand: toReportSlug(reg, c.brand_slug) }));
  const topVideos = [...videosAll]
    .sort((a, b) => b.total_gmv - a.total_gmv)
    .slice(0, 10)
    .map((v) => ({ ...v, brand: toReportSlug(reg, v.brand_slug) }));

  const lines: string[] = [];
  lines.push(`# Performance Summary - ${brandHeading(reg, brand)}`);
  lines.push(`${periodLabel(period)} · ${start} → ${end}`);
  lines.push('');
  lines.push('## Headline Numbers');
  lines.push(`- Total GMV: **${fmtCurrency(totals.gmv)}** (${pctDelta(totals.gmv, prev.gmv)} vs prior)`);
  lines.push(`- Orders: **${fmtNumber(totals.orders)}** (${pctDelta(totals.orders, prev.orders)})`);
  lines.push(`- Items Sold: **${fmtNumber(totals.items)}** (${pctDelta(totals.items, prev.items)})`);
  lines.push(`- Videos Posted: **${fmtNumber(totals.videos)}** (${pctDelta(totals.videos, prev.videos)})`);
  if (creatorsCapped) {
    // Never present a capped count as an exact figure or delta.
    lines.push(`- Active Creators: **${fmtNumber(curCreators)}+**`);
  } else {
    lines.push(`- Active Creators: **${fmtNumber(curCreators)}** (${pctDelta(curCreators, prevCreators)})`);
  }
  lines.push('');

  // Brand breakdown — only when on All Brands. Store-grain rows roll up to
  // their umbrella brand.
  if (brands.length > 1) {
    const byBrand = new Map<string, number>();
    for (const r of totalsCur) {
      const slug = toReportSlug(reg, r.brand_slug);
      byBrand.set(slug, (byBrand.get(slug) ?? 0) + r.total_gmv);
    }
    const breakdown = [...byBrand.entries()]
      .map(([b, gmv]) => ({ brand: b, gmv }))
      .filter((b) => b.gmv > 0)
      .sort((a, b) => b.gmv - a.gmv);
    if (breakdown.length > 0) {
      lines.push('## Brand Breakdown');
      const totalBrand = breakdown.reduce((s, b) => s + b.gmv, 0);
      for (const b of breakdown) {
        const share = totalBrand > 0 ? (b.gmv / totalBrand) * 100 : 0;
        lines.push(`- **${brandLabel(reg, b.brand)}**: ${fmtCurrency(b.gmv)} (${share.toFixed(1)}%)`);
      }
      lines.push('');
    }
  }

  // Top 10 creators
  lines.push('## Top 10 Creators');
  if (topCreators.length === 0) {
    lines.push('_No creator data in this period._');
  } else {
    topCreators.forEach((c, i) => {
      const brandTag = brands.length > 1 ? ` · ${brandLabel(reg, c.brand)}` : '';
      lines.push(`${i + 1}. **@${c.creator_name}**${brandTag} - ${fmtCurrency(c.total_gmv)} · ${fmtNumber(c.total_videos)} posts`);
    });
  }
  lines.push('');

  // Top 10 videos
  lines.push('## Top 10 Videos');
  if (topVideos.length === 0) {
    lines.push('_No video data in this period._');
  } else {
    topVideos.forEach((v, i) => {
      const brandTag = brands.length > 1 ? ` · ${brandLabel(reg, v.brand)}` : '';
      const titleTrim = (v.video_title || 'Untitled').length > 80
        ? (v.video_title || 'Untitled').slice(0, 77) + '…'
        : (v.video_title || 'Untitled');
      lines.push(`${i + 1}. ${titleTrim}`);
      lines.push(`   @${v.creator_name}${brandTag} - ${fmtCurrency(v.total_gmv)} · ${fmtNumber(v.total_orders)} orders`);
    });
  }

  return lines.join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// 2. CREATOR ACTIVITY — roster health check
// ────────────────────────────────────────────────────────────────────────────

/**
 * Posting thresholds, scaled to the period length. The 7-day bars match
 * classifyCreator() in lib/data/creator-status.ts; a 30-day report scales them
 * by 30/7 (~4.3x) instead of judging a month of work against one week's bar.
 */
function bucketThresholds(days: number): { star: number; onTrack: number; atRisk: number } {
  const scale = days / 7;
  return {
    star: Math.round(8 * scale),      // 7d: 8,  30d: 34
    onTrack: Math.round(6 * scale),   // 7d: 6,  30d: 26
    atRisk: Math.round(4 * scale),    // 7d: 4,  30d: 17
  };
}

function bucketByVideos(
  videos: number,
  t: { star: number; onTrack: number; atRisk: number },
): 'star' | 'on_track' | 'at_risk' | 'behind' | 'ghost' {
  if (videos >= t.star)    return 'star';
  if (videos >= t.onTrack) return 'on_track';
  if (videos >= t.atRisk)  return 'at_risk';
  if (videos >= 1)         return 'behind';
  return 'ghost';
}

function normalizeHandle(h: string | null | undefined): string {
  return (h ?? '').replace(/^@/, '').trim().toLowerCase();
}

/**
 * Roster commitment lookup: which handles are CONTRACTED (retainer > 0) and
 * which are merely managed (affiliate, $0 retainer, no post commitment).
 * Paged past the 1000-row PostgREST cap — managed_creators is over it, and a
 * truncated read would mislabel real contracted creators as organic.
 */
async function getRosterCommitment(brands: string[]): Promise<{ contracted: Set<string>; managed: Set<string> }> {
  const supabase = await createClient();
  const contracted = new Set<string>();
  const managed = new Set<string>();
  const cols = ['account_1','account_2','account_3','account_4','account_5','account_6','account_7','account_8','account_9','account_10'] as const;
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from('managed_creators')
      .select('brand, retainer, account_1, account_2, account_3, account_4, account_5, account_6, account_7, account_8, account_9, account_10')
      .is('archived_at', null)
      .order('id')
      .range(from, from + PAGE - 1);
    if (brands.length > 0) query = query.in('brand', brands);
    const { data, error } = await query;
    if (error) throw new Error(`[reports] managed_creators read failed: ${error.message}`);
    for (const row of (data ?? []) as any[]) {
      const hasRetainer = (Number(row.retainer) || 0) > 0;
      for (const k of cols) {
        const handle = normalizeHandle(row[k]);
        if (!handle) continue;
        managed.add(handle);
        if (hasRetainer) contracted.add(handle);
      }
    }
    if (!data || data.length < PAGE) break;
  }
  return { contracted, managed };
}

export async function generateCreatorActivity(brand: string, period: ReportPeriod): Promise<string> {
  const reg = await getBrandRegistry();
  const brands = brandsToQuery(reg, brand);
  if (brands.length === 0) return 'No brands available for this user.';
  const brandIds = brandIdsForSlugs(reg, brands);

  // Anchor to the latest upload so a stale week never produces a $0 report.
  const anchor = await resolveLatestDataDate(brandIds);
  const { start, end, days } = resolveRanges(period, anchor);

  // ONE multi-brand rankings call (was a per-brand N+1), with a limit high
  // enough that the low-GMV tail — which IS the Behind/Ghost population — is
  // actually included. The old limit-500-by-GMV-desc fetch truncated exactly
  // the creators this report exists to surface.
  const [rankings, commitment] = await Promise.all([
    getAnalyticsCreatorRankings(brandIds, start, end, RANKINGS_LIMIT),
    getRosterCommitment(brands),
  ]);
  const creatorsByBrand = rankings.map((c) => ({ ...c, brand: toReportSlug(reg, c.brand_slug) }));

  const t = bucketThresholds(days);

  // Behind/Ghost are CONTRACT states — only creators with a retainer carry a
  // post commitment. ~63% of the roster are $0-retainer affiliates; labeling
  // them "Behind" or "Ghost" is false. Affiliates and organic (unmanaged)
  // creators get neutral summary lines instead.
  const buckets: Record<string, typeof creatorsByBrand> = {
    star: [], on_track: [], at_risk: [], behind: [], ghost: [],
  };
  const affiliates: typeof creatorsByBrand = [];
  const organic: typeof creatorsByBrand = [];
  for (const c of creatorsByBrand) {
    const handle = normalizeHandle(c.creator_name);
    if (commitment.contracted.has(handle)) {
      buckets[bucketByVideos(c.total_videos, t)].push(c);
    } else if (commitment.managed.has(handle)) {
      affiliates.push(c);
    } else {
      organic.push(c);
    }
  }
  for (const k of Object.keys(buckets)) {
    buckets[k].sort((a, b) => b.total_gmv - a.total_gmv);
  }

  const totalGmv = creatorsByBrand.reduce((s, c) => s + c.total_gmv, 0);
  const totalCreators = creatorsByBrand.length;
  const contractedActive = Object.values(buckets).reduce((s, l) => s + l.length, 0);
  const affiliateGmv = affiliates.reduce((s, c) => s + c.total_gmv, 0);
  const organicGmv = organic.reduce((s, c) => s + c.total_gmv, 0);

  const lines: string[] = [];
  lines.push(`# Creator Activity - ${brandHeading(reg, brand)}`);
  lines.push(`${periodLabel(period)} · ${start} → ${end}`);
  lines.push('');
  lines.push('## Roster Health');
  lines.push(`- Active creators in period: **${fmtNumber(totalCreators)}**${totalCreators >= RANKINGS_LIMIT ? ` (capped at ${fmtNumber(RANKINGS_LIMIT)})` : ''}`);
  lines.push(`- Total GMV from active creators: **${fmtCurrency(totalGmv)}**`);
  lines.push(`- Contracted creators active (retainer, post commitment): **${fmtNumber(contractedActive)}**`);
  lines.push(`- Star (${t.star}+ posts): **${buckets.star.length}**`);
  lines.push(`- On Track (${t.onTrack}-${t.star - 1}): **${buckets.on_track.length}**`);
  lines.push(`- At Risk (${t.atRisk}-${t.onTrack - 1}): **${buckets.at_risk.length}**`);
  lines.push(`- Behind (1-${t.atRisk - 1}): **${buckets.behind.length}**`);
  lines.push(`- Ghost (0): **${buckets.ghost.length}**`);
  lines.push(`- Affiliates active (no retainer, no post commitment): **${fmtNumber(affiliates.length)}** · ${fmtCurrency(affiliateGmv)} GMV`);
  lines.push(`- Organic creators active (not on the roster): **${fmtNumber(organic.length)}** · ${fmtCurrency(organicGmv)} GMV`);
  lines.push('');
  lines.push('_Posting buckets apply to contracted creators only. Affiliates and organic creators carry no post commitment and are never marked Behind or Ghost._');
  lines.push('');

  const renderBucket = (key: keyof typeof buckets, label: string, max = 25) => {
    const list = buckets[key];
    if (list.length === 0) return;
    lines.push(`## ${label} - ${list.length} creator${list.length === 1 ? '' : 's'}`);
    list.slice(0, max).forEach((c, i) => {
      const brandTag = brands.length > 1 ? ` · ${brandLabel(reg, c.brand)}` : '';
      lines.push(`${i + 1}. **@${c.creator_name}**${brandTag} - ${fmtCurrency(c.total_gmv)} · ${c.total_videos} posts`);
    });
    if (list.length > max) {
      lines.push(`_…and ${list.length - max} more._`);
    }
    lines.push('');
  };

  renderBucket('star',     'Star Performers');
  renderBucket('on_track', 'On Track');
  renderBucket('at_risk',  'At Risk');
  renderBucket('behind',   'Behind');
  renderBucket('ghost',    'Ghosts (no posts in period)', 50);

  return lines.join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// 3. BRAND REPORT — client-facing professional summary
// ────────────────────────────────────────────────────────────────────────────

export async function generateBrandReport(brand: string, period: ReportPeriod): Promise<string> {
  if (!brand || brand === 'all') {
    // Brand reports are always brand-scoped — pick first active brand if user picked "all"
    return 'Please select a specific brand for a brand report.';
  }
  const reg = await getBrandRegistry();
  const brands = brandsToQuery(reg, brand);
  if (brands.length === 0) return 'Brand not available.';
  const b = brands[0];

  // Anchor to the brand's latest upload so a stale week never produces a $0
  // client-facing report.
  const anchor = await resolveLatestDataDate(brandIdsForSlugs(reg, [b]));
  const { start, end, prevStart, prevEnd } = resolveRanges(period, anchor);

  const [summary, prevSummary, topCreators, topVideos, dailyTrend] = await Promise.all([
    getBrandSummary(b, start, end).then((r) => r[0]),
    getBrandSummary(b, prevStart, prevEnd).then((r) => r[0]),
    getCreatorRankings(b, start, end, 5),
    getVideoSummary(b, start, end, 5),
    getDailyTrend(b, start, end),
  ]);

  const totalGmv      = summary?.total_gmv ?? 0;
  const totalOrders   = summary?.total_orders ?? 0;
  const totalVideos   = summary?.total_videos ?? 0;
  const uniqueCreators = summary?.unique_creators ?? 0;
  const avgAov        = summary?.avg_aov ?? 0;
  const prevTotalGmv  = prevSummary?.total_gmv ?? 0;

  const peakDay = dailyTrend.length > 0
    ? dailyTrend.reduce((max, d) => d.daily_gmv > max.daily_gmv ? d : max, dailyTrend[0])
    : null;

  const lines: string[] = [];
  lines.push(`# ${brandLabel(reg, b)} - Performance Report`);
  lines.push(`Reporting Period: ${start} → ${end} (${periodLabel(period)})`);
  lines.push(`Generated: ${format(new Date(), 'MMMM d, yyyy')}`);
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`Over the past ${period === '30d' ? '30 days' : 'week'}, ${brandLabel(reg, b)} generated **${fmtCurrency(totalGmv)}** in GMV across **${fmtNumber(totalVideos)}** videos from **${fmtNumber(uniqueCreators)}** active creators. This represents a **${pctDelta(totalGmv, prevTotalGmv)}** change versus the previous period.`);
  lines.push('');

  lines.push('## Key Metrics');
  lines.push(`- **Total GMV**: ${fmtCurrency(totalGmv)}`);
  lines.push(`- **Total Orders**: ${fmtNumber(totalOrders)}`);
  lines.push(`- **Average Order Value**: ${fmtCurrency(avgAov)}`);
  lines.push(`- **Videos Published**: ${fmtNumber(totalVideos)}`);
  lines.push(`- **Active Creators**: ${fmtNumber(uniqueCreators)}`);
  if (totalVideos > 0) {
    lines.push(`- **Avg GMV / Video**: ${fmtCurrency(totalGmv / totalVideos)}`);
  }
  if (peakDay) {
    lines.push(`- **Peak Day**: ${peakDay.report_date} (${fmtCurrency(peakDay.daily_gmv)})`);
  }
  lines.push('');

  lines.push('## Top Creators');
  if (topCreators.length === 0) {
    lines.push('_No creator activity in this period._');
  } else {
    topCreators.forEach((c, i) => {
      const aov = c.total_orders > 0 ? c.total_gmv / c.total_orders : 0;
      lines.push(`${i + 1}. **@${c.creator_name}** - ${fmtCurrency(c.total_gmv)} GMV across ${c.total_videos} videos (AOV ${fmtCurrency(aov)})`);
    });
  }
  lines.push('');

  lines.push('## Top Videos');
  if (topVideos.length === 0) {
    lines.push('_No video data in this period._');
  } else {
    topVideos.forEach((v, i) => {
      const titleTrim = (v.video_title || 'Untitled').length > 100
        ? (v.video_title || 'Untitled').slice(0, 97) + '…'
        : (v.video_title || 'Untitled');
      lines.push(`${i + 1}. ${titleTrim}`);
      lines.push(`   @${v.creator_name} - ${fmtCurrency(v.total_gmv)} · ${fmtNumber(v.total_orders)} orders · ${v.days_active} days active`);
    });
  }
  lines.push('');

  lines.push('---');
  lines.push('_Report generated by Tempo. Questions? Reach out to your account manager._');

  return lines.join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// Dispatch
// ────────────────────────────────────────────────────────────────────────────

export async function generateReport(type: ReportType, brand: string, period: ReportPeriod): Promise<string> {
  switch (type) {
    case 'performance-summary': return generatePerformanceSummary(brand, period);
    case 'creator-activity':    return generateCreatorActivity(brand, period);
    case 'brand-report':        return generateBrandReport(brand, period);
  }
}
