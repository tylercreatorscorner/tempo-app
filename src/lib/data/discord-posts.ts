import { createClient } from '@/lib/supabase/server';
import { BRAND_UUID_MAP, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';

// ─── Types ──────────────────────────────────────────────────────

interface VideoEntry {
  video_id: string;
  video_url: string | null;
  video_title: string | null;
  tiktok_username: string;
  gmv: number;
  orders: number;
  post_date: string | null;
  brand_id: string;
}

interface CreatorEntry {
  tiktok_username: string;
  gmv: number;
  orders: number;
  items_sold: number;
  videos: number;
  brand_id: string;
  discord_id: string | null;
  discord_name: string | null;
}

export interface WhatsCookingData {
  hotVideos: VideoEntry[];
  risingVideos: VideoEntry[];
  topVideos: VideoEntry[];
  discordMap: Map<string, { discord_id: string | null; discord_name: string | null }>;
  totalGmv: number;
  videoCount: number;
  creatorCount: number;
}

export interface WhosCookingData {
  leaderboard: (CreatorEntry & { breakoutPct: number; priorGmv: number; daysPosted: number })[];
  mostProlific: (CreatorEntry & { daysPosted: number }) | null;
  ironChef: (CreatorEntry & { daysPosted: number }) | null;
  breakoutStar: (CreatorEntry & { breakoutPct: number; priorGmv: number }) | null;
  totalGmv: number;
  creatorCount: number;
  videoCount: number;
}

// ─── Helpers ────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getBrandUuids(brandFilter: string): string[] | null {
  if (!brandFilter || brandFilter === 'all') return null;
  const uuid = BRAND_UUID_MAP[brandFilter];
  return uuid ? [uuid] : null;
}

async function getDiscordMap(supabase: any, brandUuids: string[] | null): Promise<Map<string, { discord_id: string | null; discord_name: string | null }>> {
  const map = new Map<string, { discord_id: string | null; discord_name: string | null }>();

  // Primary source: managed_creators (has the most discord IDs — 650+)
  // Most tiktok_accounts aren't linked to creators_v2 yet, so this is the reliable source
  const { data: mcData } = await supabase
    .from('managed_creators')
    .select('account_1, account_2, account_3, account_4, account_5, discord_id, discord_name');

  (mcData || []).forEach((mc: any) => {
    if (!mc.discord_id) return;
    const accounts = [mc.account_1, mc.account_2, mc.account_3, mc.account_4, mc.account_5].filter(Boolean);
    accounts.forEach((acc: string) => {
      const handle = acc.toLowerCase().replace('@', '').trim();
      if (handle && !map.has(handle)) {
        map.set(handle, {
          discord_id: mc.discord_id,
          discord_name: mc.discord_name,
        });
      }
    });
  });

  // Secondary source: creators_v2 via tiktok_accounts (for newer creators not in managed_creators)
  const { data: v2Data } = await supabase
    .from('tiktok_accounts')
    .select('tiktok_username, creator:creators_v2!inner(discord_id, discord_username)')
    .not('creator_id', 'is', null);

  (v2Data || []).forEach((row: any) => {
    const handle = (row.tiktok_username || '').toLowerCase().replace('@', '');
    if (handle && row.creator?.discord_id && !map.has(handle)) {
      map.set(handle, {
        discord_id: row.creator.discord_id,
        discord_name: row.creator.discord_username,
      });
    }
  });

  return map;
}

// ─── Paginated Fetch Helper ─────────────────────────────────────

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
        case 'eq': query = query.eq(f.column, f.value); break;
        case 'in': query = query.in(f.column, f.value); break;
        case 'gte': query = query.gte(f.column, f.value); break;
        case 'lte': query = query.lte(f.column, f.value); break;
        case 'lt': query = query.lt(f.column, f.value); break;
        case 'gt': query = query.gt(f.column, f.value); break;
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

// ─── What's Cooking Data ────────────────────────────────────────

export async function getWhatsCookingData(brandFilter: string, period: '7d' | '30d'): Promise<WhatsCookingData> {
  const supabase = await createClient();
  const brandUuids = getBrandUuids(brandFilter);

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  let hotStartDate: string;
  let risingStartDate: string;
  let risingEndDate: string;
  let fullStartDate: string;
  const endDate = formatDate(yesterday);

  if (period === '30d') {
    // Monthly: "Hot" = last 7 days of month, "Rising" = 7-14 days ago, "Top" = full month
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(today.getDate() - 14);

    hotStartDate = formatDate(sevenDaysAgo);
    risingStartDate = formatDate(fourteenDaysAgo);
    risingEndDate = formatDate(sevenDaysAgo);
    fullStartDate = formatDate(thirtyDaysAgo);
  } else {
    // 7-day: standard lookback
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(today.getDate() - 14);

    hotStartDate = formatDate(sevenDaysAgo);
    risingStartDate = formatDate(fourteenDaysAgo);
    risingEndDate = formatDate(sevenDaysAgo);
    fullStartDate = formatDate(fourteenDaysAgo);
  }

  // Fetch video stats - paginated to handle large datasets (JiYu alone has 140K+ rows/month)
  const videoFilters: { column: string; op: string; value: any }[] = [
    { column: 'report_date', op: 'gte', value: fullStartDate },
    { column: 'report_date', op: 'lte', value: endDate },
  ];
  if (brandUuids) {
    videoFilters.push({ column: 'brand_id', op: 'in', value: brandUuids });
  }
  const rawData = await paginatedFetch(
    supabase,
    'daily_video_stats',
    'video_id, video_url, video_title, tiktok_username, gmv, orders, post_date, brand_id, report_date',
    videoFilters
  );

  // Aggregate by video_id (may have multiple report_dates)
  const videoMap = new Map<string, VideoEntry>();
  (rawData || []).forEach((row: any) => {
    const existing = videoMap.get(row.video_id);
    if (!existing) {
      videoMap.set(row.video_id, {
        video_id: row.video_id,
        video_url: row.video_url,
        video_title: row.video_title,
        tiktok_username: row.tiktok_username,
        gmv: parseFloat(row.gmv) || 0,
        orders: parseInt(row.orders) || 0,
        post_date: row.post_date,
        brand_id: row.brand_id,
      });
    } else {
      existing.gmv += parseFloat(row.gmv) || 0;
      existing.orders += parseInt(row.orders) || 0;
    }
  });

  const allVideos = Array.from(videoMap.values());

  const hotThreshold = period === '30d' ? 100 : 100;
  const risingThreshold = period === '30d' ? 50 : 50;

  const hotVideos = allVideos
    .filter(v => v.post_date && v.post_date >= hotStartDate && v.gmv >= hotThreshold)
    .sort((a, b) => b.gmv - a.gmv);

  const risingVideos = allVideos
    .filter(v => v.post_date && v.post_date >= risingStartDate && v.post_date < risingEndDate && v.gmv >= risingThreshold)
    .sort((a, b) => b.gmv - a.gmv);

  const topVideos = [...allVideos]
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, 20);

  // Get Discord mappings
  const discordMap = await getDiscordMap(supabase, brandUuids);

  const totalGmv = allVideos.reduce((sum, v) => sum + v.gmv, 0);
  const creatorCount = new Set(allVideos.map(v => v.tiktok_username.toLowerCase())).size;

  return {
    hotVideos,
    risingVideos,
    topVideos,
    discordMap,
    totalGmv,
    videoCount: allVideos.length,
    creatorCount,
  };
}

