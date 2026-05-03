/**
 * Data fetcher for the brand portal /brand-dashboard page.
 *
 * Scope is intentionally narrow per Tyler's spec: clients should see only
 * their managed creators, those creators' performance, and their videos.
 * No system-wide aggregates, no AI analysis — that lives on the agency
 * (admin) side.
 *
 * Source-of-truth is the legacy `managed_creators` table (one row per
 * managed person, with up to 10 TikTok handles in account_1..account_10).
 * The v2 `creator_brands` junction wasn't fully backfilled, so it
 * undercounts (e.g. catakor: 108 handles in v2 vs 350 in legacy).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type BrandPortalPeriod = '7d' | '30d' | 'this_month' | 'last_month';

export const PERIOD_LABELS: Record<BrandPortalPeriod, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  this_month: 'This month',
  last_month: 'Last month',
};

export interface BrandRosterCreator {
  managedId: number;
  realName: string | null;
  primaryHandle: string;
  handles: string[];
  retainer: number;
  monthlyPostRequirement: number | null;
  currentTier: string | null;
  lifetimeGmv: number;
  /** Stats over the selected period. */
  gmv: number;
  orders: number;
  posts: number;
  /** Rolling 30-day GMV — used for ROI calc regardless of selected period. */
  gmv30d: number;
}

export interface BrandRosterVideo {
  videoId: string;
  title: string;
  url: string | null;
  creatorHandle: string;
  postDate: Date | null;
  /** Cumulative (lifetime) GMV across all daily rows for this video. */
  gmv: number;
  /** Cumulative (lifetime) orders. */
  orders: number;
  /** GMV during the selected period only. */
  periodGmv: number;
  /** Orders during the selected period only. */
  periodOrders: number;
}

export interface BrandPortalDashboard {
  brandSlug: string;
  brandName: string;

  startDate: Date;
  endDate: Date;
  periodLabel: string;
  periodLengthDays: number;

  managedCount: number;
  totalGmv: number;
  totalPosts: number;

  priorTotalGmv: number;
  priorTotalPosts: number;
  gmvChangePct: number | null;
  postsChangePct: number | null;

  /** Daily series for the *current* period — has entries only for days
   * with data (not zero-filled). Use `priorPoints` for prior comparison. */
  dailyPerformance: { date: Date; gmv: number; posts: number }[];
  /** Prior-period daily GMV, parallel to dailyPerformance.
   * `gmv` is null when that prior day has no data row (gap). */
  priorPoints: { priorDate: Date; gmv: number | null }[];
  creators: BrandRosterCreator[];
  videos: BrandRosterVideo[];
}

const ACCOUNT_COLS = [
  'account_1', 'account_2', 'account_3', 'account_4', 'account_5',
  'account_6', 'account_7', 'account_8', 'account_9', 'account_10',
] as const;

function fmt(d: Date): string {
  return d.toISOString().split('T')[0];
}

function pctChange(curr: number, prior: number): number | null {
  if (prior === 0) return curr > 0 ? null : 0;
  return ((curr - prior) / prior) * 100;
}

function normHandle(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace('@', '').trim();
}

