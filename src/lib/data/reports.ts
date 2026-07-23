/**
 * Reports library — generates the 3 long-form text reports surfaced on the Reporting page.
 *
 * Reports are markdown-flavored plain text designed to be:
 *  - Read in the in-app preview
 *  - Copy-pasted into email or docs
 *  - Forwarded to clients (brand-report)
 *
 * Sources data via the analytics_* multi-brand RPCs (totals + creator
 * rankings), the video_performance-backed get_video_summary RPC (video lists —
 * the only source with real TikTok video identity), get_creator_handle_perf
 * (contracted-roster grading in the Creator Activity report), and the legacy
 * per-brand get_brand_summary / get_creator_rankings / get_daily_trend RPCs
 * for the single-brand client report. All SECURITY DEFINER, so we can fan out
 * across brands in parallel without RLS gotchas.
 */

import {
  getBrandSummary,
  getCreatorRankings,
  getVideoSummary,
  getDailyTrend,
  getAnalyticsBrandTotals,
  getAnalyticsCreatorRankings,
  type AnalyticsCreatorRanking,
} from './rpc';
import { createClient } from '@/lib/supabase/server';
import { getBrandRegistry, brandLabel, activeBrandSlugs, resolveUuids, expandSlugs, type BrandRegistry } from '@/lib/data/brand-registry';
import { format } from 'date-fns';

export type ReportType = 'performance-summary' | 'creator-activity' | 'brand-report';
export type ReportPeriod = '7d' | '30d';

/** Rankings fetch cap, used ONLY for summary lines (top creators, active
 *  counts). A 30d all-brands window holds ~367k (brand, creator) pairs, so
 *  this can and does truncate; the report discloses the cap when hit. Bucket
 *  populations must NOT be derived from this fetch - a GMV-desc rank cap
 *  excludes exactly the low/zero-GMV contracted tail the buckets exist to
 *  find (see generateCreatorActivity). */
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

/** Brands to query based on the user's brand filter. Accepts umbrella-grain
 *  active slugs AND per-store child slugs (leefar_nutrition etc.): the
 *  reporting UI deliberately submits store slugs for the text reports (see
 *  use-report-brands.tsx - umbrellas are hidden, their stores shown), so
 *  validating against activeBrandSlugs alone returned 'Brand not available.'
 *  for every umbrella store. A store is queryable when it is not archived and
 *  its parent brand is active; uuid resolution downstream (resolveUuids /
 *  expandSlugs) already handles store slugs, and the legacy per-brand RPCs
 *  filter fact tables by the store-grain brand text column. */
function brandsToQuery(reg: BrandRegistry, brand: string): string[] {
  const active = activeBrandSlugs(reg);
  if (!brand || brand === 'all') return active;
  if (active.includes(brand)) return [brand];
  const row = reg.bySlug.get(brand);
  if (row && !row.is_archived && row.parent_brand_id) {
    const parent = reg.byId.get(row.parent_brand_id);
    if (parent && !parent.is_archived) return [brand];
  }
  return [];
}

function normalizeHandle(h: string | null | undefined): string {
  return (h ?? '').replace(/^@/, '').trim().toLowerCase();
}

/** A ranking row folded to report grain: one row per (report brand, creator). */
interface MergedCreatorRanking {
  brand: string;
  creator_name: string;
  total_gmv: number;
  total_orders: number;
  total_items_sold: number;
  total_videos: number;
}

/**
 * Fold store-grain ranking rows into (umbrella-grain brand, creator) rows.
 * toReportSlug alone only RELABELS a store row - an umbrella's stores then
 * yield multiple same-label rows for the same handle (LeeFar: thousands of
 * handles sell in 2+ stores in a 30d window), so Top Creators listed one
 * creator twice with split GMV and per-brand counts double-counted. Summing
 * per (report slug, normalized handle) is the actual rollup.
 */
