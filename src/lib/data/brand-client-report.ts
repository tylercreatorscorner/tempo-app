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
    /** Posts the roster published in the prior window (mig
     *  brand_client_report_managed_prior_videos). Every roster figure carries
     *  a period-over-period change; posts was the one that could not. */
    priorVideos: number;
    gmvChangePct: number | null; // null = "from zero" (render as "new")
    orderChangePct: number | null;
    videoChangePct: number | null;
    creatorChangePct: number | null;
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

  /**
   * Activity at PERSON grain, split into its two honest halves (migration 165).
   *
   * ACTIVE WAS ONE NUMBER AND IT MEANT NEITHER THING. `activeCreators` and the
   * split's `creators` count handles PRESENT in the TikTok export, which emits
   * a row per creator per day whether or not they sold — jiyu 2026-08 printed
   * 40,954 store creators against 4,216 who posted and 930 who sold.
   *
   * rosterPosted is the agency's work. rosterSold includes creators earning off
   * content posted months ago: 20 jiyu creators sold without posting once.
   * rosterPosted + rosterSoldNotPosted == the legacy activePeople, which is the
   * check that the split loses nothing.
   *
   * OPTIONAL: every snapshot frozen before migration 165 lacks it.
   */
  activity?: {
    rosterPosted: number;
    rosterPostedPrior: number;
    rosterSold: number;
    rosterSoldNotPosted: number;
    /** Roster rows archived DURING the window. Person grain. */
    rosterDeparted: number;
    storeCreatorsPosted: number;
    storeCreatorsSold: number;
  };

  /**
   * Video / live / product-card GMV (migration 165). Computed inside the split
   * RPC on the same time-aware membership rule as the managed GMV, so the three
   * SUM to the total exactly rather than approximately — jiyu roster
   * 151,994.87 + 9,322.14 + 463.99 = 161,781.00.
   *
   * live_gmv and live_streams have been populated all along and have never
   * appeared in the report. There is NO per-stream table: lives exist only as
   * creator-daily aggregates, so a "top live" with a title is not possible —
   * only top creators BY live GMV.
   */
  channels?: {
    rosterVideoGmv: number; rosterLiveGmv: number;
    rosterCardGmv: number;  rosterLiveStreams: number;
    storeVideoGmv: number;  storeLiveGmv: number;
    storeCardGmv: number;   storeLiveStreams: number;
  };

  /**
   * The SAME granular shape, over the calendar month containing the window's
   * end date, from the 1st through that end date.
   *
   * 🚨 WHY A SECOND PASS EXISTS. Post targets and retainers are MONTHLY. A
   * weekly report judged them over 7 days, so 15 of Dr. Dent's retained
   * creators printed "0 / 30" for the week of 2026-08-23 and the roster read as
   * idle when it was simply a week into a month. The commitment has to be
   * measured over the period it was written for.
   *
   * ⚠️ NOT pro-rated, ever. The target stays the full monthly count and the
   * days elapsed are reported beside it as a fact. Scaling 30 posts down to
   * "7 for this week" would invent a cadence nobody agreed to.
   *
   * Absent when the report window IS already a whole calendar month (the month
   * pass would be identical), and when the RPC fails, which is non-fatal.
   */
  /**
   * New creators signed, at CALENDAR MONTH grain (migration 189).
   *
   * 🚨 `isFirstMonth` marks the brand's opening bulk load, where the whole
   * starting roster shares one cc_start_date (Dr. Dent: 85 on 2026-06-25).
   * The renderer MUST suppress the figure then rather than claim a month of
   * recruiting that never happened.
   *
   * 🚨 `priorComparable` is false when the prior month IS that bulk load, or
   * predates the relationship. Comparing against it invents a collapse.
   *
   * Counts include creators who have since left, so a past month's number
   * cannot shrink as people are archived.
   *
   * OPTIONAL: absent on snapshots frozen before this shipped, and on failure.
   */
  signings?: {
    monthLabel: string;
    priorMonthLabel: string;
    signed: number;
    signedRetained: number;
    signedPrior: number;
    isFirstMonth: boolean;
    priorComparable: boolean;
  };

  monthToDate?: {
    /** First day of the month, and the last day counted. */
    start: Date;
    end: Date;
    daysElapsed: number;
    daysInMonth: number;
    granular: NonNullable<BrandClientReportData['granular']>;
  };

  /**
   * Who on the roster actually goes live. By HANDLE, because the split RPC
   * collapses roster membership to handle grain on purpose.
   *
   * Deliberately NOT a column on the creator table: jiyu's roster ran 87
   * streams across 259 signed creators, so the column would be ~97% zeros —
   * and the list says what the total hides, that one handle produced 92.5% of
   * the live GMV.
   */
  topLive?: { handle: string; liveGmv: number; lives: number }[];

  /**
   * Retainer roster vs affiliate-only, derived from `granular.creators` with no
   * extra query. Affiliate-only creators carry NO retainer and no post
   * commitment, so this is the honest read on what the retained roster returns.
   */
  agreementSplit?: {
    retainerGmv: number; affiliateGmv: number;
    retainerCreators: number; affiliateCreators: number;
    /** Managed GMV the granular creator list does not carry (departed
     *  mid-window, or a handle it could not map). Surfaced so the split may
     *  visibly fail to add up rather than quietly absorbing it into a bucket. */
    unattributedGmv: number;
  };

  /**
   * Granular block (migration 152). OPTIONAL on purpose: every already-frozen
   * client_reports.snapshot predates it, so the renderer must treat absence as
   * "this section does not exist for this report" rather than let undefined
   * flow into arithmetic. See the finite() note in report-view.tsx.
   */
  granular?: {
    /** Roster composition. `affiliateOnly` creators take commission with NO
     *  post commitment — they are not creators who missed a quota. */
    roster: {
      signed: number;
      onRetainer: number;
      affiliateOnly: number;
      /** CONTRACTED monthly sum. Month-grain; never apportioned to the window. */
      monthlyRetainerBudget: number;
      /**
       * Whether every retained creator's figure is backed by a retainer_history
       * record covering this window (migration 172).
       *
       * FALSE means the window predates the history and the earliest observed
       * value was carried backwards. Before this existed the report carried
       * TODAY's retainer back over any historical window with no indication at
       * all — a July report showed August's numbers. Absent on snapshots frozen
       * before 172, where it must read as "unknown", not "verified".
       */
      retainerHistoryExact?: boolean;
      /**
       * Share of RETAINED creators (0-100) carrying a level. ⚠️ The renderer
       * gates the column on this: role is empty for 49% of the roster and for
       * EVERY retained creator on some brands, and a column of dashes on a
       * client's report is worse than no column. Absent on older snapshots.
       */
      roleCoverage?: number;
    };
    /** postsPublished counts on post_date; videosEarning counts what was live
     *  in the window. They differ by an order of magnitude — never merge them. */
    videoCounts: { postsPublished: number; videosEarning: number };
    /** 30 days, not the report window: on a 7-day window the same measure reads
     *  3.1% against 51.7% at 30 days, because a video posted Thursday has had
     *  two days to earn. */
    newVideo: {
      gmv30d: number;
      videos30d: number;
      totalGmv: number;
      /** Belongs to neither bucket. Surfaced so the split may fail to add up
       *  rather than quietly absorbing it into the catalog. */
      unknownPostDateGmv: number;
    };
    /**
     * Net-new GMV: revenue from videos POSTED on or after each creator's
     * cc_start_date (migration 173). Some brands worked with a creator before
     * CC did and credit CC only with content posted after the relationship
     * began.
     *
     * ⚠️ ADDITIVE, never a replacement. `gmv` stays the full figure
     * everywhere; this sits beside it as a second lens. netNewGmv + preCcGmv
     * === totalGmv, which is the cheap check that it has not been swapped in
     * somewhere by accident.
     *
     * ⚠️ Counts by POST date, not EARNING date. A creator's pre-CC back
     * catalogue keeps earning and that revenue is real — it just is not
     * something CC started.
     */
    netNew?: { netNewGmv: number; preCcGmv: number; totalGmv: number };
    /** Newest three post-months, newest first. */
    vintage: { label: string; videos: number; gmv: number }[];
    vintageOlder: { videos: number; gmv: number };
    /** EVERY signed creator, including those at zero. `quota` is null for
     *  affiliate-only and MUST render as absence, never 0. */
    creators: {
      name: string;
      /** Raw real_name. NULL for 147 active creators (9%), so the UI falls
       *  back to the handle rather than rendering an empty identity cell. */
      realName?: string | null;
      /** The handle that EARNED the most in the window, not account_1.
       *  account_1 is column order, not meaning: it showed Lissandro as
       *  @tipsdesandro on JiYu, a handle that has never had a sale there,
       *  while @tumejorsalud97 earned $13,238. */
      handle: string | null;
      /** Every known handle, account_ columns UNION tiktok_accounts. */
      handles?: string[];
      /** 37% of active creators hold more than one. */
      handleCount?: number;
      isAffiliate: boolean;
      /**
       * CC's level for this creator ON THIS BRAND (Incubator, Creatives,
       * Closer, Active). Per brand because managed_creators is per brand.
       * ⚠️ NOT current_tier, which reads 'bronze' for all 1,947 active rows.
       */
      role?: string | null;
      retainer: number;
      quota: number | null;
      /** Left the roster DURING the window. Their GMV is real and is kept, but
       *  retainer and quota read 0/null because they are no longer a standing
       *  cost. Optional: snapshots frozen before migration 157 lack it. */
      departed?: boolean;
      postsPublished: number;
      videosEarning: number;
      gmv: number;
      orders: number;
      /** Of this creator's GMV, what came from content posted IN the window —
       *  their new work, as opposed to their back catalogue still selling. */
      windowPostGmv?: number;
      /** Of this creator's GMV, what came from content posted on or after
       *  their cc_start_date. gmv - netNewGmv is their pre-CC catalogue. */
      netNewGmv?: number;
      /** When CC started with this creator FOR THIS BRAND. Backfilled from
       *  added_at; the 2025-11-25 bulk-import cohort is approximate and errs
       *  toward UNDERSTATING net-new. */
      ccStartDate?: string | null;
    }[];
  };

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
async function resolveSharedAnchor(supabase: SupabaseClient, brandSlugs: string[] | null): Promise<Date> {
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

// ── Main fetcher ───────────────────────────────────────────────────
//
// ONE round-trip (mig 096): get_brand_client_report_agg computes every
// section as bounded aggregates in SQL - totals, prior totals, managed/
// organic (+ managed prior), new-vs-returning, newly-activated, daily
// series, leaderboards (overall + managed), products, product x creator.
// The old path paginate-looped creator_performance twice and
// video_performance once through per-row RLS: ~100+ sequential pages,
// 10-20s, and the same 8s-timeout cliff that killed the Daily Drop.
// Measured now: single brand ~1.8s, all-brands ~9s (one statement, its own
// 60s timeout). The RPC throws on error - a failed money read must never
// render as $0 on a client-facing PDF.

interface AggLeaderCreator { name: string; gmv: number; orders: number; videos: number }
interface AggLeaderVideo { title: string; creator: string; gmv: number; orders: number; url: string | null }

// Top-N leaderboard with pct-of-total.
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

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isNaN(n) ? 0 : n;
}