// ─── Who's Cooking Data ─────────────────────────────────────────

export async function getWhosCookingData(brandFilter: string, period: '7d' | '30d'): Promise<WhosCookingData> {
  const supabase = await createClient();
  const brandUuids = getBrandUuids(brandFilter);

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const endDate = formatDate(yesterday);

  let currentStart: string;
  let priorStart: string;
  let priorEnd: string;

  if (period === '30d') {
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const sixtyDaysAgo = new Date(today);
    sixtyDaysAgo.setDate(today.getDate() - 60);

    currentStart = formatDate(thirtyDaysAgo);
    priorStart = formatDate(sixtyDaysAgo);
    priorEnd = formatDate(thirtyDaysAgo);
  } else {
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(today.getDate() - 14);

    currentStart = formatDate(sevenDaysAgo);
    priorStart = formatDate(fourteenDaysAgo);
    priorEnd = formatDate(sevenDaysAgo);
  }

  // Current period data - paginated (JiYu has 23K+ rows/month)
  const currentFilters: { column: string; op: string; value: any }[] = [
    { column: 'report_date', op: 'gte', value: currentStart },
    { column: 'report_date', op: 'lte', value: endDate },
  ];
  if (brandUuids) {
    currentFilters.push({ column: 'brand_id', op: 'in', value: brandUuids });
  }
  const currentData = await paginatedFetch(
    supabase,
    'daily_creator_stats',
    'tiktok_username, gmv, orders, items_sold, videos, brand_id, report_date',
    currentFilters
  );

  // Prior period data - paginated
  const priorFilters: { column: string; op: string; value: any }[] = [
    { column: 'report_date', op: 'gte', value: priorStart },
    { column: 'report_date', op: 'lt', value: priorEnd },
  ];
  if (brandUuids) {
    priorFilters.push({ column: 'brand_id', op: 'in', value: brandUuids });
  }
  const priorData = await paginatedFetch(
    supabase,
    'daily_creator_stats',
    'tiktok_username, gmv, brand_id, report_date',
    priorFilters
  );

  // Aggregate current period by creator
  const creatorMap = new Map<string, {
    tiktok_username: string;
    gmv: number;
    orders: number;
    items_sold: number;
    videos: number;
    brand_id: string;
    daysPosted: Set<string>;
  }>();

  (currentData || []).forEach((row: any) => {
    const handle = (row.tiktok_username || '').toLowerCase().replace('@', '');
    const existing = creatorMap.get(handle);
    if (!existing) {
      creatorMap.set(handle, {
        tiktok_username: row.tiktok_username,
        gmv: parseFloat(row.gmv) || 0,
        orders: parseInt(row.orders) || 0,
        items_sold: parseInt(row.items_sold) || 0,
        videos: parseInt(row.videos) || 0,
        brand_id: row.brand_id,
        daysPosted: new Set([row.report_date]),
      });
    } else {
      existing.gmv += parseFloat(row.gmv) || 0;
      existing.orders += parseInt(row.orders) || 0;
      existing.items_sold += parseInt(row.items_sold) || 0;
      existing.videos += parseInt(row.videos) || 0;
      existing.daysPosted.add(row.report_date);
    }
  });

  // Aggregate prior period GMV by creator
  const priorGmvMap = new Map<string, number>();
  (priorData || []).forEach((row: any) => {
    const handle = (row.tiktok_username || '').toLowerCase().replace('@', '');
    priorGmvMap.set(handle, (priorGmvMap.get(handle) || 0) + (parseFloat(row.gmv) || 0));
  });

  // Get Discord mappings
  const discordMap = await getDiscordMap(supabase, brandUuids);

  // Build creator list with breakout %
  const creators = Array.from(creatorMap.entries())
    .filter(([, c]) => c.gmv > 0)
    .map(([handle, c]) => {
      const prior = priorGmvMap.get(handle) || 0;
      const breakoutPct = prior > 0 ? ((c.gmv - prior) / prior * 100) : (c.gmv > 0 ? 999 : 0);
      const discord = discordMap.get(handle);
      return {
        tiktok_username: c.tiktok_username,
        gmv: c.gmv,
        orders: c.orders,
        items_sold: c.items_sold,
        videos: c.videos,
        brand_id: c.brand_id,
        discord_id: discord?.discord_id || null,
        discord_name: discord?.discord_name || null,
        daysPosted: c.daysPosted.size,
        priorGmv: prior,
        breakoutPct,
      };
    });

  // Sort by GMV for leaderboard
  const leaderboard = [...creators].sort((a, b) => b.gmv - a.gmv).slice(0, 10);

  // Special shoutouts - exclude top 3
  const top3 = new Set(leaderboard.slice(0, 3).map(c => c.tiktok_username.toLowerCase()));
  const eligible = creators.filter(c => !top3.has(c.tiktok_username.toLowerCase()));

  const mostProlific = [...eligible].sort((a, b) => b.videos - a.videos).find(c => c.videos >= 3) || null;

  const ironChefMinDays = period === '30d' ? 20 : 5;
  const ironChef = [...eligible]
    .filter(c => c.daysPosted >= ironChefMinDays)
    .sort((a, b) => b.daysPosted - a.daysPosted)[0] || null;

  const breakoutStar = [...eligible]
    .filter(c => c.priorGmv > 50 && c.breakoutPct >= 50 && c.breakoutPct < 999)
    .sort((a, b) => b.breakoutPct - a.breakoutPct)[0] || null;

  const totalGmv = creators.reduce((sum, c) => sum + c.gmv, 0);
  const totalVideos = creators.reduce((sum, c) => sum + c.videos, 0);

  return {
    leaderboard,
    mostProlific: mostProlific ? { ...mostProlific } : null,
    ironChef: ironChef ? { ...ironChef } : null,
    breakoutStar: breakoutStar ? { ...breakoutStar } : null,
    totalGmv,
    creatorCount: creators.length,
    videoCount: totalVideos,
  };
}

// ─── Monthly Goal Constants ─────────────────────────────────────

const MONTHLY_GOALS: Record<string, number> = {
  jiyu: 100000,
  catakor: 75000,
  physicians_choice: 150000,
  toplux: 50000,
};

function getMonthlyGoal(brandFilter: string): number {
  if (!brandFilter || brandFilter === 'all') {
    return Object.values(MONTHLY_GOALS).reduce((a, b) => a + b, 0);
  }
  return MONTHLY_GOALS[brandFilter] || 100000;
}

// ─── Daily Drop Types & Data ────────────────────────────────────

export interface DailyDropData {
  yesterdayGmv: number;
  dayBeforeGmv: number;
  mtdGmv: number;
  monthlyGoal: number;
  yesterdayDate: Date;
  dayBeforeDate: Date;
  topCreators: { tiktok_username: string; gmv: number }[];
  topVideos: { video_id: string; tiktok_username: string; gmv: number }[];
  topProducts: { name: string; gmv: number }[];
  oneToWatch: { video_id: string; tiktok_username: string; gmv: number; hoursAgo: number } | null;
  discordMap: Map<string, { discord_id: string | null; discord_name: string | null }>;
}

