/**
 * Renewals data fetcher.
 *
 * Powers the Renewals tab on /roster. For each active retainer creator,
 * computes ROI over their current contract period and categorizes them as
 * Cut / Watch / Keep / Star — the same buckets the old dashboard's Decisions
 * page used.
 *
 * Categorization rules (unchanged from old dash):
 *   ROI < 1x   → Cut    (losing money)
 *   ROI 1-3x   → Watch  (monitor closely)
 *   ROI 3x+    → Keep
 *   ROI 10x+   → Keep + Star
 *
 * Contract period:
 *   Post-based (not date-based). Each creator has a contract_length_days
 *   (default 30) and a monthly_post_requirement. We sum GMV + post count
 *   from creator_performance over that contract window. Trend = same
 *   metric for the immediately-prior equal-length period.
 *
 * Brand filter: applies to managed_creators.brand (slug)
 * Product filter: only includes creators whose product_retainers JSON has
 *   the selected product key. When a product is selected, retainer used
 *   for ROI is the product-specific retainer (not the total).
 */
import { createAdminClient } from '@/lib/supabase/server';

export type RenewalCategory = 'cut' | 'watch' | 'keep';
export type PaceStatus = 'ahead' | 'on-track' | 'slow' | 'behind';

export interface RenewalCreator {
  id: number;
  realName: string | null;
  discordName: string | null;
  discordId: string | null;
  discordAvatar: string | null;
  handle: string;                  // primary tiktok handle (account_1)
  brand: string;                   // brand slug
  retainer: number;
  gmv: number;
  gmvPrev: number;
  roi: number;
  roiPrev: number;
  roiTrend: 'up' | 'down' | 'stable';
  category: RenewalCategory;
  isStar: boolean;                 // ROI >= 10x
  // Contract period info
  hasStartDate: boolean;
  contractLengthDays: number;
  dayNumber: number;               // 1-indexed days into contract
  // Post tracking
  postsCompleted: number;
  postsRequired: number;
  postProgress: number;            // 0-100
  isComplete: boolean;
  expectedPosts: number;
  postsDelta: number;              // actual - expected
  paceStatus: PaceStatus;
}

export interface RenewalsResult {
  cut: RenewalCreator[];
  watch: RenewalCreator[];
  keep: RenewalCreator[];          // includes stars
  totals: {
    cutCount: number;
    watchCount: number;
    keepCount: number;
    starCount: number;
    monthlyAtRisk: number;         // sum of retainers for cut bucket
    monthlyTotal: number;          // total monthly retainer across all retainer creators
  };
}

interface ManagedCreatorRow {
  id: number;
  real_name: string | null;
  discord_name: string | null;
  discord_id: string | null;
  discord_user_id: string | null;
  discord_avatar: string | null;
  brand: string;
  status: string | null;
  retainer: number | string | null;
  account_1: string | null;
  account_2: string | null;
  account_3: string | null;
  account_4: string | null;
  account_5: string | null;
  contract_length_days: number | null;
  monthly_post_requirement: number | null;
  retainer_start_date: string | null;
  product_retainers: Record<string, number> | null;
}

interface PerfRow {
  creator_name: string;
  brand: string;
  report_date: string;
  gmv: number | string;
  videos: number | string;
}

function pNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isNaN(n) ? 0 : n;
}
function pInt(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? Math.round(v) : parseInt(String(v), 10);
  return Number.isNaN(n) ? 0 : n;
}

function localDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

/**
 * Compute the creator's current contract period.
 * If no retainer_start_date is set, fall back to a rolling N-day window.
 */
function getContractPeriod(retainerStartDate: string | null, contractLengthDays: number) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const lengthDays = contractLengthDays || 30;

  if (!retainerStartDate) {
    const start = new Date(today);
    start.setUTCDate(today.getUTCDate() - (lengthDays - 1));
    return { start, dayNumber: lengthDays, contractLengthDays: lengthDays, hasStartDate: false };
  }

  const startDate = new Date(retainerStartDate + 'T00:00:00Z');
  startDate.setUTCHours(0, 0, 0, 0);
  const dayNumber = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return { start: startDate, dayNumber, contractLengthDays: lengthDays, hasStartDate: true };
}