function mergeRankings(reg: BrandRegistry, rows: AnalyticsCreatorRanking[]): MergedCreatorRanking[] {
  const map = new Map<string, MergedCreatorRanking>();
  for (const r of rows) {
    const brand = toReportSlug(reg, r.brand_slug);
    const key = `${brand}|${normalizeHandle(r.creator_name)}`;
    const cur = map.get(key);
    if (cur) {
      cur.total_gmv += r.total_gmv;
      cur.total_orders += r.total_orders;
      cur.total_items_sold += r.total_items_sold;
      cur.total_videos += r.total_videos;
    } else {
      map.set(key, {
        brand,
        creator_name: r.creator_name,
        total_gmv: r.total_gmv,
        total_orders: r.total_orders,
        total_items_sold: r.total_items_sold,
        total_videos: r.total_videos,
      });
    }
  }
  return [...map.values()];
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

  // 4 multi-brand RPC round-trips for totals + rankings, plus a per-store
  // get_video_summary fan-out for Top Videos. The video list MUST come from
  // video_performance (get_video_summary), which carries real TikTok video
  // identity: analytics_videos groups daily_video_product_stats.video_id,
  // which is a reused PRODUCT id - hundreds of distinct videos collide under
  // one "video_id" per month, so its "Top Videos" are fictional composites.
  // get_video_summary filters by the store-grain brand text column, so expand
  // umbrellas to their data slugs before fanning out (an umbrella slug itself
  // matches no fact rows).
  const dataSlugs = brands.flatMap((b) => expandSlugs(reg, b));
  const [totalsCur, totalsPrev, rankingsCurRaw, rankingsPrevRaw, videosAll] = await Promise.all([
    getAnalyticsBrandTotals(brandIds, start, end),
    getAnalyticsBrandTotals(brandIds, prevStart, prevEnd),
    getAnalyticsCreatorRankings(brandIds, start, end, RANKINGS_LIMIT),
    getAnalyticsCreatorRankings(brandIds, prevStart, prevEnd, RANKINGS_LIMIT),
    Promise.all(
      dataSlugs.map(async (s) =>
        (await getVideoSummary(s, start, end, 10)).map((v) => ({ ...v, brand_slug: s })),
      ),
    ).then((r) => r.flat()),
  ]);

  // Fold store-grain ranking rows to (report brand, creator) BEFORE any
  // counting or ranking - unmerged, an umbrella's stores each contribute a row
  // for the same handle (see mergeRankings).
  const rankingsCur = mergeRankings(reg, rankingsCurRaw);
  const rankingsPrev = mergeRankings(reg, rankingsPrevRaw);

  // Aggregate totals. Active-creator counts come from the merged rankings row
  // counts (analytics_brand_totals deliberately dropped unique_creators for
  // perf); one creator per report-grain brand, so an umbrella's stores no
  // longer double-count. Cap detection reads the RAW row counts - merging can
  // shrink a truncated fetch back under the limit.
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
  const creatorsCapped = rankingsCurRaw.length >= RANKINGS_LIMIT || rankingsPrevRaw.length >= RANKINGS_LIMIT;

  // Top creators: merged rows already carry the report-grain brand slug.
  const topCreators = [...rankingsCur]
    .sort((a, b) => b.total_gmv - a.total_gmv)
    .slice(0, 10);
  // Top videos: one row per REAL video per report brand. A video selling in
  // two stores of the same umbrella returns a per-store row from each fan-out
  // call; sum its stats under one entry instead of listing it twice.
  const videoMap = new Map<string, {
    brand: string; video_id: string; video_title: string; creator_name: string;
    total_gmv: number; total_orders: number;
  }>();
  for (const v of videosAll) {
    const vBrand = toReportSlug(reg, v.brand_slug);
    const key = `${vBrand}|${v.video_id}`;
    const cur = videoMap.get(key);
    if (cur) {
      // Keep title/creator from the higher-GMV row, then sum.
      if (v.total_gmv > cur.total_gmv) {
        cur.video_title = v.video_title;
        cur.creator_name = v.creator_name;
      }
      cur.total_gmv += v.total_gmv;
      cur.total_orders += v.total_orders;
    } else {
      videoMap.set(key, {
        brand: vBrand,
        video_id: v.video_id,
        video_title: v.video_title,
        creator_name: v.creator_name,
        total_gmv: v.total_gmv,
        total_orders: v.total_orders,
      });
    }
  }
  const topVideos = [...videoMap.values()]
    .sort((a, b) => b.total_gmv - a.total_gmv)
    .slice(0, 10);

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

/** One contracted (retainer > 0) managed_creators row: the unit the posting
 *  buckets grade. Posts and GMV are summed across ALL the row's handles. */
interface ContractedCreator {
  /** managed_creators.brand (umbrella-grain slug). */
  brand: string;
  /** First non-empty handle on the row - the name the report displays. */
  displayHandle: string;
  /** All normalized handles on the row (account_1..account_10). */
  handles: string[];
}

/**
 * Roster commitment lookup: the CONTRACTED roster rows (retainer > 0 - they
 * carry the post commitment) plus the handle sets used to split ranked
 * creators into contracted / affiliate / organic for the summary lines.
 * Paged past the 1000-row PostgREST cap — managed_creators is over it, and a
 * truncated read would mislabel real contracted creators as organic.
 * `brands` must be umbrella-grain slugs (the grain managed_creators.brand is
 * keyed to).
 */
async function getRosterCommitment(brands: string[]): Promise<{
  contractedCreators: ContractedCreator[];
  contracted: Set<string>;
  managed: Set<string>;
}> {
  const supabase = await createClient();
  const contractedCreators: ContractedCreator[] = [];
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
      const handles: string[] = [];
      for (const k of cols) {
        const handle = normalizeHandle(row[k]);
        if (!handle) continue;
        managed.add(handle);
        if (hasRetainer) {
          contracted.add(handle);
          handles.push(handle);
        }
      }
      if (hasRetainer && handles.length > 0) {
        contractedCreators.push({ brand: String(row.brand ?? ''), displayHandle: handles[0], handles });
      }
    }
    if (!data || data.length < PAGE) break;
  }
  return { contractedCreators, contracted, managed };
}

