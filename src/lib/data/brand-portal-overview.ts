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

export type BrandPortalPeriod =
  | 'yesterday'
  | '7d'
  | '30d'
  | 'this_month'
  | 'last_month';

export const PERIOD_LABELS: Record<BrandPortalPeriod, string> = {
  yesterday: 'Yesterday',
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
  /** GMV during the selected period (the headline number on the page). */
  periodGmv: number;
  periodOrders: number;
  /** GMV during the equivalent prior-period window (for change %). */
  priorGmv: number;
  priorOrders: number;
  /** Cumulative (lifetime) GMV — total since the post went live. */
  lifetimeGmv: number;
  lifetimeOrders: number;
  /** Lifetime engagement (no daily breakdown available). */
  impressions: number;
  likes: number;
  comments: number;
}

export interface BrandPortalDashboard {
  brandSlug: string;
  brandName: string;

  startDate: Date;
  endDate: Date;
  periodLabel: string;
  periodLengthDays: number;

  managedCount: number;
  /** Sum of monthly retainer across all active managed creators on this brand. */
  monthlyRetainerTotal: number;
  totalGmv: number;
  totalPosts: number;

  priorTotalGmv: number;
  priorTotalPosts: number;
  gmvChangePct: number | null;
  postsChangePct: number | null;

  /** Daily series for the *current* period — has entries only for days
   * with data (not zero-filled). Use `priorPoints` for prior comparison. */
  /** Highlights for "what changed" callouts on the Overview. Each may be null
   * if there's not enough data to derive a meaningful highlight. */
  highlights: {
    peakDay: { date: Date; gmv: number } | null;
    topCreator: { handle: string; realName: string | null; gmv: number; posts: number } | null;
    topViralPost: { videoId: string; title: string; url: string | null; creatorHandle: string; impressions: number } | null;
  };
  /** Engagement metrics — views/likes/comments for videos POSTED in the period. */
  engagement: {
    posts: number;
    impressions: number;
    likes: number;
    comments: number;
    /** (likes + comments) / impressions, as a percentage. */
    engagementRate: number;
    priorImpressions: number;
    priorEngagementRate: number;
    impressionsChangePct: number | null;
  };
  /** Account-manager note to surface on the Overview, if set. */
  amNote: {
    text: string;
    updatedAt: Date | null;
    authorName: string | null;
    authorEmail: string | null;
  } | null;
  /** Goal progress for the current calendar month — null if no goal set. */
  goalProgress: {
    monthlyGoal: number;
    mtdGmv: number;
    pctOfGoal: number;
    /** Linear projection of EOM GMV based on pace so far. */
    projectedEomGmv: number;
    projectedPctOfGoal: number;
    daysElapsed: number;
    daysInMonth: number;
  } | null;
  /** Managed vs organic split for the period — managed = your roster's
   * contribution, organic = everyone else selling the brand's products. */
  split: {
    managedGmv: number;
    organicGmv: number;
    totalGmv: number;
    managedPosts: number;
    organicPosts: number;
    totalPosts: number;
    managedPctOfGmv: number;
  };
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