/** Compute pace based on actual vs expected posts at the current day. */
function getPostProgress(postsActual: number, postReq: number, dayNumber: number, contractLengthDays: number) {
  const isComplete = postsActual >= postReq;
  const progressPercent = Math.min(100, Math.round((postsActual / Math.max(1, postReq)) * 100));

  // Expected by current day if perfectly paced
  const expectedPosts = Math.round((Math.max(1, dayNumber) / Math.max(1, contractLengthDays)) * postReq);
  const postsDelta = postsActual - expectedPosts;

  let paceStatus: PaceStatus = 'on-track';
  if (postsDelta <= -5)      paceStatus = 'behind';
  else if (postsDelta <= -2) paceStatus = 'slow';
  else if (postsDelta >= 5)  paceStatus = 'ahead';

  return { progressPercent, expectedPosts, postsDelta, paceStatus, isComplete };
}

/** True if this creator has any retainer obligation (base or product-specific). */
function hasAnyRetainer(c: ManagedCreatorRow): boolean {
  if (pNum(c.retainer) > 0) return true;
  const pr = c.product_retainers ?? {};
  return Object.values(pr).some(v => pNum(v) > 0);
}

function getTotalRetainer(c: ManagedCreatorRow): number {
  let total = pNum(c.retainer);
  const pr = c.product_retainers ?? {};
  for (const v of Object.values(pr)) total += pNum(v);
  return total;
}

// ── Main fetcher ───────────────────────────────────────────────────