export async function getDailyDropData(brandFilter: string): Promise<DailyDropData> {
  const supabase = await createClient();
  const brandUuids = getBrandUuids(brandFilter);

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const dayBefore = new Date(today);
  dayBefore.setDate(today.getDate() - 2);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const threeDaysAgo = new Date(today);
  threeDaysAgo.setDate(today.getDate() - 3);

  const yesterdayStr = formatDate(yesterday);
  const dayBeforeStr = formatDate(dayBefore);
  const monthStartStr = formatDate(monthStart);

  // Yesterday's creator stats - paginated
  const ycFilters: { column: string; op: string; value: any }[] = [
    { column: 'report_date', op: 'eq', value: yesterdayStr },
    { column: 'gmv', op: 'gt', value: 0 },
  ];
  if (brandUuids) ycFilters.push({ column: 'brand_id', op: 'in', value: brandUuids });
  const yesterdayCreators = await paginatedFetch(supabase, 'daily_creator_stats', 'tiktok_username, gmv', ycFilters);

  // Day-before creator stats - paginated
  const dbFilters: { column: string; op: string; value: any }[] = [
    { column: 'report_date', op: 'eq', value: dayBeforeStr },
  ];
  if (brandUuids) dbFilters.push({ column: 'brand_id', op: 'in', value: brandUuids });
  const dayBeforeCreators = await paginatedFetch(supabase, 'daily_creator_stats', 'gmv', dbFilters);

  // MTD creator stats - paginated
  const mtdFilters: { column: string; op: string; value: any }[] = [
    { column: 'report_date', op: 'gte', value: monthStartStr },
    { column: 'report_date', op: 'lte', value: yesterdayStr },
  ];
  if (brandUuids) mtdFilters.push({ column: 'brand_id', op: 'in', value: brandUuids });
  const mtdData = await paginatedFetch(supabase, 'daily_creator_stats', 'gmv', mtdFilters);

  // Yesterday's video stats - paginated
  const yvFilters: { column: string; op: string; value: any }[] = [
    { column: 'report_date', op: 'eq', value: yesterdayStr },
    { column: 'gmv', op: 'gt', value: 0 },
  ];
  if (brandUuids) yvFilters.push({ column: 'brand_id', op: 'in', value: brandUuids });
  const yesterdayVideos = await paginatedFetch(supabase, 'daily_video_stats', 'video_id, tiktok_username, gmv, product_name', yvFilters);

  // One to Watch: recent videos with strong early traction - paginated
  const otwFilters: { column: string; op: string; value: any }[] = [
    { column: 'post_date', op: 'gte', value: formatDate(threeDaysAgo) },
    { column: 'gmv', op: 'gt', value: 0 },
  ];
  if (brandUuids) otwFilters.push({ column: 'brand_id', op: 'in', value: brandUuids });
  const recentVideoStats = await paginatedFetch(supabase, 'daily_video_stats', 'video_id, tiktok_username, gmv, post_date, report_date', otwFilters);

  // Aggregate videos by video_id
  const videoMap = new Map<string, { video_id: string; tiktok_username: string; gmv: number }>();
  (yesterdayVideos || []).forEach((v: any) => {
    const existing = videoMap.get(v.video_id);
    if (!existing) {
      videoMap.set(v.video_id, { video_id: v.video_id, tiktok_username: v.tiktok_username, gmv: parseFloat(v.gmv) || 0 });
    } else {
      existing.gmv += parseFloat(v.gmv) || 0;
    }
  });
  const topVideos = Array.from(videoMap.values()).sort((a, b) => b.gmv - a.gmv).slice(0, 5);

  // Aggregate products
  const productMap = new Map<string, number>();
  (yesterdayVideos || []).forEach((v: any) => {
    const name = v.product_name || 'Unknown Product';
    productMap.set(name, (productMap.get(name) || 0) + (parseFloat(v.gmv) || 0));
  });
  const topProducts = Array.from(productMap.entries())
    .map(([name, gmv]) => ({ name, gmv }))
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, 5);

  // Aggregate One to Watch by video_id
  const otwMap = new Map<string, { video_id: string; tiktok_username: string; gmv: number; post_date: string }>();
  (recentVideoStats || []).forEach((v: any) => {
    const existing = otwMap.get(v.video_id);
    if (!existing) {
      otwMap.set(v.video_id, { video_id: v.video_id, tiktok_username: v.tiktok_username, gmv: parseFloat(v.gmv) || 0, post_date: v.post_date });
    } else {
      existing.gmv += parseFloat(v.gmv) || 0;
    }
  });
  const otwSorted = Array.from(otwMap.values()).filter(v => v.gmv >= 25).sort((a, b) => b.gmv - a.gmv);
  let oneToWatch: DailyDropData['oneToWatch'] = null;
  if (otwSorted.length > 0) {
    const best = otwSorted[0];
    const postDate = new Date(best.post_date + 'T12:00:00');
    const hoursAgo = Math.round((today.getTime() - postDate.getTime()) / (1000 * 60 * 60));
    oneToWatch = { video_id: best.video_id, tiktok_username: best.tiktok_username, gmv: best.gmv, hoursAgo };
  }

  // Aggregate creators
  const creatorAgg = new Map<string, number>();
  (yesterdayCreators || []).forEach((c: any) => {
    const handle = c.tiktok_username;
    creatorAgg.set(handle, (creatorAgg.get(handle) || 0) + (parseFloat(c.gmv) || 0));
  });
  const topCreators = Array.from(creatorAgg.entries())
    .map(([tiktok_username, gmv]) => ({ tiktok_username, gmv }))
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, 5);

  const yesterdayGmv = (yesterdayCreators || []).reduce((s: number, c: any) => s + (parseFloat(c.gmv) || 0), 0);
  const dayBeforeGmv = (dayBeforeCreators || []).reduce((s: number, c: any) => s + (parseFloat(c.gmv) || 0), 0);
  const mtdGmv = (mtdData || []).reduce((s: number, c: any) => s + (parseFloat(c.gmv) || 0), 0);

  const discordMap = await getDiscordMap(supabase, brandUuids);

  return {
    yesterdayGmv,
    dayBeforeGmv,
    mtdGmv,
    monthlyGoal: getMonthlyGoal(brandFilter),
    yesterdayDate: yesterday,
    dayBeforeDate: dayBefore,
    topCreators,
    topVideos,
    topProducts,
    oneToWatch,
    discordMap,
  };
}

// ─── Weekly Wrap Types & Data ───────────────────────────────────
// Replaces the old Weekly Rankings generator. Tighter format with: a headline
// number, hot videos posted this week, top creators, and notable risers.

export interface WeeklyWrapData {
  weekTotal: number;
  lastWeekTotal: number;
  wowPct: number;            // week-over-week % change (Infinity if no prior)
  mtdGmv: number;
  monthlyGoal: number;
  startDate: Date;
  endDate: Date;
  hotVideos: { video_id: string; tiktok_username: string; gmv: number }[];
  topCreators: { name: string; gmv: number; videos: number; lastWeekGmv: number; change: number }[];
  risers: { name: string; gmv: number; lastWeekGmv: number; change: number; pctChange: number }[];
  discordMap: Map<string, { discord_id: string | null; discord_name: string | null }>;
}

