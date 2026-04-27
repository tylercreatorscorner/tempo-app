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
} from './rpc';
import { ACTIVE_BRANDS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import { format, subDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const APP_TIMEZONE = 'America/Chicago';

export type ReportType = 'performance-summary' | 'creator-activity' | 'brand-report';
export type ReportPeriod = '7d' | '30d';

/** Resolve current and prior date ranges for the requested period. */
function resolveRanges(period: ReportPeriod) {
  const now = toZonedTime(new Date(), APP_TIMEZONE);
  const yesterday = subDays(now, 1);
  const days = period === '30d' ? 30 : 7;
  const start = subDays(yesterday, days - 1);
  const prevEnd = subDays(start, 1);
  const prevStart = subDays(prevEnd, days - 1);
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');
  return {
    start: fmt(start),
    end: fmt(yesterday),
    prevStart: fmt(prevStart),
    prevEnd: fmt(prevEnd),
    days,
  };
}

/** Brands to query based on the user's brand filter. */
function brandsToQuery(brand: string): string[] {
  if (!brand || brand === 'all') return [...ACTIVE_BRANDS];
  if ((ACTIVE_BRANDS as readonly string[]).includes(brand)) return [brand];
  return [];
}

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
const fmtNumber = (n: number) =>
  new Intl.NumberFormat('en-US').format(Math.round(n));

function pctDelta(cur: number, prev: number): string {
  if (prev === 0) return cur > 0 ? '+∞' : '—';
  const pct = ((cur - prev) / prev) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function periodLabel(period: ReportPeriod): string {
  return period === '30d' ? 'Last 30 Days' : 'Last 7 Days';
}

function brandHeading(brand: string): string {
  if (!brand || brand === 'all') return 'All Brands';
  return BRAND_DISPLAY_NAMES[brand] ?? brand;
}

// ────────────────────────────────────────────────────────────────────────────
// 1. PERFORMANCE SUMMARY — internal "how are we doing" report
// ────────────────────────────────────────────────────────────────────────────

export async function generatePerformanceSummary(brand: string, period: ReportPeriod): Promise<string> {
  const { start, end, prevStart, prevEnd } = resolveRanges(period);
  const brands = brandsToQuery(brand);
  if (brands.length === 0) return 'No brands available for this user.';

  // Fan out: per-brand summaries (current + prior), top creators, top videos, daily trend
  const [
    summaries,
    prevSummaries,
    creatorsByBrand,
    videosByBrand,
  ] = await Promise.all([
    Promise.all(brands.map(async (b) => ({ brand: b, s: (await getBrandSummary(b, start, end))[0] }))),
    Promise.all(brands.map(async (b) => ({ brand: b, s: (await getBrandSummary(b, prevStart, prevEnd))[0] }))),
    Promise.all(brands.map(async (b) => {
      const data = await getCreatorRankings(b, start, end, 100);
      return data.map((c) => ({ ...c, brand: b }));
    })).then((rs) => rs.flat()),
    Promise.all(brands.map(async (b) => {
      const data = await getVideoSummary(b, start, end, 50);
      return data.map((v) => ({ ...v, brand: b }));
    })).then((rs) => rs.flat()),
  ]);

  // Aggregate totals
  const totals = summaries.reduce((a, { s }) => ({
    gmv: a.gmv + (s?.total_gmv ?? 0),
    orders: a.orders + (s?.total_orders ?? 0),
    items: a.items + (s?.total_items_sold ?? 0),
    videos: a.videos + (s?.total_videos ?? 0),
    creators: a.creators + (s?.unique_creators ?? 0),
  }), { gmv: 0, orders: 0, items: 0, videos: 0, creators: 0 });
  const prev = prevSummaries.reduce((a, { s }) => ({
    gmv: a.gmv + (s?.total_gmv ?? 0),
    orders: a.orders + (s?.total_orders ?? 0),
    items: a.items + (s?.total_items_sold ?? 0),
    videos: a.videos + (s?.total_videos ?? 0),
    creators: a.creators + (s?.unique_creators ?? 0),
  }), { gmv: 0, orders: 0, items: 0, videos: 0, creators: 0 });

  // Sort top creators / videos
  const topCreators = [...creatorsByBrand].sort((a, b) => b.total_gmv - a.total_gmv).slice(0, 10);
  const topVideos   = [...videosByBrand].sort((a, b) => b.total_gmv - a.total_gmv).slice(0, 10);

  const lines: string[] = [];
  lines.push(`# Performance Summary — ${brandHeading(brand)}`);
  lines.push(`${periodLabel(period)} · ${start} → ${end}`);
  lines.push('');
  lines.push('## Headline Numbers');
  lines.push(`- Total GMV: **${fmtCurrency(totals.gmv)}** (${pctDelta(totals.gmv, prev.gmv)} vs prior)`);
  lines.push(`- Orders: **${fmtNumber(totals.orders)}** (${pctDelta(totals.orders, prev.orders)})`);
  lines.push(`- Items Sold: **${fmtNumber(totals.items)}** (${pctDelta(totals.items, prev.items)})`);
  lines.push(`- Videos Posted: **${fmtNumber(totals.videos)}** (${pctDelta(totals.videos, prev.videos)})`);
  lines.push(`- Active Creators: **${fmtNumber(totals.creators)}** (${pctDelta(totals.creators, prev.creators)})`);
  lines.push('');

  // Brand breakdown — only when on All Brands
  if (brands.length > 1) {
    const breakdown = summaries
      .map(({ brand: b, s }) => ({ brand: b, gmv: s?.total_gmv ?? 0 }))
      .filter((b) => b.gmv > 0)
      .sort((a, b) => b.gmv - a.gmv);
    if (breakdown.length > 0) {
      lines.push('## Brand Breakdown');
      const totalBrand = breakdown.reduce((s, b) => s + b.gmv, 0);
      for (const b of breakdown) {
        const share = totalBrand > 0 ? (b.gmv / totalBrand) * 100 : 0;
        lines.push(`- **${BRAND_DISPLAY_NAMES[b.brand] ?? b.brand}**: ${fmtCurrency(b.gmv)} (${share.toFixed(1)}%)`);
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
      const brandTag = brands.length > 1 ? ` · ${BRAND_DISPLAY_NAMES[c.brand] ?? c.brand}` : '';
      lines.push(`${i + 1}. **@${c.creator_name}**${brandTag} — ${fmtCurrency(c.total_gmv)} · ${fmtNumber(c.total_videos)} posts`);
    });
  }
  lines.push('');

  // Top 10 videos
  lines.push('## Top 10 Videos');
  if (topVideos.length === 0) {
    lines.push('_No video data in this period._');
  } else {
    topVideos.forEach((v, i) => {
      const brandTag = brands.length > 1 ? ` · ${BRAND_DISPLAY_NAMES[v.brand] ?? v.brand}` : '';
      const titleTrim = (v.video_title || 'Untitled').length > 80
        ? (v.video_title || 'Untitled').slice(0, 77) + '…'
        : (v.video_title || 'Untitled');
      lines.push(`${i + 1}. ${titleTrim}`);
      lines.push(`   @${v.creator_name}${brandTag} — ${fmtCurrency(v.total_gmv)} · ${fmtNumber(v.total_views)} views`);
    });
  }

  return lines.join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// 2. CREATOR ACTIVITY — roster health check
// ────────────────────────────────────────────────────────────────────────────

/** Status thresholds match classifyCreator() in lib/data/creator-status.ts */
function bucketByVideos(videos: number): 'star' | 'on_track' | 'at_risk' | 'behind' | 'ghost' {
  if (videos >= 8)  return 'star';
  if (videos >= 6)  return 'on_track';
  if (videos >= 4)  return 'at_risk';
  if (videos >= 1)  return 'behind';
  return 'ghost';
}

export async function generateCreatorActivity(brand: string, period: ReportPeriod): Promise<string> {
  const { start, end } = resolveRanges(period);
  const brands = brandsToQuery(brand);
  if (brands.length === 0) return 'No brands available for this user.';

  const creatorsByBrand = await Promise.all(
    brands.map(async (b) => {
      const data = await getCreatorRankings(b, start, end, 500);
      return data.map((c) => ({ ...c, brand: b }));
    })
  ).then((rs) => rs.flat());

  // Bucket by 7-day status (use total_videos in period)
  const buckets: Record<string, typeof creatorsByBrand> = {
    star: [], on_track: [], at_risk: [], behind: [], ghost: [],
  };
  for (const c of creatorsByBrand) {
    buckets[bucketByVideos(c.total_videos)].push(c);
  }
  for (const k of Object.keys(buckets)) {
    buckets[k].sort((a, b) => b.total_gmv - a.total_gmv);
  }

  const totalGmv = creatorsByBrand.reduce((s, c) => s + c.total_gmv, 0);
  const totalCreators = creatorsByBrand.length;

  const lines: string[] = [];
  lines.push(`# Creator Activity — ${brandHeading(brand)}`);
  lines.push(`${periodLabel(period)} · ${start} → ${end}`);
  lines.push('');
  lines.push('## Roster Health');
  lines.push(`- Active creators in period: **${fmtNumber(totalCreators)}**`);
  lines.push(`- Total GMV from active creators: **${fmtCurrency(totalGmv)}**`);
  lines.push(`- Star (8+ posts): **${buckets.star.length}**`);
  lines.push(`- On Track (6-7): **${buckets.on_track.length}**`);
  lines.push(`- At Risk (4-5): **${buckets.at_risk.length}**`);
  lines.push(`- Behind (1-3): **${buckets.behind.length}**`);
  lines.push(`- Ghost (0): **${buckets.ghost.length}**`);
  lines.push('');

  const renderBucket = (key: keyof typeof buckets, label: string, max = 25) => {
    const list = buckets[key];
    if (list.length === 0) return;
    lines.push(`## ${label} — ${list.length} creator${list.length === 1 ? '' : 's'}`);
    list.slice(0, max).forEach((c, i) => {
      const brandTag = brands.length > 1 ? ` · ${BRAND_DISPLAY_NAMES[c.brand] ?? c.brand}` : '';
      lines.push(`${i + 1}. **@${c.creator_name}**${brandTag} — ${fmtCurrency(c.total_gmv)} · ${c.total_videos} posts`);
    });
    if (list.length > max) {
      lines.push(`_…and ${list.length - max} more._`);
    }
    lines.push('');
  };

  renderBucket('star',     '⭐️ Star Performers');
  renderBucket('on_track', '✅ On Track');
  renderBucket('at_risk',  '⚠️ At Risk');
  renderBucket('behind',   '🟡 Behind');
  renderBucket('ghost',    '👻 Ghosts (no posts in period)', 50);

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
  const { start, end, prevStart, prevEnd } = resolveRanges(period);
  const brands = brandsToQuery(brand);
  if (brands.length === 0) return 'Brand not available.';
  const b = brands[0];

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
  lines.push(`# ${BRAND_DISPLAY_NAMES[b] ?? b} — Performance Report`);
  lines.push(`Reporting Period: ${start} → ${end} (${periodLabel(period)})`);
  lines.push(`Generated: ${format(new Date(), 'MMMM d, yyyy')}`);
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`Over the past ${period === '30d' ? '30 days' : 'week'}, ${BRAND_DISPLAY_NAMES[b] ?? b} generated **${fmtCurrency(totalGmv)}** in GMV across **${fmtNumber(totalVideos)}** videos from **${fmtNumber(uniqueCreators)}** active creators. This represents a **${pctDelta(totalGmv, prevTotalGmv)}** change versus the previous period.`);
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
      lines.push(`${i + 1}. **@${c.creator_name}** — ${fmtCurrency(c.total_gmv)} GMV across ${c.total_videos} videos (AOV ${fmtCurrency(aov)})`);
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
      lines.push(`   @${v.creator_name} — ${fmtCurrency(v.total_gmv)} · ${fmtNumber(v.total_views)} views · ${v.days_active} days active`);
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
