/**
 * Single-creator detail fetcher for the brand portal.
 *
 * Resolves the requested handle back to its managed_creators row (one row
 * per managed person, with up to 10 TikTok handles in account_1..account_10),
 * then aggregates that person's stats across all of their handles for this
 * brand over the selected period.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BrandPortalPeriod } from './brand-portal-overview';
import { getBrandRegistry, resolveUuids } from '@/lib/data/brand-registry';

export interface BrandCreatorDetail {
  managedId: number;
  realName: string | null;
  primaryHandle: string;
  handles: string[];
  retainer: number;
  monthlyPostRequirement: number | null;
  currentTier: string | null;

  /**
   * All-time GMV this creator has driven FOR THIS BRAND, and the first day we
   * have a record of. `null` when there are no rows at all — the caller must
   * render an em dash, never $0.
   *
   * Replaces managed_creators.lifetime_gmv, which is 0 on all 2,090 rows and
   * was printing "Lifetime GMV $0" to clients beside real period figures.
   * `since` exists because the record does not reach back indefinitely, so a
   * bare "lifetime" would overstate what we actually know.
   */
  brandLifetimeGmv: number | null;
  brandLifetimeSince: Date | null;

  startDate: Date;
  endDate: Date;
  periodLabel: string;
  periodLengthDays: number;

  totalGmv: number;
  totalOrders: number;

  /**
   * Posts PUBLISHED in the window — daily_creator_stats.videos is a per-day
   * count of posts that went up that day, verified against
   * daily_video_product_stats.post_date (both give 3 for @slavicnursingbabe
   * over Aug 1-7). Deliberately NOT the same as `videos.length` below.
   */
  totalPosts: number;

  priorTotalGmv: number;
  priorTotalPosts: number;
  gmvChangePct: number | null;
  postsChangePct: number | null;

  dailyPerformance: { date: Date; gmv: number; posts: number }[];
  /** Parallel-indexed to dailyPerformance. `gmv` is null for prior days with no data. */
  priorPoints: { priorDate: Date; gmv: number | null }[];

  /**
   * Posts that were EARNING in the window, which is a different question from
   * `totalPosts` and a much larger number: brand_portal_videos keys off a
   * daily_video_product_stats row in the window, so a post published months
   * ago that is still selling is in here. @slavicnursingbabe over Aug 1-7 is
   * 3 published against 45 earning. Label them apart on any surface that
   * shows both, or the page contradicts itself.
   */
  videos: {
    videoId: string;
    title: string;
    url: string | null;
    postDate: Date | null;
    gmv: number;
    orders: number;
  }[];
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