/**
 * Posts + GMV over the report window for the contracted roster's handles, via
 * get_creator_handle_perf - the precomputed roster_creator_daily/posts rollups
 * the roster page reads (migration 062 signature: handles, brand_ids,
 * days_back, p_start_date, p_end_date). Handles are chunked at 400 per call
 * (the dashboard's HCHUNK idiom). The explicit window is passed because report
 * windows are data-anchored and can lag real today; days_back is also sized to
 * cover the window from real today as belt-and-braces for the RPC's coalesce.
 * Throws on failure: a dead read must never grade the whole roster as Ghosts.
 */
async function getContractedPerf(
  handles: string[],
  brandIds: string[],
  start: string,
  end: string,
): Promise<Map<string, { gmv: number; posts: number }>> {
  const out = new Map<string, { gmv: number; posts: number }>();
  if (handles.length === 0) return out;
  const supabase = await createClient();
  const HCHUNK = 400;
  const chunks: string[][] = [];
  for (let i = 0; i < handles.length; i += HCHUNK) chunks.push(handles.slice(i, i + HCHUNK));
  const daysBack = Math.max(
    30,
    Math.ceil((Date.now() - Date.parse(`${start}T00:00:00Z`)) / 86400000),
  );
  const results = await Promise.all(chunks.map((slice) =>
    supabase.rpc('get_creator_handle_perf', {
      handles: slice,
      brand_ids: brandIds.length > 0 ? brandIds : null,
      days_back: daysBack,
      p_start_date: start,
      p_end_date: end,
    }),
  ));
  for (const res of results) {
    if (res.error) throw new Error(`[reports] get_creator_handle_perf failed: ${res.error.message}`);
    const rows = (res.data ?? []) as { tiktok_username: string; gmv_period: string | number; posts_period: string | number }[];
    for (const r of rows) {
      const h = normalizeHandle(r.tiktok_username);
      if (!h) continue;
      const cur = out.get(h) ?? { gmv: 0, posts: 0 };
      cur.gmv += Number(r.gmv_period) || 0;
      cur.posts += Number(r.posts_period) || 0;
      out.set(h, cur);
    }
  }
  return out;
}