export async function getBrandPortalDashboard(
  supabase: SupabaseClient,
  brandUuid: string,
  brandSlug: string,
  brandName: string,
  period: BrandPortalPeriod = '7d',
): Promise<BrandPortalDashboard> {
  // ── Resolve the period window
  const { data: anchorRow } = await supabase
    .from('daily_creator_stats')
    .select('report_date')
    .eq('brand_id', brandUuid)
    .order('report_date', { ascending: false })
    .limit(1);

  const endDate = anchorRow?.[0]?.report_date
    ? new Date(`${anchorRow[0].report_date}T12:00:00Z`)
    : new Date();

  // Resolve start/end + prior comparison window for the requested period.
  // For calendar-based periods (this_month, last_month) the prior window is
  // the calendar month before; for trailing windows (7d/30d) it's the same-
  // length window immediately before the start.
  let actualEndDate = endDate;
  let startDate: Date;
  let periodLengthDays: number;
  let priorStart: Date;
  let priorEnd: Date;

  if (period === 'this_month') {
    startDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1, 12));
    periodLengthDays =
      Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
    // Prior = same number of days into the previous month, for a like-for-like comparison
    priorStart = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() - 1, 1, 12));
    priorEnd = new Date(priorStart);
    priorEnd.setUTCDate(priorStart.getUTCDate() + (periodLengthDays - 1));
  } else if (period === 'last_month') {
    // Anchor to the last day of the previous month (relative to the latest data day)
    actualEndDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 0, 12));
    startDate = new Date(Date.UTC(actualEndDate.getUTCFullYear(), actualEndDate.getUTCMonth(), 1, 12));
    priorEnd = new Date(Date.UTC(actualEndDate.getUTCFullYear(), actualEndDate.getUTCMonth(), 0, 12));
    priorStart = new Date(Date.UTC(priorEnd.getUTCFullYear(), priorEnd.getUTCMonth(), 1, 12));
    periodLengthDays =
      Math.round((actualEndDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  } else {
    periodLengthDays = period === '30d' ? 30 : 7;
    startDate = new Date(endDate);
    startDate.setUTCDate(endDate.getUTCDate() - (periodLengthDays - 1));
    priorEnd = new Date(startDate);
    priorEnd.setUTCDate(startDate.getUTCDate() - 1);
    priorStart = new Date(priorEnd);
    priorStart.setUTCDate(priorEnd.getUTCDate() - (periodLengthDays - 1));
  }

  // ── 1. Managed roster (legacy table — source of truth)
  const accountSelect = ACCOUNT_COLS.join(', ');
  const { data: managedRows } = await supabase
    .from('managed_creators')
    .select(
      `id, real_name, retainer, monthly_post_requirement, current_tier, lifetime_gmv, ${accountSelect}`,
    )
    .eq('brand', brandSlug)
    .eq('employment_status', 'active')
    .range(0, 9999);

  type ManagedRow = {
    id: number;
    real_name: string | null;
    retainer: number | string | null;
    monthly_post_requirement: number | null;
    current_tier: string | null;
    lifetime_gmv: number | string | null;
  } & { [K in (typeof ACCOUNT_COLS)[number]]: string | null };

  const roster = ((managedRows ?? []) as unknown as ManagedRow[]).map((r) => {
    const handles: string[] = [];
    for (const col of ACCOUNT_COLS) {
      const h = normHandle(r[col]);
      if (h) handles.push(h);
    }
    return {
      managedId: r.id,
      realName: r.real_name,
      retainer: Number(r.retainer ?? 0),
      monthlyPostRequirement: r.monthly_post_requirement,
      currentTier: r.current_tier,
      lifetimeGmv: Number(r.lifetime_gmv ?? 0),
      handles,
    };
  });

  // Map every handle back to a single managed row (in handle-ownership order:
  // a handle listed for multiple creators belongs to the FIRST one we see).
  const handleToManaged = new Map<string, number>();
  for (const r of roster) {
    for (const h of r.handles) {
      if (!handleToManaged.has(h)) handleToManaged.set(h, r.managedId);
    }
  }
  const allHandles = [...handleToManaged.keys()];

  if (allHandles.length === 0) {
    return emptyDashboard(brandSlug, brandName, startDate, actualEndDate, periodLengthDays);
  }

  // ── 2. Period stats + prior + recent videos + 30d snapshot in parallel
  const startStr = fmt(startDate);
  const endStr = fmt(actualEndDate);
  const priorStartStr = fmt(priorStart);
  const priorEndStr = fmt(priorEnd);
  // Fixed 30-day window anchored to the latest data day, used for ROI per creator
  const trailing30Start = new Date(endDate);
  trailing30Start.setUTCDate(endDate.getUTCDate() - 29);
  const trailing30StartStr = fmt(trailing30Start);
  const trailing30EndStr = fmt(endDate);

  const [statsCur, statsPrev, videoRows, stats30d] = await Promise.all([
    supabase
      .from('daily_creator_stats')
      .select('tiktok_username, gmv, orders, videos, report_date')
      .eq('brand_id', brandUuid)
      .gte('report_date', startStr)
      .lte('report_date', endStr)
      .in('tiktok_username', allHandles)
      .range(0, 9999),
    supabase
      .from('daily_creator_stats')
      .select('tiktok_username, gmv, videos, report_date')
      .eq('brand_id', brandUuid)
      .gte('report_date', priorStartStr)
      .lte('report_date', priorEndStr)
      .in('tiktok_username', allHandles)
      .range(0, 9999),
    // Cumulative GMV per video — uses an RPC to aggregate at the DB layer
    // (otherwise we'd have to pull 10k+ raw rows). Returns videos with at
    // least one report row in the period; total_gmv is lifetime.
    supabase.rpc('brand_portal_videos', {
      p_brand_id: brandUuid,
      p_handles: allHandles,
      p_start_date: startStr,
      p_end_date: endStr,
    }),
    // Trailing 30-day GMV per handle (for ROI column on creator roster).
    supabase
      .from('daily_creator_stats')
      .select('tiktok_username, gmv')
      .eq('brand_id', brandUuid)
      .gte('report_date', trailing30StartStr)
      .lte('report_date', trailing30EndStr)
      .in('tiktok_username', allHandles)
      .range(0, 9999),
  ]);

  // ── 3. Aggregate per-managed-creator stats
  // Trailing-30d GMV per managed creator (for ROI column)
  const gmv30dByManaged = new Map<number, number>();
  for (const r of (stats30d.data ?? []) as any[]) {
    const handle = normHandle(r.tiktok_username);
    const id = handleToManaged.get(handle);
    if (id == null) continue;
    gmv30dByManaged.set(id, (gmv30dByManaged.get(id) ?? 0) + Number(r.gmv ?? 0));
  }

  const perManaged = new Map<number, { gmv: number; orders: number; posts: number }>();
  const dailyMap = new Map<string, { gmv: number; posts: number }>();
  for (const r of (statsCur.data ?? []) as any[]) {
    const handle = normHandle(r.tiktok_username);
    const id = handleToManaged.get(handle);
    if (id == null) continue;
    if (!perManaged.has(id)) perManaged.set(id, { gmv: 0, orders: 0, posts: 0 });
    const p = perManaged.get(id)!;
    p.gmv += Number(r.gmv ?? 0);
    p.orders += Number(r.orders ?? 0);
    p.posts += Number(r.videos ?? 0);
    const d = r.report_date as string;
    if (!dailyMap.has(d)) dailyMap.set(d, { gmv: 0, posts: 0 });
    const day = dailyMap.get(d)!;
    day.gmv += Number(r.gmv ?? 0);
    day.posts += Number(r.videos ?? 0);
  }

  let totalGmv = 0;
  let totalPosts = 0;
  for (const v of perManaged.values()) {
    totalGmv += v.gmv;
    totalPosts += v.posts;
  }

  // Prior period — totals + per-date map (so we can build a parallel series
  // aligned to the current period's actual data dates, with `null` for days
  // that have no prior-period row at all).
  let priorTotalGmv = 0;
  let priorTotalPosts = 0;
  const priorByDate = new Map<string, number>();
  for (const r of (statsPrev.data ?? []) as any[]) {
    const handle = normHandle(r.tiktok_username);
    if (!handleToManaged.has(handle)) continue;
    const gmv = Number(r.gmv ?? 0);
    priorTotalGmv += gmv;
    priorTotalPosts += Number(r.videos ?? 0);
    const d = r.report_date as string | undefined;
    if (d) priorByDate.set(d, (priorByDate.get(d) ?? 0) + gmv);
  }

  // Daily trend (current period — only days with data)
  const dailyPerformance = [...dailyMap.entries()]
    .map(([d, m]) => ({ date: new Date(`${d}T12:00:00Z`), gmv: m.gmv, posts: m.posts }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Prior series — parallel to dailyPerformance. For each current date, find
  // the corresponding prior date (period_length days earlier) and look up its
  // GMV. Missing prior rows → null so the chart shows a gap rather than 0.
  const priorPoints = dailyPerformance.map(({ date }) => {
    const priorDate = new Date(date);
    priorDate.setUTCDate(date.getUTCDate() - periodLengthDays);
    const key = fmt(priorDate);
    const gmv = priorByDate.has(key) ? priorByDate.get(key)! : null;
    return { priorDate, gmv };
  });

  // Videos — pre-aggregated by the brand_portal_videos RPC. Each row is
  // already a single video with cumulative + period GMV. No cap — the
  // page paginates client-side.
  const videos: BrandRosterVideo[] = ((videoRows.data ?? []) as any[]).map((r) => ({
    videoId: r.video_id,
    title: r.video_title || '(untitled)',
    url: r.video_url || null,
    creatorHandle: normHandle(r.tiktok_username),
    postDate: r.post_date ? new Date(r.post_date) : null,
    gmv: Number(r.total_gmv ?? 0),
    orders: Number(r.total_orders ?? 0),
    periodGmv: Number(r.period_gmv ?? 0),
    periodOrders: Number(r.period_orders ?? 0),
  }));

  // ── 4. Build the final creator rows
  const creators: BrandRosterCreator[] = roster
    .map((r) => {
      const stats = perManaged.get(r.managedId) ?? { gmv: 0, orders: 0, posts: 0 };
      return {
        managedId: r.managedId,
        realName: r.realName,
        primaryHandle: r.handles[0] ?? '',
        handles: r.handles,
        retainer: r.retainer,
        monthlyPostRequirement: r.monthlyPostRequirement,
        currentTier: r.currentTier,
        lifetimeGmv: r.lifetimeGmv,
        gmv30d: gmv30dByManaged.get(r.managedId) ?? 0,
        gmv: stats.gmv,
        orders: stats.orders,
        posts: stats.posts,
      };
    })
    .sort((a, b) => b.gmv - a.gmv);

  const periodLabel = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${actualEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${actualEndDate.getUTCFullYear()}`;

  return {
    brandSlug,
    brandName,
    startDate,
    endDate: actualEndDate,
    periodLabel,
    periodLengthDays,

    managedCount: roster.length,
    totalGmv,
    totalPosts,

    priorTotalGmv,
    priorTotalPosts,
    gmvChangePct: pctChange(totalGmv, priorTotalGmv),
    postsChangePct: pctChange(totalPosts, priorTotalPosts),

    dailyPerformance,
    priorPoints,
    creators,
    videos,
  };
}

function emptyDashboard(
  brandSlug: string,
  brandName: string,
  startDate: Date,
  endDate: Date,
  periodLengthDays: number,
): BrandPortalDashboard {
  const periodLabel = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${endDate.getUTCFullYear()}`;
  return {
    brandSlug,
    brandName,
    startDate,
    endDate,
    periodLabel,
    periodLengthDays,
    managedCount: 0,
    totalGmv: 0,
    totalPosts: 0,
    priorTotalGmv: 0,
    priorTotalPosts: 0,
    gmvChangePct: null,
    postsChangePct: null,
    dailyPerformance: [],
    priorPoints: [],
    creators: [],
    videos: [],
  };
}