export async function getWeeklyWrapData(brandFilter: string): Promise<WeeklyWrapData> {
  const supabase = await createClient();
  const brandUuids = getBrandUuids(brandFilter);

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  const twoWeeksAgo = new Date(today);
  twoWeeksAgo.setDate(today.getDate() - 14);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const yesterdayStr = formatDate(yesterday);
  const weekAgoStr = formatDate(weekAgo);
  const twoWeeksAgoStr = formatDate(twoWeeksAgo);
  const monthStartStr = formatDate(monthStart);

  // This week's creator stats - paginated
  const twcFilters: { column: string; op: string; value: any }[] = [
    { column: 'report_date', op: 'gte', value: weekAgoStr },
    { column: 'report_date', op: 'lte', value: yesterdayStr },
  ];
  if (brandUuids) twcFilters.push({ column: 'brand_id', op: 'in', value: brandUuids });
  const thisWeekData = await paginatedFetch(supabase, 'daily_creator_stats', 'tiktok_username, gmv, videos, report_date', twcFilters);

  // Last week's creator stats - paginated
  const lwcFilters: { column: string; op: string; value: any }[] = [
    { column: 'report_date', op: 'gte', value: twoWeeksAgoStr },
    { column: 'report_date', op: 'lt', value: weekAgoStr },
  ];
  if (brandUuids) lwcFilters.push({ column: 'brand_id', op: 'in', value: brandUuids });
  const lastWeekData = await paginatedFetch(supabase, 'daily_creator_stats', 'tiktok_username, gmv', lwcFilters);

  // MTD - paginated
  const wrMtdFilters: { column: string; op: string; value: any }[] = [
    { column: 'report_date', op: 'gte', value: monthStartStr },
    { column: 'report_date', op: 'lte', value: yesterdayStr },
  ];
  if (brandUuids) wrMtdFilters.push({ column: 'brand_id', op: 'in', value: brandUuids });
  const mtdData = await paginatedFetch(supabase, 'daily_creator_stats', 'gmv', wrMtdFilters);

  // This week's video stats - paginated (post_date this week, hot videos only)
  const wvFilters: { column: string; op: string; value: any }[] = [
    { column: 'report_date', op: 'gte', value: weekAgoStr },
    { column: 'report_date', op: 'lte', value: yesterdayStr },
    { column: 'gmv', op: 'gt', value: 0 },
  ];
  if (brandUuids) wvFilters.push({ column: 'brand_id', op: 'in', value: brandUuids });
  const weekVideoData = await paginatedFetch(supabase, 'daily_video_stats', 'video_id, tiktok_username, gmv, post_date, report_date', wvFilters);

  // Aggregate this week creators
  const thisWeekMap = new Map<string, { name: string; gmv: number; videos: number }>();
  (thisWeekData || []).forEach((row: any) => {
    const name = row.tiktok_username;
    if (!thisWeekMap.has(name)) {
      thisWeekMap.set(name, { name, gmv: 0, videos: 0 });
    }
    const entry = thisWeekMap.get(name)!;
    entry.gmv += parseFloat(row.gmv) || 0;
    entry.videos += parseInt(row.videos) || 0;
  });

  // Aggregate last week creators
  const lastWeekMap = new Map<string, number>();
  (lastWeekData || []).forEach((row: any) => {
    const name = row.tiktok_username;
    lastWeekMap.set(name, (lastWeekMap.get(name) || 0) + (parseFloat(row.gmv) || 0));
  });

  const allCreators = Array.from(thisWeekMap.values()).map(c => ({
    ...c,
    lastWeekGmv: lastWeekMap.get(c.name) || 0,
    change: c.gmv - (lastWeekMap.get(c.name) || 0),
  }));

  const topCreators = [...allCreators].sort((a, b) => b.gmv - a.gmv).slice(0, 5);

  // Risers: creators with biggest WoW lift (require some prior baseline so we don't surface noise)
  const risers = allCreators
    .filter(c => c.lastWeekGmv >= 50 && c.change > 0)
    .map(c => ({
      name: c.name,
      gmv: c.gmv,
      lastWeekGmv: c.lastWeekGmv,
      change: c.change,
      pctChange: c.lastWeekGmv > 0 ? (c.change / c.lastWeekGmv) * 100 : 0,
    }))
    .sort((a, b) => b.pctChange - a.pctChange)
    .slice(0, 3);

  // Aggregate videos posted this week by video_id (only count "hot" — posted in window)
  const videoAgg = new Map<string, { video_id: string; tiktok_username: string; gmv: number; post_date: string | null }>();
  (weekVideoData || []).forEach((v: any) => {
    const existing = videoAgg.get(v.video_id);
    if (!existing) {
      videoAgg.set(v.video_id, { video_id: v.video_id, tiktok_username: v.tiktok_username, gmv: parseFloat(v.gmv) || 0, post_date: v.post_date });
    } else {
      existing.gmv += parseFloat(v.gmv) || 0;
    }
  });
  const hotVideos = Array.from(videoAgg.values())
    .filter(v => v.post_date && v.post_date >= weekAgoStr)
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, 5)
    .map(({ video_id, tiktok_username, gmv }) => ({ video_id, tiktok_username, gmv }));

  const weekTotal = Array.from(thisWeekMap.values()).reduce((s, c) => s + c.gmv, 0);
  const lastWeekTotal = Array.from(lastWeekMap.values()).reduce((s, v) => s + v, 0);
  const wowPct = lastWeekTotal > 0 ? ((weekTotal - lastWeekTotal) / lastWeekTotal) * 100 : (weekTotal > 0 ? Infinity : 0);
  const mtdGmv = (mtdData || []).reduce((s: number, c: any) => s + (parseFloat(c.gmv) || 0), 0);

  const discordMap = await getDiscordMap(supabase, brandUuids);

  return {
    weekTotal,
    lastWeekTotal,
    wowPct,
    mtdGmv,
    monthlyGoal: getMonthlyGoal(brandFilter),
    startDate: weekAgo,
    endDate: yesterday,
    hotVideos,
    topCreators,
    risers,
    discordMap,
  };
}

// ─── Monthly Recap Types & Data ─────────────────────────────────
// Big-picture monthly recap. Best video + best creator + brand-vs-prior-month.

export interface MonthlyRecapData {
  monthTotal: number;
  priorMonthTotal: number;
  momPct: number;
  monthlyGoal: number;
  goalHitPct: number;
  monthLabel: string;          // e.g. "April 2026"
  bestVideo: { video_id: string; tiktok_username: string; gmv: number; post_date: string | null } | null;
  bestCreator: { name: string; gmv: number; videos: number } | null;
  topMovers: { name: string; gmv: number; priorGmv: number; pctChange: number }[];
  topCreators: { name: string; gmv: number; videos: number }[];
  discordMap: Map<string, { discord_id: string | null; discord_name: string | null }>;
}