export async function generateCreatorActivity(brand: string, period: ReportPeriod): Promise<string> {
  const reg = await getBrandRegistry();
  const brands = brandsToQuery(reg, brand);
  if (brands.length === 0) return 'No brands available for this user.';
  const brandIds = brandIdsForSlugs(reg, brands);

  // Anchor to the latest upload so a stale week never produces a $0 report.
  const anchor = await resolveLatestDataDate(brandIds);
  const { start, end, days } = resolveRanges(period, anchor);

  // Two sources, honestly split:
  //  - The CONTRACTED bucket population comes from the roster itself
  //    (managed_creators, retainer > 0), graded via get_creator_handle_perf.
  //    It must NOT come from a GMV-ranked fetch: a 30d all-brands window holds
  //    ~367k (brand, creator) pairs, so a top-5,000-by-GMV cap excluded most
  //    of the low/zero-GMV contracted tail - exactly the Behind/At-Risk/Ghost
  //    creators these buckets exist to find.
  //  - The analytics rankings feed ONLY the summary lines (active counts,
  //    affiliate/organic splits), with the cap disclosed when hit.
  // managed_creators.brand is umbrella-grain; collapse any store slug (finding
  // the roster for leefar_nutrition means LeeFar's roster) before querying it.
  const rosterBrands = [...new Set(brands.map((b) => toReportSlug(reg, b)))];
  const [rankingsRaw, commitment] = await Promise.all([
    getAnalyticsCreatorRankings(brandIds, start, end, RANKINGS_LIMIT),
    getRosterCommitment(rosterBrands),
  ]);
  // Fold store-grain ranking rows to (report brand, creator) so one creator
  // selling in two stores of an umbrella is not counted twice (mergeRankings).
  const creatorsByBrand = mergeRankings(reg, rankingsRaw);

  // Window perf for every contracted handle, straight from the roster rollups.
  const contractedHandles = [...new Set(commitment.contractedCreators.flatMap((c) => c.handles))];
  const perfByHandle = await getContractedPerf(contractedHandles, brandIds, start, end);

  const t = bucketThresholds(days);

  // Behind/Ghost are CONTRACT states — only creators with a retainer carry a
  // post commitment. ~63% of the roster are $0-retainer affiliates; labeling
  // them "Behind" or "Ghost" is false. Grade every contracted roster row
  // (posts + GMV summed across its handles). A creator whose handles show zero
  // posts in the window is a Ghost - which now naturally includes contracted
  // creators absent from the performance data entirely, invisible to any
  // rankings-derived population.
  interface BucketRow { brand: string; handle: string; gmv: number; posts: number }
  const buckets: Record<'star' | 'on_track' | 'at_risk' | 'behind' | 'ghost', BucketRow[]> = {
    star: [], on_track: [], at_risk: [], behind: [], ghost: [],
  };
  for (const c of commitment.contractedCreators) {
    let gmv = 0;
    let posts = 0;
    for (const h of c.handles) {
      const p = perfByHandle.get(h);
      if (p) {
        gmv += p.gmv;
        posts += p.posts;
      }
    }
    buckets[bucketByVideos(posts, t)].push({ brand: c.brand, handle: c.displayHandle, gmv, posts });
  }
  for (const k of Object.keys(buckets) as (keyof typeof buckets)[]) {
    buckets[k].sort((a, b) => b.gmv - a.gmv);
  }

  // Summary-line splits from the merged rankings. Contracted rows are covered
  // by the roster-sourced buckets above; the rest split affiliate vs organic.
  const affiliates: typeof creatorsByBrand = [];
  const organic: typeof creatorsByBrand = [];
  for (const c of creatorsByBrand) {
    const handle = normalizeHandle(c.creator_name);
    if (commitment.contracted.has(handle)) continue;
    if (commitment.managed.has(handle)) {
      affiliates.push(c);
    } else {
      organic.push(c);
    }
  }

  const totalGmv = creatorsByBrand.reduce((s, c) => s + c.total_gmv, 0);
  const totalCreators = creatorsByBrand.length;
  const contractedTotal = commitment.contractedCreators.length;
  const affiliateGmv = affiliates.reduce((s, c) => s + c.total_gmv, 0);
  const organicGmv = organic.reduce((s, c) => s + c.total_gmv, 0);

  const lines: string[] = [];
  lines.push(`# Creator Activity - ${brandHeading(reg, brand)}`);
  lines.push(`${periodLabel(period)} · ${start} → ${end}`);
  lines.push('');
  lines.push('## Roster Health');
  lines.push(`- Active creators in period: **${fmtNumber(totalCreators)}**${rankingsRaw.length >= RANKINGS_LIMIT ? ` (rankings capped at ${fmtNumber(RANKINGS_LIMIT)})` : ''}`);
  lines.push(`- Total GMV from active creators: **${fmtCurrency(totalGmv)}**`);
  lines.push(`- Contracted creators on roster (retainer, post commitment): **${fmtNumber(contractedTotal)}**`);
  lines.push(`- Star (${t.star}+ posts): **${buckets.star.length}**`);
  lines.push(`- On Track (${t.onTrack}-${t.star - 1}): **${buckets.on_track.length}**`);
  lines.push(`- At Risk (${t.atRisk}-${t.onTrack - 1}): **${buckets.at_risk.length}**`);
  lines.push(`- Behind (1-${t.atRisk - 1}): **${buckets.behind.length}**`);
  lines.push(`- Ghost (0): **${buckets.ghost.length}**`);
  lines.push(`- Affiliates active (no retainer, no post commitment): **${fmtNumber(affiliates.length)}** · ${fmtCurrency(affiliateGmv)} GMV`);
  lines.push(`- Organic creators active (not on the roster): **${fmtNumber(organic.length)}** · ${fmtCurrency(organicGmv)} GMV`);
  lines.push('');
  lines.push('_Posting buckets grade the full contracted roster, whether or not a creator shows sales activity in the period. Affiliates and organic creators carry no post commitment and are never marked Behind or Ghost._');
  lines.push('');

  const renderBucket = (key: keyof typeof buckets, label: string, max = 25) => {
    const list = buckets[key];
    if (list.length === 0) return;
    lines.push(`## ${label} - ${list.length} creator${list.length === 1 ? '' : 's'}`);
    list.slice(0, max).forEach((c, i) => {
      const brandTag = brands.length > 1 ? ` · ${brandLabel(reg, c.brand)}` : '';
      lines.push(`${i + 1}. **@${c.handle}**${brandTag} - ${fmtCurrency(c.gmv)} · ${c.posts} posts`);
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
  // May be a store-grain slug (leefar_nutrition etc.) - see brandsToQuery.
  // The legacy RPCs below (get_brand_summary / get_creator_rankings /
  // get_video_summary / get_daily_trend, migration 001) all filter the fact
  // tables by the store-grain `brand` text column, and resolveLatestDataDate
  // resolves the slug to its store uuid, so store slugs work end to end.
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