  if (period === 'yesterday') {
    // 1-day window = the latest data day. Prior = the day before.
    startDate = new Date(endDate);
    periodLengthDays = 1;
    priorStart = new Date(endDate);
    priorStart.setUTCDate(endDate.getUTCDate() - 1);
    priorEnd = new Date(priorStart);
  } else if (period === 'this_month') {
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

  const [statsCur, statsPrev, videoRows, stats30d, brandTotals, settingsRow, mtdRow, engagementRows] = await Promise.all([
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
    // Per-video aggregates via RPC — returns period_gmv (headline),
    // prior_gmv (for change %), and total_gmv (lifetime).
    supabase.rpc('brand_portal_videos', {
      p_brand_id: brandUuid,
      p_handles: allHandles,
      p_start_date: startStr,
      p_end_date: endStr,
      p_prior_start: priorStartStr,
      p_prior_end: priorEndStr,
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
    // Brand-wide totals (managed + organic) for the split panel
    supabase.rpc('brand_total_period_gmv', {
      p_brand_id: brandUuid,
      p_start_date: startStr,
      p_end_date: endStr,
    }),
    // Brand settings — AM note + monthly GMV goal
    supabase
      .from('brand_settings')
      .select(
        'monthly_gmv_goal, brand_overview_note, brand_overview_note_updated_at, brand_overview_note_updated_by',
      )
      .eq('brand', brandSlug)
      .maybeSingle(),
    // Month-to-date brand-wide GMV (calendar month, regardless of selected period)
    (async () => {
      const monthStart = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1, 12));
      return supabase.rpc('brand_total_period_gmv', {
        p_brand_id: brandUuid,
        p_start_date: fmt(monthStart),
        p_end_date: fmt(endDate),
      });
    })(),
    // Engagement metrics — videos table by managed creator handles.
    // Pull a wide window so we can compute both current and prior period totals.
    supabase
      .from('videos')
      .select('video_id, post_date, impressions, likes, comments')
      .eq('brand', brandSlug)
      .gte('post_date', priorStartStr)
      .lte('post_date', endStr)
      .in('creator_name', allHandles)
      .range(0, 19999),
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

  // ── Brand settings: AM note + monthly goal ──
  const settings = (settingsRow.data ?? null) as {
    monthly_gmv_goal: number | string | null;
    brand_overview_note: string | null;
    brand_overview_note_updated_at: string | null;
    brand_overview_note_updated_by: string | null;
  } | null;

  let amNote: BrandPortalDashboard['amNote'] = null;
  if (settings?.brand_overview_note?.trim()) {
    let authorName: string | null = null;
    let authorEmail: string | null = null;
    if (settings.brand_overview_note_updated_by) {
      const { data: author } = await supabase
        .from('user_profiles')
        .select('name, email')
        .eq('user_id', settings.brand_overview_note_updated_by)
        .maybeSingle();
      authorName = author?.name ?? null;
      authorEmail = author?.email ?? null;
    }
    amNote = {
      text: settings.brand_overview_note.trim(),
      updatedAt: settings.brand_overview_note_updated_at
        ? new Date(settings.brand_overview_note_updated_at)
        : null,
      authorName,
      authorEmail,
    };
  }

  // Goal progress — only when a positive monthly_gmv_goal is set on brand_settings.
  let goalProgress: BrandPortalDashboard['goalProgress'] = null;
  const monthlyGoal = Number(settings?.monthly_gmv_goal ?? 0);
  if (monthlyGoal > 0) {
    const mtdGmvRaw = (mtdRow.data ?? [])[0] as { total_gmv?: number | string } | undefined;
    const mtdGmv = Number(mtdGmvRaw?.total_gmv ?? 0);
    const monthStart = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1, 12));
    const monthEnd = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, 0, 12));
    const daysElapsed = Math.round((endDate.getTime() - monthStart.getTime()) / 86_400_000) + 1;
    const daysInMonth = Math.round((monthEnd.getTime() - monthStart.getTime()) / 86_400_000) + 1;
    const projectedEomGmv = daysElapsed > 0 ? (mtdGmv / daysElapsed) * daysInMonth : 0;
    goalProgress = {
      monthlyGoal,
      mtdGmv,
      pctOfGoal: (mtdGmv / monthlyGoal) * 100,
      projectedEomGmv,
      projectedPctOfGoal: (projectedEomGmv / monthlyGoal) * 100,
      daysElapsed,
      daysInMonth,
    };
  }

  // ── Engagement aggregates (current vs prior period) ──
  type EngRow = {
    video_id: string;
    post_date: string | null;
    impressions: number | null;
    likes: number | null;
    comments: number | null;
  };
  const engRows = (engagementRows.data ?? []) as EngRow[];
  let curImpressions = 0,
    curLikes = 0,
    curComments = 0,
    curPosts = 0;
  let priorImpressions = 0,
    priorLikes = 0,
    priorComments = 0,
    priorPostsCount = 0;
  for (const r of engRows) {
    if (!r.post_date) continue;
    const imp = Number(r.impressions ?? 0);
    const lk = Number(r.likes ?? 0);
    const cm = Number(r.comments ?? 0);
    if (r.post_date >= startStr && r.post_date <= endStr) {
      curImpressions += imp;
      curLikes += lk;
      curComments += cm;
      curPosts += 1;
    } else if (r.post_date >= priorStartStr && r.post_date <= priorEndStr) {
      priorImpressions += imp;
      priorLikes += lk;
      priorComments += cm;
      priorPostsCount += 1;
    }
  }
  const engagement = {
    posts: curPosts,
    impressions: curImpressions,
    likes: curLikes,
    comments: curComments,
    engagementRate:
      curImpressions > 0 ? ((curLikes + curComments) / curImpressions) * 100 : 0,
    priorImpressions,
    priorEngagementRate:
      priorImpressions > 0
        ? ((priorLikes + priorComments) / priorImpressions) * 100
        : 0,
    impressionsChangePct: pctChange(curImpressions, priorImpressions),
  };
  // Per-video engagement lookup (for the Videos page enrichment, separate task)
  const engagementByVideoId = new Map<string, { impressions: number; likes: number; comments: number }>();
  for (const r of engRows) {
    engagementByVideoId.set(r.video_id, {
      impressions: Number(r.impressions ?? 0),
      likes: Number(r.likes ?? 0),
      comments: Number(r.comments ?? 0),
    });
  }

  // Managed vs organic split — total brand sales minus managed contribution.
  const brandTotalRow = (brandTotals.data ?? [])[0] as any;
  const brandWideGmv = Number(brandTotalRow?.total_gmv ?? 0);
  const brandWidePosts = Number(brandTotalRow?.total_posts ?? 0);
  const organicGmv = Math.max(0, brandWideGmv - totalGmv);
  const organicPosts = Math.max(0, brandWidePosts - totalPosts);
  const split = {
    managedGmv: totalGmv,
    organicGmv,
    totalGmv: brandWideGmv,
    managedPosts: totalPosts,
    organicPosts,
    totalPosts: brandWidePosts,
    managedPctOfGmv: brandWideGmv > 0 ? (totalGmv / brandWideGmv) * 100 : 0,
  };

  // Videos — pre-aggregated by the brand_portal_videos RPC. Already
  // sorted by period_gmv DESC. No cap — the page paginates client-side.
  // Enriched with engagement totals from the videos table where matched.
  const videos: BrandRosterVideo[] = ((videoRows.data ?? []) as any[]).map((r) => {
    const eng = engagementByVideoId.get(r.video_id);
    return {
      videoId: r.video_id,
      title: r.video_title || '(untitled)',
      url: r.video_url || null,
      creatorHandle: normHandle(r.tiktok_username),
      postDate: r.post_date ? new Date(r.post_date) : null,
      periodGmv: Number(r.period_gmv ?? 0),
      periodOrders: Number(r.period_orders ?? 0),
      priorGmv: Number(r.prior_gmv ?? 0),
      priorOrders: Number(r.prior_orders ?? 0),
      lifetimeGmv: Number(r.total_gmv ?? 0),
      lifetimeOrders: Number(r.total_orders ?? 0),
      impressions: eng?.impressions ?? 0,
      likes: eng?.likes ?? 0,
      comments: eng?.comments ?? 0,
    };
  });

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

  // ── Highlights for "what changed" callouts ──
  const peakDayEntry = dailyPerformance.reduce<{ date: Date; gmv: number } | null>(
    (best, d) => (best === null || d.gmv > best.gmv ? { date: d.date, gmv: d.gmv } : best),
    null,
  );
  const topCreator = creators.length > 0 && creators[0].gmv > 0
    ? {
        handle: creators[0].primaryHandle,
        realName: creators[0].realName,
        gmv: creators[0].gmv,
        posts: creators[0].posts,
      }
    : null;
  const topViralEntry = videos.reduce<typeof videos[number] | null>(
    (best, v) => (best === null || v.impressions > best.impressions ? v : best),
    null,
  );
  const topViralPost =
    topViralEntry && topViralEntry.impressions > 0
      ? {
          videoId: topViralEntry.videoId,
          title: topViralEntry.title,
          url: topViralEntry.url,
          creatorHandle: topViralEntry.creatorHandle,
          impressions: topViralEntry.impressions,
        }
      : null;
  const highlights = { peakDay: peakDayEntry, topCreator, topViralPost };

  const periodLabel = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${actualEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${actualEndDate.getUTCFullYear()}`;

  return {
    brandSlug,
    brandName,
    startDate,
    endDate: actualEndDate,
    periodLabel,
    periodLengthDays,

    managedCount: roster.length,
    monthlyRetainerTotal: roster.reduce((s, r) => s + (r.retainer ?? 0), 0),
    totalGmv,
    totalPosts,

    priorTotalGmv,
    priorTotalPosts,
    gmvChangePct: pctChange(totalGmv, priorTotalGmv),
    postsChangePct: pctChange(totalPosts, priorTotalPosts),

    highlights,
    engagement,
    amNote,
    goalProgress,
    split,
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
    monthlyRetainerTotal: 0,
    totalGmv: 0,
    totalPosts: 0,
    priorTotalGmv: 0,
    priorTotalPosts: 0,
    gmvChangePct: null,
    postsChangePct: null,
    highlights: { peakDay: null, topCreator: null, topViralPost: null },
    engagement: {
      posts: 0,
      impressions: 0,
      likes: 0,
      comments: 0,
      engagementRate: 0,
      priorImpressions: 0,
      priorEngagementRate: 0,
      impressionsChangePct: null,
    },
    amNote: null,
    goalProgress: null,
    split: {
      managedGmv: 0,
      organicGmv: 0,
      totalGmv: 0,
      managedPosts: 0,
      organicPosts: 0,
      totalPosts: 0,
      managedPctOfGmv: 0,
    },
    dailyPerformance: [],
    priorPoints: [],
    creators: [],
    videos: [],
  };
}