export async function getMonthlyRecapData(brandFilter: string): Promise<MonthlyRecapData> {
  const supabase = await createClient();
  const brandUuids = getBrandUuids(brandFilter);

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  const sixtyDaysAgo = new Date(today);
  sixtyDaysAgo.setDate(today.getDate() - 60);

  const yesterdayStr = formatDate(yesterday);
  const thirtyAgoStr = formatDate(thirtyDaysAgo);
  const sixtyAgoStr = formatDate(sixtyDaysAgo);

  // This month creators
  const cFilters: { column: string; op: string; value: any }[] = [
    { column: 'report_date', op: 'gte', value: thirtyAgoStr },
    { column: 'report_date', op: 'lte', value: yesterdayStr },
  ];
  if (brandUuids) cFilters.push({ column: 'brand_id', op: 'in', value: brandUuids });
  const thisMonthData = await paginatedFetch(supabase, 'daily_creator_stats', 'tiktok_username, gmv, videos, report_date', cFilters);

  // Prior month creators
  const pFilters: { column: string; op: string; value: any }[] = [
    { column: 'report_date', op: 'gte', value: sixtyAgoStr },
    { column: 'report_date', op: 'lt', value: thirtyAgoStr },
  ];
  if (brandUuids) pFilters.push({ column: 'brand_id', op: 'in', value: brandUuids });
  const priorMonthData = await paginatedFetch(supabase, 'daily_creator_stats', 'tiktok_username, gmv', pFilters);

  // This month videos (for best video)
  const vFilters: { column: string; op: string; value: any }[] = [
    { column: 'report_date', op: 'gte', value: thirtyAgoStr },
    { column: 'report_date', op: 'lte', value: yesterdayStr },
    { column: 'gmv', op: 'gt', value: 0 },
  ];
  if (brandUuids) vFilters.push({ column: 'brand_id', op: 'in', value: brandUuids });
  const monthVideoData = await paginatedFetch(supabase, 'daily_video_stats', 'video_id, tiktok_username, gmv, post_date, report_date', vFilters);

  // Aggregate creators this month
  const thisMap = new Map<string, { name: string; gmv: number; videos: number }>();
  (thisMonthData || []).forEach((row: any) => {
    const name = row.tiktok_username;
    if (!thisMap.has(name)) thisMap.set(name, { name, gmv: 0, videos: 0 });
    const e = thisMap.get(name)!;
    e.gmv += parseFloat(row.gmv) || 0;
    e.videos += parseInt(row.videos) || 0;
  });

  const priorMap = new Map<string, number>();
  (priorMonthData || []).forEach((row: any) => {
    priorMap.set(row.tiktok_username, (priorMap.get(row.tiktok_username) || 0) + (parseFloat(row.gmv) || 0));
  });

  const allCreators = Array.from(thisMap.values());
  const topCreators = [...allCreators].sort((a, b) => b.gmv - a.gmv).slice(0, 5);
  const bestCreator = topCreators[0] || null;

  // Aggregate videos
  const videoMap = new Map<string, { video_id: string; tiktok_username: string; gmv: number; post_date: string | null }>();
  (monthVideoData || []).forEach((v: any) => {
    const ex = videoMap.get(v.video_id);
    if (!ex) {
      videoMap.set(v.video_id, { video_id: v.video_id, tiktok_username: v.tiktok_username, gmv: parseFloat(v.gmv) || 0, post_date: v.post_date });
    } else {
      ex.gmv += parseFloat(v.gmv) || 0;
    }
  });
  const bestVideo = Array.from(videoMap.values()).sort((a, b) => b.gmv - a.gmv)[0] || null;

  // Top movers — biggest % gainers (need real prior baseline)
  const topMovers = allCreators
    .filter(c => (priorMap.get(c.name) || 0) >= 100 && c.gmv > (priorMap.get(c.name) || 0))
    .map(c => {
      const prior = priorMap.get(c.name) || 0;
      const pctChange = prior > 0 ? ((c.gmv - prior) / prior) * 100 : 0;
      return { name: c.name, gmv: c.gmv, priorGmv: prior, pctChange };
    })
    .sort((a, b) => b.pctChange - a.pctChange)
    .slice(0, 3);

  const monthTotal = allCreators.reduce((s, c) => s + c.gmv, 0);
  const priorMonthTotal = Array.from(priorMap.values()).reduce((s, v) => s + v, 0);
  const momPct = priorMonthTotal > 0 ? ((monthTotal - priorMonthTotal) / priorMonthTotal) * 100 : (monthTotal > 0 ? Infinity : 0);
  const monthlyGoal = getMonthlyGoal(brandFilter);
  const goalHitPct = monthlyGoal > 0 ? (monthTotal / monthlyGoal) * 100 : 0;

  const monthLabel = thirtyDaysAgo.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    + ' – '
    + yesterday.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const discordMap = await getDiscordMap(supabase, brandUuids);

  return {
    monthTotal,
    priorMonthTotal,
    momPct,
    monthlyGoal,
    goalHitPct,
    monthLabel,
    bestVideo,
    bestCreator,
    topMovers,
    topCreators,
    discordMap,
  };
}

// ─── Brand Client Update Types & Data ───────────────────────────
// Slack-formatted weekly recap for brand contacts. Tone is professional &
// outward-facing — no @mentions of internal Discord IDs, no slang.

export interface BrandClientUpdateData {
  weekTotal: number;
  lastWeekTotal: number;
  wowPct: number;
  mtdGmv: number;
  monthlyGoal: number;
  startDate: Date;
  endDate: Date;
  topVideos: { video_id: string; tiktok_username: string; gmv: number }[];
  topCreators: { name: string; gmv: number; videos: number }[];
  videoCount: number;
  creatorCount: number;
}