export async function getBrandClientReportData(
  brandSlug: string,
  brandName: string,
  period: ReportPeriod | { start: string; end: string } = '7d',
  /**
   * Optional pre-built Supabase client. The brand portal passes the admin
   * client here - access is already validated at the layout level. The
   * aggregate RPC is SECURITY DEFINER either way.
   */
  clientOverride?: SupabaseClient,
): Promise<BrandClientReportData> {
  const supabase = clientOverride ?? (await createClient());
  const reg = await getBrandRegistry();
  const brandSlugs = getBrandDataSlugs(reg, brandSlug);

  // Managed-roster grain: managed_creators rows live at the umbrella/roster
  // slug. For a store slug include its parent umbrella so store-grain runs
  // stop returning an empty managed set (the old exact-match did).
  let rosterSlugs: string[] | null = null;
  if (brandSlug && brandSlug !== 'all') {
    const row = reg.bySlug.get(brandSlug);
    const parentSlug = row?.parent_brand_id ? reg.byId.get(row.parent_brand_id)?.slug : undefined;
    rosterSlugs = parentSlug ? [brandSlug, parentSlug] : [brandSlug];
  }

  // ── Resolve the time window. A preset ('7d'/'30d') anchors to the oldest of
  // the latest dates across creator/video tables so every section reports on
  // the same window. A custom { start, end } uses the picked dates verbatim -
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
    startDate.setDate(endDate.getDate() - (periodDays - 1));   // inclusive - N days through endDate
  }

  // Prior window = the same-length window immediately before the selected one
  // (drives the WoW/MoM deltas).
  const priorEnd = new Date(startDate);
  priorEnd.setDate(startDate.getDate() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setDate(priorEnd.getDate() - (periodDays - 1));

  const { data: aggRaw, error: aggErr } = await supabase.rpc('get_brand_client_report_agg', {
    p_data_slugs: brandSlugs,
    p_roster_slugs: rosterSlugs,
    p_start: formatDate(startDate),
    p_end: formatDate(endDate),
    p_prior_start: formatDate(priorStart),
    p_prior_end: formatDate(priorEnd),
  });
  if (aggErr) throw new Error(`[brand-client-report] get_brand_client_report_agg failed: ${aggErr.message}`);
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const agg = (aggRaw ?? {}) as Record<string, any>;

  const t = agg.totals ?? {};
  const pt = agg.prior_totals ?? {};
  const m = agg.managed ?? {};
  const o = agg.organic ?? {};
  const mp = agg.managed_prior ?? {};
  const nvr = agg.new_vs_returning ?? {};

  const totalGmv = num(t.gmv);
  const totalOrders = num(t.orders);
  const totalVideos = num(t.videos);
  const activeCreators = num(t.active_creators);
  const totalCommission = num(t.commission);
  const avgOrderValue = totalOrders > 0 ? totalGmv / totalOrders : 0;
  const avgGmvPerCreator = activeCreators > 0 ? totalGmv / activeCreators : 0;
  // Falls back to estimated 20% if est_commission column was zero/null in the data
  const estCommission = totalCommission > 0 ? totalCommission : totalGmv * 0.20;

  const priorTotalGmv = num(pt.gmv);
  const priorTotalOrders = num(pt.orders);
  const priorActiveCreators = num(pt.active_creators);
  const priorTotalVideos = num(pt.videos);


  // ── Daily performance + day-of-week (derived from the SQL daily series)
  const dailyArray = ((agg.daily ?? []) as Array<{ d: string; gmv: number; orders: number; creators: number }>)
    .map(r => ({
      date: new Date(r.d + 'T12:00:00Z'),
      weekday: new Date(r.d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long' }),
      gmv: num(r.gmv),
      orders: num(r.orders),
      creators: num(r.creators),
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const peakGmv = Math.max(0, ...dailyArray.map(d => d.gmv));
  const dailyPerformance = dailyArray.map(d => ({ ...d, isPeak: d.gmv === peakGmv && peakGmv > 0 }));

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

  // ── Leaderboards
  const topCreatorsRaw = ((agg.top_creators ?? []) as AggLeaderCreator[]).map(c => ({
    name: c.name, gmv: num(c.gmv), orders: num(c.orders), videos: num(c.videos),
  }));
  const topCreators = buildLeaderboard(topCreatorsRaw, totalGmv, 10);

  const mapVideo = (v: AggLeaderVideo) => ({
    title: v.title || '(untitled)',
    creator: v.creator || '',
    gmv: num(v.gmv),
    orders: num(v.orders),
    videoUrl: v.url || null,
  });
  const topVideos = ((agg.top_videos ?? []) as AggLeaderVideo[]).map(mapVideo);

  const topProductsRaw = ((agg.top_products ?? []) as Array<{ name: string; gmv: number; orders: number }>).map(p => ({
    name: p.name, gmv: num(p.gmv), orders: num(p.orders),
  }));
  const topProducts = buildLeaderboard(topProductsRaw, totalGmv, 10);

  // ── Product -> Creator breakdown (top 5 products, top 3 creators each)
  const pcRows = (agg.product_creators ?? []) as Array<{ product: string; name: string; gmv: number }>;
  // Granular block (mig 152). Failure is NOT fatal: the report has rendered
  // without this section since it shipped, and a granular query that errors
  // must degrade to the report we already had rather than 500 the page a
  // client is opening.
  // granular and counts are independent of each other and of `extras`, so they
  // run CONCURRENTLY. Sequentially they cost granular + counts; in parallel
  // they cost max(granular, counts). Measured on kitsch, the heaviest brand:
  // 0.5s + 4.8s sequential becomes 4.8s. That mattered — /api/client-reports/
  // preview 504'd at 60s on 2026-08-20 with this chain running end to end.
  //
  // The month-to-date pass rides in the SAME Promise.all rather than after it.
  // Measured on kitsch (heaviest brand) 2026-09-02: a full-month granular pass
  // is 6.4s, which is under the 4.8s..6.4s the other two already cost, so
  // concurrently it is close to free. Sequentially it would have added 6.4s to
  // a route that has already 504'd once.
  const monthStart = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));
  const daysInMonth = new Date(
    Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, 0),
  ).getUTCDate();
  // Skip when the window already IS the month: the second pass would be a
  // duplicate of the first.
  const windowIsWholeMonth =
    startDate.getUTCDate() === 1 &&
    startDate.getUTCMonth() === endDate.getUTCMonth() &&
    startDate.getUTCFullYear() === endDate.getUTCFullYear() &&
    endDate.getUTCDate() === daysInMonth;
  const wantMonthToDate = !windowIsWholeMonth;

  const [granularRes, countsRes, splitRes, mtdRes, signingsRes] = await Promise.all([
    supabase.rpc('get_brand_client_report_granular', {
      p_data_slugs: brandSlugs,
      p_roster_slugs: rosterSlugs,
      p_start: formatDate(startDate),
      p_end: formatDate(endDate),
    }),
    supabase.rpc('get_brand_client_report_counts', {
      p_data_slugs: brandSlugs,
      p_roster_slugs: rosterSlugs,
      p_start: formatDate(startDate),
      p_end: formatDate(endDate),
      p_prior_start: formatDate(priorStart),
      p_prior_end: formatDate(priorEnd),
    }),
    supabase.rpc('get_brand_client_report_managed_split', {
      p_data_slugs: brandSlugs,
      p_roster_slugs: rosterSlugs,
      p_start: formatDate(startDate),
      p_end: formatDate(endDate),
      p_prior_start: formatDate(priorStart),
      p_prior_end: formatDate(priorEnd),
    }),
    wantMonthToDate
      ? supabase.rpc('get_brand_client_report_granular', {
          p_data_slugs: brandSlugs,
          p_roster_slugs: rosterSlugs,
          p_start: formatDate(monthStart),
          p_end: formatDate(endDate),
        })
      : Promise.resolve({ data: null, error: null }),
    // Small table (1,935 rows), so this is cheap next to the granular passes.
    supabase.rpc('get_brand_report_signings', {
      p_roster_slugs: rosterSlugs,
      p_end: formatDate(endDate),
    }),
  ]);

  const granular = granularRes.error
    ? undefined
    : (granularRes.data as BrandClientReportData['granular']);

  /**
   * Time-aware managed/organic split (migration 157). OVERRIDES the managed and
   * organic blocks from get_brand_client_report_agg, whose `mh` CTE is a flat
   * handle set off managed_brand_handles with NO archived filter — so a creator
   * who left the roster a year ago still counted as managed, forever.
   *
   * Measured on Keeps 2026-08-15..21: the report said roster GMV $2,493.50 and
   * the dashboard said $1,920.81 on the same total ($7,026.34). Neither rule
   * was right. The report counted everyone who had EVER been on the roster; the
   * dashboard counted only who is on it TODAY, which retroactively rewrites
   * history every time someone is archived.
   *
   * The split evaluates membership on each ROW's date, so 2026-08-01..21 across
   * every brand moves from $1,535,917.70 (report) / $1,513,873.87 (dashboard)
   * to $1,516,147.26.
   *
   * Non-fatal by the same rule as `counts`: a failure leaves the agg's numbers
   * rather than 500ing a page a client is opening.
   */
  const split = splitRes.error ? null : (splitRes.data as {
    managed: { gmv: number; orders: number; commission: number; creators: number };
    organic: { gmv: number; orders: number; creators: number };
    managed_prior: { gmv: number; orders: number; creators: number };
    /** Migration 165. Absent on snapshots frozen before it. */
    channels?: {
      rosterVideoGmv: number; rosterLiveGmv: number;
      rosterCardGmv: number;  rosterLiveStreams: number;
      storeVideoGmv: number;  storeLiveGmv: number;
      storeCardGmv: number;   storeLiveStreams: number;
    };
    top_live?: { handle: string; liveGmv: number; lives: number }[];
  } | null);
  if (splitRes.error) {
    console.error('[brand-client-report] managed split failed, falling back to agg:', splitRes.error.message);
  }

  // Managed and organic BOTH come from the split, or BOTH from the agg. Taking
  // one from each would break the identity managed + organic = total, which is
  // the only cheap check a reader has that the split is honest.
  const sm = split?.managed;
  const so = split?.organic;
  const sp = split?.managed_prior;
  const managedGmv          = sm ? num(sm.gmv)      : num(m.gmv);
  const managedOrders       = sm ? num(sm.orders)   : num(m.orders);
  const managedCreatorCount = sm ? num(sm.creators) : num(m.creators);
  const managedCommission   = sm ? num(sm.commission) : num(m.commission);
  const organicGmv          = so ? num(so.gmv)      : num(o.gmv);
  const organicOrders       = so ? num(so.orders)   : num(o.orders);
  const organicCreatorCount = so ? num(so.creators) : num(o.creators);
  const priorManagedGmv      = sp ? num(sp.gmv)      : num(mp.gmv);
  const priorManagedOrders   = sp ? num(sp.orders)   : num(mp.orders);
  const priorManagedCreators = sp ? num(sp.creators) : num(mp.creators);
  const managedPct = totalGmv > 0 ? (managedGmv / totalGmv) * 100 : 0;

  /**
   * Corrected counts (migration 153). These OVERRIDE four figures that
   * get_brand_client_report_agg derives at the wrong grain:
   *
   *   signed creators   counted TikTok ACCOUNTS, not people (218 for 142).
   *   posts published   came from SUM(creator_performance.videos), which
   *                     undercounts UNEVENLY and inverted a trend: 159/112
   *                     (up 42%) against a true 194/259 (down 25%).
   *
   * Prior-window values come back too so the deltas move on the same basis.
   * Non-fatal: a failure leaves the previous numbers rather than 500ing a page.
   */
  const counts = countsRes.error ? null : (countsRes.data as {
    signedPeople: number; activePeople: number; activePeoplePrior: number;
    newlyActivePeople: number; rosterPosts: number; rosterPostsPrior: number;
    storePosts: number; storePostsPrior: number;
    // Migration 165. Optional at the type level would be a lie — the function
    // always returns them now — but a FROZEN snapshot replays an older shape,
    // so every read below goes through num() and tolerates undefined.
    rosterPosted?: number; rosterPostedPrior?: number; rosterSold?: number;
    rosterSoldNotPosted?: number; rosterDeparted?: number;
    storeCreatorsPosted?: number; storeCreatorsSold?: number;
  } | null);

  const productCreatorBreakdown = topProductsRaw.slice(0, 5).map(p => ({
    productName: p.name,
    productGmv: p.gmv,
    productOrders: p.orders,
    pctOfTotal: totalGmv > 0 ? (p.gmv / totalGmv) * 100 : 0,
    topCreators: pcRows
      .filter(r => r.product === p.name)
      .map(r => ({ name: r.name, gmv: num(r.gmv) }))
      .sort((a, b) => b.gmv - a.gmv)
      .slice(0, 3),
  }));

  // ── Highlight cards
  /**
   * 🚨 THIS MUST COME FROM THE MANAGED LIST, NOT THE STORE LIST.
   *
   * The drafted note renders it as "@x led THE ROSTER with $y", so sourcing it
   * from `top_creators` (every creator on the shop, managed or not) credits CC
   * with an unmanaged creator's work. Dr. Dent, week of 2026-08-23: the note
   * named @wealth.with.laura at $27,977, who is not on the roster at all, while
   * the creator table directly beneath it correctly topped out at @akwellness1
   * on $17,188. It read as CC either inflating its contribution or not knowing
   * its own roster.
   *
   * `managed_top_creators` is the same shape, already filtered on is_managed by
   * get_brand_client_report_agg, and is what the report's own leaderboard uses.
   */
  const managedTopRaw = ((agg.managed_top_creators ?? []) as AggLeaderCreator[]).map(c => ({
    name: c.name, gmv: num(c.gmv), orders: num(c.orders), videos: num(c.videos),
  }));
  /**
   * ⚠️ PREFER THE GRANULAR LIST, because that is the list the report's creator
   * table renders and the drafted note sits directly above it.
   *
   * The two disagree by channel, not by error: managed_top_creators sums
   * creator_performance (video + live + card) while granular sums the
   * video/product table. Dr. Dent's leader for 2026-08-23 is $17,224.75 the
   * first way and $17,188.39 the second, the $36.36 gap being her product-card
   * GMV. Both are right; only one is on the page under the note.
   *
   * Falls back to the aggregate list when granular is absent, which is every
   * report predating migration 152.
   */
  const granTop = granular?.creators?.find(c => c.gmv > 0) ?? null;
  const topCreator = granTop
    ? {
        name: granTop.handle ?? granTop.name,
        gmv: granTop.gmv,
        orders: granTop.orders,
        videos: granTop.postsPublished,
      }
    : managedTopRaw[0]
      ? { name: managedTopRaw[0].name, gmv: managedTopRaw[0].gmv, orders: managedTopRaw[0].orders, videos: managedTopRaw[0].videos }
      : null;
  const topVideo = topVideos[0] ?? null;
  const peakDay = dailyPerformance.find(d => d.isPeak);
  const bestDay = peakDay
    ? { date: peakDay.date, weekday: peakDay.weekday, gmv: peakDay.gmv, orders: peakDay.orders, creators: peakDay.creators }
    : null;

  // ── Creators Corner (managed) contribution detail
  const ccCommission = managedCommission;
  // Same source as topCreator above, with the share added.
  const ccTopCreators = managedTopRaw.map(c => ({
    ...c,
    pctOfManaged: managedGmv > 0 ? (c.gmv / managedGmv) * 100 : 0,
  }));
  const ccTopVideos = ((agg.managed_top_videos ?? []) as AggLeaderVideo[]).map(mapVideo);

  const creatorsCorner = {
    gmv: managedGmv,
    orders: managedOrders,
    creatorCount: managedCreatorCount,
    videos: num(m.videos),
    commission: ccCommission > 0 ? ccCommission : managedGmv * 0.20,
    pctOfStoreGmv: managedPct,
    priorGmv: priorManagedGmv,
    priorOrders: priorManagedOrders,
    priorCreatorCount: priorManagedCreators,
    priorVideos: num(mp.videos),
    gmvChangePct: pctChange(managedGmv, priorManagedGmv),
    orderChangePct: pctChange(managedOrders, priorManagedOrders),
    videoChangePct: pctChange(num(m.videos), num(mp.videos)),
    creatorChangePct: pctChange(managedCreatorCount, priorManagedCreators),
    managedAov: managedOrders > 0 ? managedGmv / managedOrders : 0,
    organicAov: organicOrders > 0 ? organicGmv / organicOrders : 0,
    managedGmvPerCreator: managedCreatorCount > 0 ? managedGmv / managedCreatorCount : 0,
    organicGmvPerCreator: organicCreatorCount > 0 ? organicGmv / organicCreatorCount : 0,
    signedCreatorCount: num(agg.signed_creator_count),
    activeCreatorCount: managedCreatorCount,
    newlyActivatedCount: num(agg.newly_activated),
    topCreators: ccTopCreators,
    topVideos: ccTopVideos,
  };

  // Corrected grains (mig 153). Applied AFTER construction so the wrong values
  // above stay visible in one place next to the right ones, rather than being
  // silently swapped at each use site.
  //
  //   videos / priorVideos  video-grain distinct posts, not SUM(creator_performance.videos)
  //   signedCreatorCount    PEOPLE, not TikTok accounts
  //   activeCreatorCount    people who POSTED OR SOLD — the same definition the
  //                         creator table prints as "N posted or sold this
  //                         period", so the two cannot disagree
  if (counts) {
    creatorsCorner.videos = counts.rosterPosts;
    creatorsCorner.priorVideos = counts.rosterPostsPrior;
    creatorsCorner.videoChangePct = pctChange(counts.rosterPosts, counts.rosterPostsPrior);
    creatorsCorner.signedCreatorCount = counts.signedPeople;
    creatorsCorner.activeCreatorCount = counts.activePeople;
    creatorsCorner.priorCreatorCount = counts.activePeoplePrior;
    creatorsCorner.creatorChangePct = pctChange(counts.activePeople, counts.activePeoplePrior);
    creatorsCorner.newlyActivatedCount = counts.newlyActivePeople;
  }

  /**
   * Activity, POSTED and SOLD kept apart (migration 165).
   *
   * Built only when the RPC actually returned the new keys. A frozen snapshot
   * replaying an older shape yields undefined, and the renderer must show the
   * section as absent rather than print zeros — "0 creators posted" is a
   * factual claim and it would be false.
   */
  const activity = counts && counts.rosterPosted !== undefined
    ? {
        rosterPosted:        num(counts.rosterPosted),
        rosterPostedPrior:   num(counts.rosterPostedPrior),
        rosterSold:          num(counts.rosterSold),
        rosterSoldNotPosted: num(counts.rosterSoldNotPosted),
        rosterDeparted:      num(counts.rosterDeparted),
        storeCreatorsPosted: num(counts.storeCreatorsPosted),
        storeCreatorsSold:   num(counts.storeCreatorsSold),
      }
    : undefined;

  const ch = split?.channels;
  const channels = ch
    ? {
        rosterVideoGmv: num(ch.rosterVideoGmv), rosterLiveGmv: num(ch.rosterLiveGmv),
        rosterCardGmv:  num(ch.rosterCardGmv),  rosterLiveStreams: num(ch.rosterLiveStreams),
        storeVideoGmv:  num(ch.storeVideoGmv),  storeLiveGmv:  num(ch.storeLiveGmv),
        storeCardGmv:   num(ch.storeCardGmv),   storeLiveStreams:  num(ch.storeLiveStreams),
      }
    : undefined;

  const topLive = Array.isArray(split?.top_live) && split.top_live.length > 0
    ? split.top_live.map((l) => ({
        handle: String(l.handle ?? ''),
        liveGmv: num(l.liveGmv),
        lives: num(l.lives),
      }))
    : undefined;

  /**
   * Retainer vs affiliate-only. No extra query: `granular.creators` already
   * carries isAffiliate and gmv for EVERY signed creator, at zero included.
   *
   * Creator counts here are "how many EARNED", not how many are signed —
   * granular.roster.onRetainer / affiliateOnly hold the signed totals.
   */
  const agreementSplit = granular
    ? (() => {
        let retainerGmv = 0, affiliateGmv = 0, retainerCreators = 0, affiliateCreators = 0;
        for (const c of granular.creators) {
          if (c.isAffiliate) {
            affiliateGmv += num(c.gmv);
            if (num(c.gmv) > 0) affiliateCreators++;
          } else {
            retainerGmv += num(c.gmv);
            if (num(c.gmv) > 0) retainerCreators++;
          }
        }
        return {
          retainerGmv, affiliateGmv, retainerCreators, affiliateCreators,
          unattributedGmv: managedGmv - retainerGmv - affiliateGmv,
        };
      })()
    : undefined;

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

    managed: { gmv: managedGmv, creatorCount: managedCreatorCount, orders: managedOrders },
    organic: { gmv: organicGmv, creatorCount: organicCreatorCount, orders: organicOrders },
    managedPct,
    creatorsCorner,

    newCreators: { count: num(nvr.new_count), gmv: num(nvr.new_gmv) },
    returningCreators: { count: num(nvr.returning_count), gmv: num(nvr.returning_gmv) },

    dayOfWeek,
    dailyPerformance,

    topCreators,
    topVideos,
    topProducts,
    // Corrected at the point of return so every consumer — page, PDF and the
    // frozen snapshot — gets the same figure. See `counts` above.
    ...(counts
      ? {
          totalVideos: counts.storePosts,
          priorTotalVideos: counts.storePostsPrior,
          videoChangePct: pctChange(counts.storePosts, counts.storePostsPrior),
        }
      : {}),
    granular,
    signings:
      !signingsRes.error && signingsRes.data
        ? (signingsRes.data as BrandClientReportData['signings'])
        : undefined,
    /**
     * Absent when the window already IS a whole month, when the RPC failed, or
     * when the month has produced nothing. Every consumer must treat it as
     * optional: frozen snapshots taken before this shipped will not have it.
     */
    monthToDate:
      !mtdRes.error && mtdRes.data
        ? {
            start: monthStart,
            end: endDate,
            daysElapsed: endDate.getUTCDate(),
            daysInMonth,
            granular: mtdRes.data as NonNullable<BrandClientReportData['granular']>,
          }
        : undefined,
    activity,
    channels,
    topLive,
    agreementSplit,
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
    // "creators" here is creators who SOLD (mig 166 filters the count to
    // gmv > 0). Posting counts live on the report itself.
    `• ${data.totalVideos} posts · ${data.activeCreators} creators sold · ` +
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