export async function getBrandCreatorDetail(
  supabase: SupabaseClient,
  brandUuid: string,
  brandSlug: string,
  handleParam: string,
  period: BrandPortalPeriod = '7d',
): Promise<BrandCreatorDetail | null> {
  const targetHandle = normHandle(handleParam);
  if (!targetHandle) return null;

  // Umbrella-aware brand resolution (see brand-portal-overview for rationale).
  // 'leefar' → both store UUIDs; normal brand → its single UUID.
  const reg = await getBrandRegistry();
  const brandIds = resolveUuids(reg, brandSlug, brandUuid) ?? [];

  // 1. Find the managed_creators row that owns this handle on this brand.
  // Each row has up to 10 handles; we OR-match across all account_N columns.
  const accountSelect = ACCOUNT_COLS.join(', ');
  const orFilter = ACCOUNT_COLS.map((c) => `${c}.ilike.%${targetHandle}%`).join(',');

  const { data: matches } = await supabase
    .from('managed_creators')
    .select(
      `id, real_name, retainer, monthly_post_requirement, current_tier, ${accountSelect}`,
    )
    .eq('brand', brandSlug)
    .or(orFilter)
    .limit(5);

  type ManagedRow = {
    id: number;
    real_name: string | null;
    retainer: number | string | null;
    monthly_post_requirement: number | null;
    current_tier: string | null;
  } & { [K in (typeof ACCOUNT_COLS)[number]]: string | null };

  const rows = (matches ?? []) as unknown as ManagedRow[];
  // Pick the first row whose handles include our target exactly
  const owner = rows.find((r) =>
    ACCOUNT_COLS.some((col) => normHandle(r[col]) === targetHandle),
  );
  if (!owner) return null;

  const handles: string[] = [];
  for (const col of ACCOUNT_COLS) {
    const h = normHandle(owner[col]);
    if (h) handles.push(h);
  }

  // 2. Resolve period window
  const { data: anchorRow } = await supabase
    .from('daily_creator_stats')
    .select('report_date')
    .in('brand_id', brandIds)
    .order('report_date', { ascending: false })
    .limit(1);

  const endDateAnchor = anchorRow?.[0]?.report_date
    ? new Date(`${anchorRow[0].report_date}T12:00:00Z`)
    : new Date();

  let actualEndDate = endDateAnchor;
  let startDate: Date;
  let periodLengthDays: number;
  let priorStart: Date;
  let priorEnd: Date;

  if (period === 'this_month') {
    startDate = new Date(Date.UTC(endDateAnchor.getUTCFullYear(), endDateAnchor.getUTCMonth(), 1, 12));
    periodLengthDays =
      Math.round((endDateAnchor.getTime() - startDate.getTime()) / 86_400_000) + 1;
    priorStart = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() - 1, 1, 12));
    priorEnd = new Date(priorStart);
    priorEnd.setUTCDate(priorStart.getUTCDate() + (periodLengthDays - 1));
  } else if (period === 'last_month') {
    actualEndDate = new Date(
      Date.UTC(endDateAnchor.getUTCFullYear(), endDateAnchor.getUTCMonth(), 0, 12),
    );
    startDate = new Date(
      Date.UTC(actualEndDate.getUTCFullYear(), actualEndDate.getUTCMonth(), 1, 12),
    );
    priorEnd = new Date(
      Date.UTC(actualEndDate.getUTCFullYear(), actualEndDate.getUTCMonth(), 0, 12),
    );
    priorStart = new Date(Date.UTC(priorEnd.getUTCFullYear(), priorEnd.getUTCMonth(), 1, 12));
    periodLengthDays =
      Math.round((actualEndDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  } else {
    periodLengthDays = period === '30d' ? 30 : 7;
    startDate = new Date(endDateAnchor);
    startDate.setUTCDate(endDateAnchor.getUTCDate() - (periodLengthDays - 1));
    priorEnd = new Date(startDate);
    priorEnd.setUTCDate(startDate.getUTCDate() - 1);
    priorStart = new Date(priorEnd);
    priorStart.setUTCDate(priorEnd.getUTCDate() - (periodLengthDays - 1));
  }

  const startStr = fmt(startDate);
  const endStr = fmt(actualEndDate);
  const priorStartStr = fmt(priorStart);
  const priorEndStr = fmt(priorEnd);

  // 3. Pull per-handle stats + videos in parallel
  const [statsCur, statsPrev, videoRows, lifetimeRow] = await Promise.all([
    supabase
      .from('daily_creator_stats')
      .select('gmv, orders, videos, report_date')
      .in('brand_id', brandIds)
      .gte('report_date', startStr)
      .lte('report_date', endStr)
      .in('tiktok_username', handles)
      .range(0, 9999),
    supabase
      .from('daily_creator_stats')
      .select('gmv, videos, report_date')
      .in('brand_id', brandIds)
      .gte('report_date', priorStartStr)
      .lte('report_date', priorEndStr)
      .in('tiktok_username', handles)
      .range(0, 9999),
    // Per-video aggregates via RPC (same as the Videos page)
    supabase.rpc('brand_portal_videos', {
      p_brand_ids: brandIds,
      p_handles: handles,
      p_start_date: startStr,
      p_end_date: endStr,
      p_prior_start: priorStartStr,
      p_prior_end: priorEndStr,
    }),
    // All-time, brand-scoped. SUMmed in the database (mig 147) rather than
    // pulled and added here: this read has no date bound, and an unbounded
    // .select() is exactly the shape that silently truncates at 1,000 rows.
    supabase.rpc('get_brand_creator_lifetime_gmv', {
      p_brand_ids: brandIds,
      p_handles: handles,
    }),
  ]);

  // Aggregate current period
  let totalGmv = 0;
  let totalOrders = 0;
  let totalPosts = 0;
  const dailyMap = new Map<string, { gmv: number; posts: number }>();
  for (const r of (statsCur.data ?? []) as any[]) {
    const gmv = Number(r.gmv ?? 0);
    const orders = Number(r.orders ?? 0);
    const posts = Number(r.videos ?? 0);
    totalGmv += gmv;
    totalOrders += orders;
    totalPosts += posts;
    const d = r.report_date as string;
    if (!dailyMap.has(d)) dailyMap.set(d, { gmv: 0, posts: 0 });
    const day = dailyMap.get(d)!;
    day.gmv += gmv;
    day.posts += posts;
  }
  const dailyPerformance = [...dailyMap.entries()]
    .map(([d, m]) => ({ date: new Date(`${d}T12:00:00Z`), gmv: m.gmv, posts: m.posts }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Aggregate prior period — totals + per-date map for the parallel series
  let priorTotalGmv = 0;
  let priorTotalPosts = 0;
  const priorByDate = new Map<string, number>();
  for (const r of (statsPrev.data ?? []) as any[]) {
    const gmv = Number(r.gmv ?? 0);
    priorTotalGmv += gmv;
    priorTotalPosts += Number(r.videos ?? 0);
    const d = r.report_date as string | undefined;
    if (d) priorByDate.set(d, (priorByDate.get(d) ?? 0) + gmv);
  }

  // Parallel-indexed prior series, null for missing days
  const priorPoints = dailyPerformance.map(({ date }) => {
    const priorDate = new Date(date);
    priorDate.setUTCDate(date.getUTCDate() - periodLengthDays);
    const key = priorDate.toISOString().split('T')[0];
    const gmv = priorByDate.has(key) ? priorByDate.get(key)! : null;
    return { priorDate, gmv };
  });

  // Videos, pre-aggregated by the brand_portal_videos RPC.
  //
  // ⚠️ The comment here used to claim the RPC returns rows "sorted by
  // period_gmv DESC". It does not — migration 044 has no ORDER BY at all, so
  // Postgres hands back grouped order and the page was opening on a wall of
  // $0 posts from two months earlier. Same wrong claim was found and fixed in
  // brand-portal-overview; it was still live here.
  //
  // Highest period GMV first, then most recent, so ties among the $0s land in
  // a stable, sensible order rather than an arbitrary one.
  const videos = ((videoRows.data ?? []) as any[]).map((r) => ({
    videoId: r.video_id,
    title: r.video_title || '(untitled)',
    url: r.video_url || null,
    postDate: r.post_date ? new Date(r.post_date) : null,
    gmv: Number(r.period_gmv ?? 0),
    orders: Number(r.period_orders ?? 0),
  })).sort((a, b) => b.gmv - a.gmv || (b.postDate?.getTime() ?? 0) - (a.postDate?.getTime() ?? 0));

  const periodLabel = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${actualEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${actualEndDate.getUTCFullYear()}`;

  // Pick the targetHandle as primary if it's the one the user navigated to
  const primaryHandle = handles.includes(targetHandle) ? targetHandle : handles[0] ?? '';

  return {
    managedId: owner.id,
    realName: owner.real_name,
    primaryHandle,
    handles,
    retainer: Number(owner.retainer ?? 0),
    monthlyPostRequirement: owner.monthly_post_requirement,
    currentTier: owner.current_tier,
    ...(() => {
      // No row, or no first_day, means we hold no record for this creator on
      // this brand. That is not "$0 earned" — render an em dash, per the rule
      // that a money read we cannot make never becomes a zero.
      const row = (lifetimeRow.data as any[] | null)?.[0];
      const since = row?.first_day ? new Date(`${row.first_day}T12:00:00Z`) : null;
      return {
        brandLifetimeGmv: since ? Number(row.lifetime_gmv ?? 0) : null,
        brandLifetimeSince: since,
      };
    })(),

    startDate,
    endDate: actualEndDate,
    periodLabel,
    periodLengthDays,

    totalGmv,
    totalOrders,
    totalPosts,

    priorTotalGmv,
    priorTotalPosts,
    gmvChangePct: pctChange(totalGmv, priorTotalGmv),
    postsChangePct: pctChange(totalPosts, priorTotalPosts),

    dailyPerformance,
    priorPoints,
    videos,
  };
}