export async function getBrandClientUpdateData(brandFilter: string): Promise<BrandClientUpdateData> {
  const supabase = await createClient();
  const brandUuids = getBrandUuids(brandFilter);

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  const twoWeeksAgo = new Date(today);
  twoWeeksAgo.setDate(today.getDate() - 14);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const yesterdayStr = formatDate(yesterday);
  const weekAgoStr = formatDate(weekAgo);
  const twoWeeksAgoStr = formatDate(twoWeeksAgo);
  const monthStartStr = formatDate(monthStart);

  const thisFilters: { column: string; op: string; value: any }[] = [
    { column: 'report_date', op: 'gte', value: weekAgoStr },
    { column: 'report_date', op: 'lte', value: yesterdayStr },
  ];
  if (brandUuids) thisFilters.push({ column: 'brand_id', op: 'in', value: brandUuids });
  const thisData = await paginatedFetch(supabase, 'daily_creator_stats', 'tiktok_username, gmv, videos, report_date', thisFilters);

  const priorFilters: { column: string; op: string; value: any }[] = [
    { column: 'report_date', op: 'gte', value: twoWeeksAgoStr },
    { column: 'report_date', op: 'lt', value: weekAgoStr },
  ];
  if (brandUuids) priorFilters.push({ column: 'brand_id', op: 'in', value: brandUuids });
  const priorData = await paginatedFetch(supabase, 'daily_creator_stats', 'gmv', priorFilters);

  const mtdFilters: { column: string; op: string; value: any }[] = [
    { column: 'report_date', op: 'gte', value: monthStartStr },
    { column: 'report_date', op: 'lte', value: yesterdayStr },
  ];
  if (brandUuids) mtdFilters.push({ column: 'brand_id', op: 'in', value: brandUuids });
  const mtdData = await paginatedFetch(supabase, 'daily_creator_stats', 'gmv', mtdFilters);

  const vFilters: { column: string; op: string; value: any }[] = [
    { column: 'report_date', op: 'gte', value: weekAgoStr },
    { column: 'report_date', op: 'lte', value: yesterdayStr },
    { column: 'gmv', op: 'gt', value: 0 },
  ];
  if (brandUuids) vFilters.push({ column: 'brand_id', op: 'in', value: brandUuids });
  const videoData = await paginatedFetch(supabase, 'daily_video_stats', 'video_id, tiktok_username, gmv', vFilters);

  // Aggregate
  const creatorMap = new Map<string, { name: string; gmv: number; videos: number }>();
  (thisData || []).forEach((row: any) => {
    const name = row.tiktok_username;
    if (!creatorMap.has(name)) creatorMap.set(name, { name, gmv: 0, videos: 0 });
    const e = creatorMap.get(name)!;
    e.gmv += parseFloat(row.gmv) || 0;
    e.videos += parseInt(row.videos) || 0;
  });
  const topCreators = Array.from(creatorMap.values()).sort((a, b) => b.gmv - a.gmv).slice(0, 3);

  const videoMap = new Map<string, { video_id: string; tiktok_username: string; gmv: number }>();
  (videoData || []).forEach((v: any) => {
    const ex = videoMap.get(v.video_id);
    if (!ex) {
      videoMap.set(v.video_id, { video_id: v.video_id, tiktok_username: v.tiktok_username, gmv: parseFloat(v.gmv) || 0 });
    } else {
      ex.gmv += parseFloat(v.gmv) || 0;
    }
  });
  const topVideos = Array.from(videoMap.values()).sort((a, b) => b.gmv - a.gmv).slice(0, 3);

  const weekTotal = Array.from(creatorMap.values()).reduce((s, c) => s + c.gmv, 0);
  const lastWeekTotal = (priorData || []).reduce((s: number, c: any) => s + (parseFloat(c.gmv) || 0), 0);
  const wowPct = lastWeekTotal > 0 ? ((weekTotal - lastWeekTotal) / lastWeekTotal) * 100 : (weekTotal > 0 ? Infinity : 0);
  const mtdGmv = (mtdData || []).reduce((s: number, c: any) => s + (parseFloat(c.gmv) || 0), 0);

  return {
    weekTotal,
    lastWeekTotal,
    wowPct,
    mtdGmv,
    monthlyGoal: getMonthlyGoal(brandFilter),
    startDate: weekAgo,
    endDate: yesterday,
    topVideos,
    topCreators,
    videoCount: videoMap.size,
    creatorCount: creatorMap.size,
  };
}

// ─── Discord Formatters ─────────────────────────────────────────

function formatGmv(gmv: number): string {
  return gmv % 1 === 0
    ? gmv.toLocaleString()
    : gmv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getMention(handle: string, discordId: string | null, discordName: string | null): string {
  if (discordId) return `<@${discordId}>`;
  if (discordName) return `@${discordName}`;
  return `@${handle.replace('@', '')}`;
}

export function formatWhatsCookingDiscord(
  data: WhatsCookingData,
  brandName: string,
  period: '7d' | '30d'
): string {
  const today = new Date();
  const periodDays = period === '30d' ? 30 : 7;
  const periodStart = new Date(today);
  periodStart.setDate(today.getDate() - periodDays);

  const headerLabel = period === '30d' ? 'MONTHLY' : 'WEEKLY';
  const rangeLabel = `${periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  const formatVideo = (v: VideoEntry, i: number) => {
    const handle = v.tiktok_username.replace('@', '');
    const discord = data.discordMap.get(handle.toLowerCase());
    const mention = getMention(handle, discord?.discord_id || null, discord?.discord_name || null);
    const url = v.video_id && handle
      ? `https://www.tiktok.com/@${handle}/video/${v.video_id}`
      : '';
    return url
      ? `> ${i + 1}. ${mention} — [**${formatCurrency(v.gmv)}**](${url})`
      : `> ${i + 1}. ${mention} — **${formatCurrency(v.gmv)}**`;
  };

  let text = `# 🍳 WHAT'S COOKING | ${brandName} | ${headerLabel}\n\n`;
  text += `📊 *${rangeLabel}* — **${formatCurrency(data.totalGmv)}** GMV from **${data.videoCount}** videos and **${data.creatorCount}** creators\n\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Hot — videos posted within the most recent 7 days, regardless of period
  text += `**__🔥 HOT VIDEOS (posted last 7 days)__**\n`;
  if (data.hotVideos.length === 0) {
    text += `> No hot posts crossed the threshold yet.\n`;
  } else {
    data.hotVideos.slice(0, 10).forEach((v, i) => { text += formatVideo(v, i) + '\n'; });
  }
  text += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Rising — posted 7–14 days ago and still pulling sales
  text += `**__📈 RISING (posted 7–14 days ago)__**\n`;
  if (data.risingVideos.length === 0) {
    text += `> Nothing rising in this window — keep cooking 🔥\n`;
  } else {
    data.risingVideos.slice(0, 10).forEach((v, i) => { text += formatVideo(v, i) + '\n'; });
  }
  text += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // All-time leaders within window — money printers regardless of post date
  text += `**__🏆 TOP GMV (in window)__**\n`;
  if (data.topVideos.length === 0) {
    text += `> No standout performers yet.\n`;
  } else {
    data.topVideos.slice(0, 5).forEach((v, i) => { text += formatVideo(v, i) + '\n'; });
  }
  text += `\n@everyone`;

  return text;
}

export function formatWhosCookingDiscord(
  data: WhosCookingData,
  brandName: string,
  period: '7d' | '30d'
): string {
  const today = new Date();
  const periodDays = period === '30d' ? 30 : 7;
  const periodStart = new Date(today);
  periodStart.setDate(today.getDate() - periodDays);

  const headerLabel = period === '30d' ? 'MONTHLY' : 'WEEKLY';
  const rangeLabel = `${periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  const comparisonLabel = period === '30d' ? 'vs last month' : 'vs last week';
  const totalDays = period === '30d' ? 30 : 7;

  let text = `# 👨‍🍳 WHO'S COOKING | ${brandName} | ${headerLabel}\n\n`;
  text += `📊 *${rangeLabel}* — **${formatCurrency(data.totalGmv)}** GMV across **${data.creatorCount}** creators (${data.videoCount} videos)\n\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Leaderboard — top 10 with podium medals on first three
  text += `**__👑 LEADERBOARD__**\n`;
  if (data.leaderboard.length === 0) {
    text += `> No creator activity in this window.\n`;
  } else {
    data.leaderboard.forEach((c, i) => {
      const medal = i === 0 ? ' 🥇' : i === 1 ? ' 🥈' : i === 2 ? ' 🥉' : '';
      const handle = c.tiktok_username.replace('@', '');
      const tiktokUrl = `https://www.tiktok.com/@${handle}`;
      const mention = getMention(handle, c.discord_id, c.discord_name);
      text += `> ${i + 1}. ${mention} — [**${formatCurrency(c.gmv)}**](${tiktokUrl})${medal}\n`;
    });
  }

  // Special Shoutouts — only if we have at least one to surface
  const shoutouts: string[] = [];
  if (data.mostProlific && data.mostProlific.videos >= 3) {
    const m = data.mostProlific;
    const mention = getMention(m.tiktok_username.replace('@', ''), m.discord_id, m.discord_name);
    shoutouts.push(`> 🎬 **Most Prolific** — ${mention} dropped **${m.videos}** videos this ${period === '30d' ? 'month' : 'week'}`);
  }
  if (data.ironChef) {
    const ic = data.ironChef;
    const mention = getMention(ic.tiktok_username.replace('@', ''), ic.discord_id, ic.discord_name);
    const dayText = ic.daysPosted >= totalDays ? '**every single day**' : `**${ic.daysPosted} of ${totalDays}** days`;
    shoutouts.push(`> 📅 **Iron Chef** — ${mention} posted ${dayText}`);
  }
  if (data.breakoutStar) {
    const bs = data.breakoutStar;
    const mention = getMention(bs.tiktok_username.replace('@', ''), bs.discord_id, bs.discord_name);
    shoutouts.push(`> 🚀 **Breakout Star** — ${mention} up **${Math.round(bs.breakoutPct)}%** ${comparisonLabel}`);
  }

  if (shoutouts.length > 0) {
    text += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `**__⭐ SPECIAL SHOUTOUTS__**\n`;
    text += shoutouts.join('\n') + '\n';
  }

  text += `\n@everyone`;
  return text;
}