export async function getRenewals(opts: {
  brand?: string | null;
  product?: string | null;
}): Promise<RenewalsResult> {
  const supabase = await createAdminClient();
  const brandFilter = opts.brand && opts.brand !== 'all' ? opts.brand : null;
  const productFilter = opts.product && opts.product !== 'all' ? opts.product : null;

  // 1. Pull active retainer creators
  let q = supabase
    .from('managed_creators')
    .select('id, real_name, discord_name, discord_id, discord_user_id, discord_avatar, brand, status, retainer, account_1, account_2, account_3, account_4, account_5, contract_length_days, monthly_post_requirement, retainer_start_date, product_retainers')
    .eq('status', 'Active');
  if (brandFilter) q = q.eq('brand', brandFilter);
  const { data: rawCreators, error: cErr } = await q;
  if (cErr) throw cErr;

  let creators = (rawCreators as ManagedCreatorRow[] | null ?? []).filter(hasAnyRetainer);
  // Product filter: only creators with this product key in product_retainers
  if (productFilter) {
    creators = creators.filter(c => productFilter in (c.product_retainers ?? {}));
  }

  if (creators.length === 0) {
    return {
      cut: [], watch: [], keep: [],
      totals: { cutCount: 0, watchCount: 0, keepCount: 0, starCount: 0, monthlyAtRisk: 0, monthlyTotal: 0 },
    };
  }

  // 2. Pull 60 days of creator_performance (covers current + prior contract periods)
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const sixtyAgo = new Date(today);
  sixtyAgo.setUTCDate(today.getUTCDate() - 60);

  let perfQuery = supabase
    .from('creator_performance')
    .select('creator_name, brand, gmv, videos, report_date')
    .eq('period_type', 'daily')
    .gte('report_date', localDateStr(sixtyAgo))
    .lte('report_date', localDateStr(today))
    .limit(50000);
  if (brandFilter) perfQuery = perfQuery.eq('brand', brandFilter);
  const { data: perfData, error: pErr } = await perfQuery;
  if (pErr) throw pErr;

  // Index perf by (creator_handle|brand|date)
  const perfIdx = new Map<string, { gmv: number; videos: number }>();
  for (const row of (perfData as PerfRow[] | null ?? [])) {
    const handle = (row.creator_name || '').toLowerCase();
    const k = `${handle}|${row.brand}|${row.report_date}`;
    const cur = perfIdx.get(k) ?? { gmv: 0, videos: 0 };
    cur.gmv    += pNum(row.gmv);
    cur.videos += pInt(row.videos);
    perfIdx.set(k, cur);
  }

  // 3. For each creator, compute renewal stats
  const results: RenewalCreator[] = [];
  let monthlyTotal = 0;

  for (const c of creators) {
    const accounts = [c.account_1, c.account_2, c.account_3, c.account_4, c.account_5]
      .filter((a): a is string => Boolean(a && a.trim()))
      .map(a => a.toLowerCase().replace(/^@/, ''));
    const contractLength = c.contract_length_days ?? 30;
    const period = getContractPeriod(c.retainer_start_date, contractLength);

    // Prior period = same length, immediately preceding
    const prevEnd = new Date(period.start);
    prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setUTCDate(prevStart.getUTCDate() - (contractLength - 1));

    let gmvPeriod = 0, gmvPrev = 0, postsPeriod = 0;

    for (const acc of accounts) {
      // Current period
      const dCur = new Date(period.start);
      while (dCur <= today) {
        const dStr = localDateStr(dCur);
        const k = `${acc}|${c.brand}|${dStr}`;
        const v = perfIdx.get(k);
        if (v) { gmvPeriod += v.gmv; postsPeriod += v.videos; }
        dCur.setUTCDate(dCur.getUTCDate() + 1);
      }
      // Prior period
      const dPrev = new Date(prevStart);
      while (dPrev <= prevEnd) {
        const dStr = localDateStr(dPrev);
        const k = `${acc}|${c.brand}|${dStr}`;
        const v = perfIdx.get(k);
        if (v) gmvPrev += v.gmv;
        dPrev.setUTCDate(dPrev.getUTCDate() + 1);
      }
    }

    // Effective retainer = product-specific (if product filter active) or total
    let retainer = getTotalRetainer(c);
    if (productFilter) {
      const productR = pNum((c.product_retainers ?? {})[productFilter]);
      if (productR > 0) retainer = productR;
    }
    monthlyTotal += retainer;

    const roi = retainer > 0 ? gmvPeriod / retainer : 0;
    const roiPrev = retainer > 0 ? gmvPrev / retainer : 0;
    let roiTrend: 'up' | 'down' | 'stable' = 'stable';
    if (roiPrev > 0) {
      const change = ((roi - roiPrev) / roiPrev) * 100;
      if (change > 10) roiTrend = 'up';
      else if (change < -10) roiTrend = 'down';
    } else if (roi > 0) {
      roiTrend = 'up'; // came from zero
    }

    let category: RenewalCategory = 'keep';
    let isStar = false;
    if (roi < 1)        category = 'cut';
    else if (roi < 3)   category = 'watch';
    else                { category = 'keep'; isStar = roi >= 10; }

    const postReq = c.monthly_post_requirement ?? 30;
    const post = getPostProgress(postsPeriod, postReq, period.dayNumber, period.contractLengthDays);

    results.push({
      id: c.id,
      realName: c.real_name,
      discordName: c.discord_name,
      discordId: c.discord_id ?? c.discord_user_id ?? null,
      discordAvatar: c.discord_avatar,
      handle: c.account_1 ?? c.real_name ?? `creator_${c.id}`,
      brand: c.brand,
      retainer,
      gmv: gmvPeriod,
      gmvPrev,
      roi,
      roiPrev,
      roiTrend,
      category,
      isStar,
      hasStartDate: period.hasStartDate,
      contractLengthDays: period.contractLengthDays,
      dayNumber: period.dayNumber,
      postsCompleted: postsPeriod,
      postsRequired: postReq,
      postProgress: post.progressPercent,
      isComplete: post.isComplete,
      expectedPosts: post.expectedPosts,
      postsDelta: post.postsDelta,
      paceStatus: post.paceStatus,
    });
  }

  // 4. Categorize and sort each bucket
  const cut   = results.filter(r => r.category === 'cut').sort((a, b) => b.retainer - a.retainer);   // by retainer desc — biggest losses first
  const watch = results.filter(r => r.category === 'watch').sort((a, b) => a.roi - b.roi);            // by ROI asc — most concerning first
  const keep  = results.filter(r => r.category === 'keep').sort((a, b) => b.roi - a.roi);             // by ROI desc — best first

  const monthlyAtRisk = cut.reduce((s, c) => s + c.retainer, 0);

  return {
    cut, watch, keep,
    totals: {
      cutCount: cut.length,
      watchCount: watch.length,
      keepCount: keep.length,
      starCount: keep.filter(c => c.isStar).length,
      monthlyAtRisk,
      monthlyTotal,
    },
  };
}