// ─── Daily Drop Formatter ───────────────────────────────────────

function formatCurrency(num: number): string {
  return '$' + Math.round(num || 0).toLocaleString();
}

function generateProgressBar(percent: number): string {
  const filled = Math.min(15, Math.round((percent / 100) * 15));
  const empty = 15 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function getTikTokUrl(creatorName: string, videoId: string): string | null {
  const handle = (creatorName || '').replace('@', '').trim();
  if (!handle || !videoId) return null;
  return `https://www.tiktok.com/@${handle}/video/${videoId}`;
}

function getDailyDropMention(handle: string, discordMap: Map<string, { discord_id: string | null; discord_name: string | null }>): string {
  const clean = handle.replace('@', '').toLowerCase();
  const discord = discordMap.get(clean);
  if (discord?.discord_id) return `<@${discord.discord_id}>`;
  return `@${handle.replace('@', '')}`;
}

export function formatDailyDropDiscord(data: DailyDropData, brandName: string): string {
  const yesterdayDate = new Date(data.yesterdayDate);
  const dateFull = yesterdayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const progressPercent = Math.round((data.mtdGmv / data.monthlyGoal) * 100);
  const progressBar = generateProgressBar(progressPercent);
  const monthName = yesterdayDate.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();

  // Day-over-day change
  let dodChange = '';
  if (data.dayBeforeGmv > 0) {
    const changePercent = Math.round(((data.yesterdayGmv - data.dayBeforeGmv) / data.dayBeforeGmv) * 100);
    const changeArrow = changePercent >= 0 ? '↑' : '↓';
    const dayBeforeName = new Date(data.dayBeforeDate).toLocaleDateString('en-US', { weekday: 'short' });
    dodChange = ` (${changeArrow}${Math.abs(changePercent)}% vs ${dayBeforeName})`;
  }

  // Goal pacing
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const dayOfMonth = yesterdayDate.getDate();
  const daysRemaining = daysInMonth - dayOfMonth;
  const dailyAverage = dayOfMonth > 0 ? data.mtdGmv / dayOfMonth : 0;
  const projectedTotal = data.mtdGmv + (dailyAverage * daysRemaining);
  let pacingNote = '';
  if (projectedTotal >= data.monthlyGoal) {
    pacingNote = `📈 On pace to hit **${formatCurrency(projectedTotal)}** by month end`;
  } else {
    const neededPerDay = daysRemaining > 0 ? (data.monthlyGoal - data.mtdGmv) / daysRemaining : 0;
    pacingNote = `⚡ Need **${formatCurrency(neededPerDay)}/day** to hit goal`;
  }

  let msg = `# 📈 DAILY DROP | ${brandName} | ${dateFull}\n\n`;
  msg += `💰 Yesterday's GMV: **${formatCurrency(data.yesterdayGmv)}**${dodChange}\n`;
  msg += `📊 ${monthName} progress: ${progressBar} **${progressPercent}%** (${formatCurrency(data.mtdGmv)} / ${formatCurrency(data.monthlyGoal)})\n`;
  msg += `${pacingNote}\n\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Top 5 Creators
  msg += `**__👑 TOP CREATORS__**\n`;
  if (data.topCreators.length === 0) {
    msg += `> No creator data yesterday.\n`;
  } else {
    data.topCreators.forEach((c, i) => {
      const tag = getDailyDropMention(c.tiktok_username, data.discordMap);
      msg += `> ${i + 1}. ${tag} — **${formatCurrency(c.gmv)}**\n`;
    });
  }
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Top 5 Videos — use markdown links rather than naked URLs
  msg += `**__🎬 TOP VIDEOS__**\n`;
  if (data.topVideos.length === 0) {
    msg += `> No video data yesterday.\n`;
  } else {
    data.topVideos.forEach((v, i) => {
      const handle = (v.tiktok_username || '').replace('@', '');
      const url = getTikTokUrl(v.tiktok_username, v.video_id);
      if (url) {
        msg += `> ${i + 1}. @${handle} — [**${formatCurrency(v.gmv)}**](${url})\n`;
      } else {
        msg += `> ${i + 1}. @${handle} — **${formatCurrency(v.gmv)}**\n`;
      }
    });
  }
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Top 5 Products
  msg += `**__📦 TOP PRODUCTS__**\n`;
  if (data.topProducts.length === 0) {
    msg += `> No product data yesterday.\n`;
  } else {
    data.topProducts.forEach((p, i) => {
      msg += `> ${i + 1}. ${p.name} — **${formatCurrency(p.gmv)}**\n`;
    });
  }
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // One to Watch
  msg += `**__👀 ONE TO WATCH__**\n`;
  if (data.oneToWatch) {
    const handle = (data.oneToWatch.tiktok_username || '').replace('@', '');
    const url = getTikTokUrl(data.oneToWatch.tiktok_username, data.oneToWatch.video_id);
    const linkLabel = url ? `[@${handle}'s post](${url})` : `@${handle}'s post`;
    msg += `> ${linkLabel} — posted ${data.oneToWatch.hoursAgo}h ago, already at **${formatCurrency(data.oneToWatch.gmv)}** 🚀\n`;
  } else {
    msg += `> No standout new posts to highlight.\n`;
  }

  msg += `\nLet's get it today 🔥`;

  return msg;
}

// ─── Weekly Wrap Formatter ──────────────────────────────────────

export function formatWeeklyWrapDiscord(data: WeeklyWrapData, brandName: string): string {
  const startDay = data.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endDay = data.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const progressPercent = Math.round((data.mtdGmv / data.monthlyGoal) * 100);
  const progressBar = generateProgressBar(progressPercent);

  // WoW arrow + label
  let wowLine = '';
  if (Number.isFinite(data.wowPct) && data.lastWeekTotal > 0) {
    const arrow = data.wowPct >= 0 ? '↑' : '↓';
    wowLine = ` (${arrow}${Math.abs(Math.round(data.wowPct))}% WoW)`;
  } else if (data.weekTotal > 0) {
    wowLine = ' (↑ new period)';
  }

  let msg = `# 🗓️ WEEKLY WRAP | ${brandName} | ${startDay} – ${endDay}\n\n`;
  msg += `💰 Week total: **${formatCurrency(data.weekTotal)}**${wowLine}\n`;
  msg += `📊 Month-to-date: ${progressBar} **${progressPercent}%** (${formatCurrency(data.mtdGmv)} / ${formatCurrency(data.monthlyGoal)})\n\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Hot videos
  msg += `**__🔥 HOT VIDEOS THIS WEEK__**\n`;
  if (data.hotVideos.length === 0) {
    msg += `> No videos posted this week with sales yet.\n`;
  } else {
    data.hotVideos.forEach((v, i) => {
      const handle = (v.tiktok_username || '').replace('@', '');
      const url = getTikTokUrl(v.tiktok_username, v.video_id);
      msg += `> ${i + 1}. @${handle} — ${url || 'Link unavailable'} — **${formatCurrency(v.gmv)}**\n`;
    });
  }
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Top creators
  msg += `**__👑 TOP CREATORS__**\n`;
  if (data.topCreators.length === 0) {
    msg += `> No creator activity this week.\n`;
  } else {
    data.topCreators.forEach((c, i) => {
      const tag = getDailyDropMention(c.name, data.discordMap);
      msg += `> ${i + 1}. ${tag} — **${formatCurrency(c.gmv)}** (${c.videos} ${c.videos === 1 ? 'video' : 'videos'})\n`;
    });
  }
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Risers
  msg += `**__📈 RISERS__**\n`;
  if (data.risers.length === 0) {
    msg += `> No standout risers this week.\n`;
  } else {
    data.risers.forEach(r => {
      const tag = getDailyDropMention(r.name, data.discordMap);
      msg += `> ${tag} — **${formatCurrency(r.gmv)}** (+${Math.round(r.pctChange)}% vs last week)\n`;
    });
  }
  msg += `\n@everyone keep cooking 🔥`;

  return msg;
}

// ─── Monthly Recap Formatter ────────────────────────────────────

export function formatMonthlyRecapDiscord(data: MonthlyRecapData, brandName: string): string {
  const goalEmoji = data.goalHitPct >= 100 ? '🎯' : data.goalHitPct >= 80 ? '📈' : '⏳';

  let momLine = '';
  if (Number.isFinite(data.momPct) && data.priorMonthTotal > 0) {
    const arrow = data.momPct >= 0 ? '↑' : '↓';
    momLine = ` (${arrow}${Math.abs(Math.round(data.momPct))}% MoM)`;
  } else if (data.monthTotal > 0) {
    momLine = ' (↑ new period)';
  }

  let msg = `# 📅 MONTHLY RECAP | ${brandName} | ${data.monthLabel}\n\n`;
  msg += `💰 Total GMV: **${formatCurrency(data.monthTotal)}**${momLine}\n`;
  msg += `${goalEmoji} Goal: **${formatCurrency(data.monthlyGoal)}** — hit **${Math.round(data.goalHitPct)}%**\n`;
  if (data.priorMonthTotal > 0) {
    msg += `📊 Prior month: ${formatCurrency(data.priorMonthTotal)}\n`;
  }
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Best video
  msg += `**__🏆 VIDEO OF THE MONTH__**\n`;
  if (data.bestVideo) {
    const handle = (data.bestVideo.tiktok_username || '').replace('@', '');
    const url = getTikTokUrl(data.bestVideo.tiktok_username, data.bestVideo.video_id);
    msg += `> @${handle} — ${url || 'Link unavailable'} — **${formatCurrency(data.bestVideo.gmv)}**\n`;
  } else {
    msg += `> No standout video this month.\n`;
  }
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Best creator + top 5
  msg += `**__👑 TOP CREATORS__**\n`;
  if (data.topCreators.length === 0) {
    msg += `> No creator activity this month.\n`;
  } else {
    data.topCreators.forEach((c, i) => {
      const tag = getDailyDropMention(c.name, data.discordMap);
      const medal = i === 0 ? ' 🥇' : i === 1 ? ' 🥈' : i === 2 ? ' 🥉' : '';
      msg += `> ${i + 1}. ${tag} — **${formatCurrency(c.gmv)}** (${c.videos} ${c.videos === 1 ? 'video' : 'videos'})${medal}\n`;
    });
  }
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Top movers
  msg += `**__🚀 TOP MOVERS__**\n`;
  if (data.topMovers.length === 0) {
    msg += `> No notable month-over-month risers.\n`;
  } else {
    data.topMovers.forEach(m => {
      const tag = getDailyDropMention(m.name, data.discordMap);
      msg += `> ${tag} — **${formatCurrency(m.gmv)}** (+${Math.round(m.pctChange)}% MoM)\n`;
    });
  }
  msg += `\n@everyone — let's run it back 🔥`;

  return msg;
}

// ─── Brand Client Update Formatter (Slack-formatted) ────────────
// Slack mrkdwn rules:
//  - *bold*       → single asterisks (NOT double)
//  - _italic_     → underscores
//  - <url|label>  → links
//  - >            → blockquote
// Designed to be paste-ready into a Slack DM/channel for a brand client.

export function formatBrandClientUpdateSlack(data: BrandClientUpdateData, brandName: string): string {
  const startDay = data.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endDay = data.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  let wowLine = '';
  if (Number.isFinite(data.wowPct) && data.lastWeekTotal > 0) {
    const arrow = data.wowPct >= 0 ? '↑' : '↓';
    wowLine = ` (${arrow}${Math.abs(Math.round(data.wowPct))}% vs last week)`;
  }

  const goalPct = data.monthlyGoal > 0 ? Math.round((data.mtdGmv / data.monthlyGoal) * 100) : 0;

  let msg = `:wave: *${brandName} — Weekly Update* (${startDay} – ${endDay})\n\n`;
  msg += `Hi team! Here's this week's recap.\n\n`;

  // Headline numbers
  msg += `*This week's GMV:* ${formatCurrency(data.weekTotal)}${wowLine}\n`;
  msg += `*Month-to-date:* ${formatCurrency(data.mtdGmv)} — *${goalPct}%* of monthly goal (${formatCurrency(data.monthlyGoal)})\n`;
  msg += `*Activity:* ${data.creatorCount} creators · ${data.videoCount} videos this week\n\n`;

  // Top videos
  msg += `*:movie_camera: Top videos this week*\n`;
  if (data.topVideos.length === 0) {
    msg += `_No videos with sales this week._\n`;
  } else {
    data.topVideos.forEach((v, i) => {
      const handle = (v.tiktok_username || '').replace('@', '');
      const url = getTikTokUrl(v.tiktok_username, v.video_id);
      const link = url ? `<${url}|@${handle}>` : `@${handle}`;
      msg += `${i + 1}. ${link} — *${formatCurrency(v.gmv)}*\n`;
    });
  }
  msg += `\n`;

  // Top creators
  msg += `*:trophy: Top creators this week*\n`;
  if (data.topCreators.length === 0) {
    msg += `_No creator activity this week._\n`;
  } else {
    data.topCreators.forEach((c, i) => {
      const handle = (c.name || '').replace('@', '');
      msg += `${i + 1}. @${handle} — *${formatCurrency(c.gmv)}* (${c.videos} ${c.videos === 1 ? 'video' : 'videos'})\n`;
    });
  }
  msg += `\n`;
  msg += `Full report attached as PDF. Let me know if you'd like to dig into anything specific. :rocket:`;

  return msg;
}
