import { createAdminClient } from '@/lib/supabase/server';
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
  const supabase = await createAdminClient();
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
  const supabase = await createAdminClient();
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
  const supabase = await createAdminClient();
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

  // Yesterday's creator stats
  let q1 = supabase
    .from('daily_creator_stats')
    .select('tiktok_username, gmv')
    .eq('report_date', yesterdayStr)
    .gt('gmv', 0)
    .order('gmv', { ascending: false });
  if (brandUuids) q1 = q1.in('brand_id', brandUuids);
  const { data: yesterdayCreators } = await q1;

  // Day-before creator stats (for comparison)
  let q2 = supabase
    .from('daily_creator_stats')
    .select('gmv')
    .eq('report_date', dayBeforeStr);
  if (brandUuids) q2 = q2.in('brand_id', brandUuids);
  const { data: dayBeforeCreators } = await q2;

  // MTD creator stats
  let q3 = supabase
    .from('daily_creator_stats')
    .select('gmv')
    .gte('report_date', monthStartStr)
    .lte('report_date', yesterdayStr);
  if (brandUuids) q3 = q3.in('brand_id', brandUuids);
  const { data: mtdData } = await q3;

  // Yesterday's video stats
  let q4 = supabase
    .from('daily_video_stats')
    .select('video_id, tiktok_username, gmv, product_name')
    .eq('report_date', yesterdayStr)
    .gt('gmv', 0)
    .order('gmv', { ascending: false });
  if (brandUuids) q4 = q4.in('brand_id', brandUuids);
  const { data: yesterdayVideos } = await q4;

  // One to Watch: recent videos with strong early traction
  let q5 = supabase
    .from('daily_video_stats')
    .select('video_id, tiktok_username, gmv, post_date, report_date')
    .gte('post_date', formatDate(threeDaysAgo))
    .gt('gmv', 0);
  if (brandUuids) q5 = q5.in('brand_id', brandUuids);
  const { data: recentVideoStats } = await q5;

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

// ─── Weekly Rankings Types & Data ───────────────────────────────

export interface WeeklyRankingsData {
  weekTotal: number;
  mtdGmv: number;
  monthlyGoal: number;
  startDate: Date;
  endDate: Date;
  topCreators: { name: string; gmv: number; videos: number; lastWeekGmv: number; change: number }[];
  videosHot: { video_id: string; tiktok_username: string; gmv: number }[];
  videosDoingWell: { video_id: string; tiktok_username: string; gmv: number }[];
  videosAllTime: { video_id: string; tiktok_username: string; gmv: number; weeksAgo: number }[];
  discordMap: Map<string, { discord_id: string | null; discord_name: string | null }>;
}

export async function getWeeklyRankingsData(brandFilter: string): Promise<WeeklyRankingsData> {
  const supabase = await createAdminClient();
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

  // This week's creator stats
  let q1 = supabase
    .from('daily_creator_stats')
    .select('tiktok_username, gmv, videos, report_date')
    .gte('report_date', weekAgoStr)
    .lte('report_date', yesterdayStr);
  if (brandUuids) q1 = q1.in('brand_id', brandUuids);
  const { data: thisWeekData } = await q1;

  // Last week's creator stats
  let q2 = supabase
    .from('daily_creator_stats')
    .select('tiktok_username, gmv')
    .gte('report_date', twoWeeksAgoStr)
    .lt('report_date', weekAgoStr);
  if (brandUuids) q2 = q2.in('brand_id', brandUuids);
  const { data: lastWeekData } = await q2;

  // MTD
  let q3 = supabase
    .from('daily_creator_stats')
    .select('gmv')
    .gte('report_date', monthStartStr)
    .lte('report_date', yesterdayStr);
  if (brandUuids) q3 = q3.in('brand_id', brandUuids);
  const { data: mtdData } = await q3;

  // This week's video stats (for Hot Now, Doing Well, All-Time)
  let q4 = supabase
    .from('daily_video_stats')
    .select('video_id, tiktok_username, gmv, post_date, report_date')
    .gte('report_date', weekAgoStr)
    .lte('report_date', yesterdayStr)
    .gt('gmv', 0);
  if (brandUuids) q4 = q4.in('brand_id', brandUuids);
  const { data: weekVideoData } = await q4;

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

  const topCreators = Array.from(thisWeekMap.values())
    .map(c => ({
      ...c,
      lastWeekGmv: lastWeekMap.get(c.name) || 0,
      change: c.gmv - (lastWeekMap.get(c.name) || 0),
    }))
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, 10);

  // Aggregate videos by video_id with post_date
  const videoAgg = new Map<string, { video_id: string; tiktok_username: string; gmv: number; post_date: string | null }>();
  (weekVideoData || []).forEach((v: any) => {
    const existing = videoAgg.get(v.video_id);
    if (!existing) {
      videoAgg.set(v.video_id, { video_id: v.video_id, tiktok_username: v.tiktok_username, gmv: parseFloat(v.gmv) || 0, post_date: v.post_date });
    } else {
      existing.gmv += parseFloat(v.gmv) || 0;
    }
  });
  const allVideos = Array.from(videoAgg.values());

  // Categorize by post_date age
  const sevenDaysAgoStr = formatDate(weekAgo);
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(today.getDate() - 14);
  const fourteenDaysAgoStr = formatDate(fourteenDaysAgo);

  const videosHot = allVideos
    .filter(v => v.post_date && v.post_date >= sevenDaysAgoStr)
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, 5);

  const videosDoingWell = allVideos
    .filter(v => v.post_date && v.post_date >= fourteenDaysAgoStr && v.post_date < sevenDaysAgoStr)
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, 5);

  const videosAllTime = allVideos
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, 5)
    .map(v => {
      let weeksAgo = 0;
      if (v.post_date) {
        const postDateObj = new Date(v.post_date);
        weeksAgo = Math.floor((today.getTime() - postDateObj.getTime()) / (1000 * 60 * 60 * 24 * 7));
      }
      return { ...v, weeksAgo };
    });

  const weekTotal = Array.from(thisWeekMap.values()).reduce((s, c) => s + c.gmv, 0);
  const mtdGmv = (mtdData || []).reduce((s: number, c: any) => s + (parseFloat(c.gmv) || 0), 0);

  const discordMap = await getDiscordMap(supabase, brandUuids);

  return {
    weekTotal,
    mtdGmv,
    monthlyGoal: getMonthlyGoal(brandFilter),
    startDate: weekAgo,
    endDate: yesterday,
    topCreators,
    videosHot,
    videosDoingWell,
    videosAllTime,
    discordMap,
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
  const dateStr = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  
  let periodLabel: string;
  if (period === '30d') {
    const thirtyAgo = new Date(today);
    thirtyAgo.setDate(today.getDate() - 30);
    const rangeStart = thirtyAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const rangeEnd = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    periodLabel = `Monthly performance (${rangeStart} – ${rangeEnd})`;
  } else {
    periodLabel = 'Performance from the last 7 days';
  }

  const formatVideo = (v: VideoEntry, i: number) => {
    const handle = v.tiktok_username.replace('@', '');
    const discord = data.discordMap.get(handle.toLowerCase());
    const mention = getMention(handle, discord?.discord_id || null, discord?.discord_name || null);
    const url = v.video_id && handle
      ? `https://www.tiktok.com/@${handle}/video/${v.video_id}`
      : '';
    return url
      ? `> ${i + 1}. ${mention} - [$${formatGmv(v.gmv)}](${url})`
      : `> ${i + 1}. ${mention} - $${formatGmv(v.gmv)}`;
  };

  const headerSuffix = period === '30d' ? ' | 📅 Monthly' : '';
  let text = `🍳 **What's Cooking?** | ${brandName} | ${dateStr}${headerSuffix}\n`;
  text += `*${periodLabel}*\n\n`;

  if (data.hotVideos.length > 0) {
    text += `**:fire: __HOT Videos (posted last 7 days)__:**\n`;
    data.hotVideos.slice(0, 10).forEach((v, i) => {
      text += formatVideo(v, i) + '\n';
    });
    text += '\n';
  }

  if (data.risingVideos.length > 0) {
    const risingLabel = period === '30d' ? 'posted 7-14 days ago' : 'posted 7-14 days ago';
    text += `**:chart_with_upwards_trend: __Rising Videos (${risingLabel}):__**\n`;
    data.risingVideos.slice(0, 10).forEach((v, i) => {
      text += formatVideo(v, i) + '\n';
    });
    text += '\n';
  }

  if (data.topVideos.length > 0) {
    text += `**:trophy: __Top Performers (highest GMV)__:**\n`;
    data.topVideos.slice(0, 10).forEach((v, i) => {
      text += formatVideo(v, i) + '\n';
    });
    text += '\n';
  }

  text += `@everyone`;
  return text;
}

export function formatWhosCookingDiscord(
  data: WhosCookingData,
  brandName: string,
  period: '7d' | '30d'
): string {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  
  let periodLabel: string;
  if (period === '30d') {
    const thirtyAgo = new Date(today);
    thirtyAgo.setDate(today.getDate() - 30);
    const rangeStart = thirtyAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const rangeEnd = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    periodLabel = `Top performers this month (${rangeStart} – ${rangeEnd})`;
  } else {
    periodLabel = 'Top performers from the last 7 days';
  }
  const comparisonLabel = period === '30d' ? 'from last month' : 'from last week';

  const headerSuffix = period === '30d' ? ' | 📅 Monthly' : '';
  let text = `👨‍🍳 **Who's Cooking?** | ${brandName} | ${dateStr}${headerSuffix}\n`;
  text += `*${periodLabel}*\n\n`;

  // Leaderboard
  text += `**:trophy: __LEADERBOARD__**\n`;
  data.leaderboard.forEach((c, i) => {
    const medal = i === 0 ? ' 🥇' : i === 1 ? ' 🥈' : i === 2 ? ' 🥉' : '';
    const handle = c.tiktok_username.replace('@', '');
    const tiktokUrl = `https://www.tiktok.com/@${handle}`;
    const mention = getMention(handle, c.discord_id, c.discord_name);
    text += `> ${i + 1}. ${mention} - [$${formatGmv(c.gmv)}](${tiktokUrl})${medal}\n`;
  });

  // Special Shoutouts
  const shoutouts: string[] = [];
  if (data.mostProlific && data.mostProlific.videos >= 3) {
    const m = data.mostProlific;
    const mention = getMention(m.tiktok_username.replace('@', ''), m.discord_id, m.discord_name);
    shoutouts.push(`> 🎬 **Most Prolific**: ${mention} dropped ${m.videos} videos this ${period === '30d' ? 'month' : 'week'}!`);
  }
  if (data.ironChef) {
    const ic = data.ironChef;
    const mention = getMention(ic.tiktok_username.replace('@', ''), ic.discord_id, ic.discord_name);
    const totalDays = period === '30d' ? 30 : 7;
    const dayText = ic.daysPosted >= totalDays ? 'every single day' : `${ic.daysPosted} out of ${totalDays} days`;
    shoutouts.push(`> 📅 **Iron Chef**: ${mention} posted ${dayText}!`);
  }
  if (data.breakoutStar) {
    const bs = data.breakoutStar;
    const mention = getMention(bs.tiktok_username.replace('@', ''), bs.discord_id, bs.discord_name);
    shoutouts.push(`> 📈 **Breakout Star**: ${mention} up ${Math.round(bs.breakoutPct)}% ${comparisonLabel}!`);
  }

  if (shoutouts.length > 0) {
    text += `\n**:star: __SPECIAL SHOUTOUTS__**\n`;
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

  let msg = `# 📈 DAILY DROP | ${dateFull}\n\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `💰 YESTERDAY'S GMV: **${formatCurrency(data.yesterdayGmv)}**${dodChange}\n`;
  msg += `📊 ${monthName} GOAL: **${formatCurrency(data.monthlyGoal)}**\n`;
  msg += `🔥 PROGRESS: ${progressBar} **${progressPercent}%** (${formatCurrency(data.mtdGmv)})\n`;
  msg += `${pacingNote}\n\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Top 5 Creators
  msg += `**__👑 TOP 5 CREATORS (Yesterday)__**\n`;
  if (data.topCreators.length === 0) {
    msg += `> No creator data available\n`;
  } else {
    data.topCreators.forEach((c, i) => {
      const tag = getDailyDropMention(c.tiktok_username, data.discordMap);
      msg += `> ${i + 1}. ${tag} — **${formatCurrency(c.gmv)}**\n`;
    });
  }
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Top 5 Videos
  msg += `**__🎬 TOP 5 VIDEOS (Yesterday)__**\n`;
  if (data.topVideos.length === 0) {
    msg += `> No video data available\n`;
  } else {
    data.topVideos.forEach((v, i) => {
      const handle = (v.tiktok_username || '').replace('@', '');
      const url = getTikTokUrl(v.tiktok_username, v.video_id);
      if (url) {
        msg += `> ${i + 1}. @${handle} — ${url} — **${formatCurrency(v.gmv)}**\n`;
      } else {
        msg += `> ${i + 1}. @${handle} — **${formatCurrency(v.gmv)}**\n`;
      }
    });
  }
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Top 5 Products
  msg += `**__📦 TOP 5 PRODUCTS (Yesterday)__**\n`;
  if (data.topProducts.length === 0) {
    msg += `> No product data available\n`;
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
    msg += `> @${handle} — ${url || 'Link unavailable'}\n`;
    msg += `> Posted ${data.oneToWatch.hoursAgo} hours ago. Already at **${formatCurrency(data.oneToWatch.gmv)}** and climbing.\n`;
  } else {
    msg += `> No trending videos to highlight today.\n`;
  }
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `Let's get it today. 🔥`;

  return msg;
}

// ─── Weekly Rankings Formatter ──────────────────────────────────

export function formatWeeklyRankingsDiscord(data: WeeklyRankingsData, brandName: string): string {
  const today = new Date();
  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);
  const startDay = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).split(' ')[1];
  const endDay = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).split(' ')[1];
  const monthShort = today.toLocaleDateString('en-US', { month: 'short' });
  const monthName = today.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();

  const progressPercent = Math.round((data.mtdGmv / data.monthlyGoal) * 100);
  const progressBar = generateProgressBar(progressPercent);

  let msg = `# 📊 WEEKLY RANKINGS | ${monthShort} ${startDay}-${endDay}\n\n`;
  msg += `💰 WEEK TOTAL: **${formatCurrency(data.weekTotal)}**\n`;
  msg += `📊 ${monthName} PROGRESS: ${progressBar} **${progressPercent}%** (${formatCurrency(data.mtdGmv)} / ${formatCurrency(data.monthlyGoal)})\n\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Find risers and new entries
  const risers = [...data.topCreators]
    .filter(c => c.change > 0 && c.lastWeekGmv > 0)
    .sort((a, b) => b.change - a.change)
    .slice(0, 2);
  const riserNames = new Set(risers.map(r => r.name));

  const newEntries = data.topCreators.filter(c => c.lastWeekGmv === 0);
  const newEntryNames = new Set(newEntries.map(n => n.name));

  // Top 10 Creators
  msg += `**__👑 TOP 10 CREATORS__**\n`;
  data.topCreators.forEach((c, i) => {
    const tag = getDailyDropMention(c.name, data.discordMap);
    let emoji = '';
    if (riserNames.has(c.name)) emoji = ' 📈';
    if (newEntryNames.has(c.name)) emoji = ' 🆕';
    msg += `> ${i + 1}. ${tag} — **${formatCurrency(c.gmv)}**${emoji}\n`;
  });
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Hot Now
  msg += `**__🔥 HOT NOW (Posted 0-7 Days Ago)__**\n`;
  msg += `*Videos trending fresh — replicate these*\n\n`;
  if (data.videosHot.length === 0) {
    msg += `> No hot videos this week\n`;
  } else {
    data.videosHot.forEach((v, i) => {
      const handle = (v.tiktok_username || '').replace('@', '');
      const url = getTikTokUrl(v.tiktok_username, v.video_id);
      msg += `> ${i + 1}. @${handle} — ${url || 'Link unavailable'} — **${formatCurrency(v.gmv)}**\n`;
    });
  }
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Doing Well
  msg += `**__⏳ DOING WELL (Posted 7-14 Days Ago)__**\n`;
  msg += `*Still performing — these have legs*\n\n`;
  if (data.videosDoingWell.length === 0) {
    msg += `> No videos in this range\n`;
  } else {
    data.videosDoingWell.forEach((v, i) => {
      const handle = (v.tiktok_username || '').replace('@', '');
      const url = getTikTokUrl(v.tiktok_username, v.video_id);
      msg += `> ${i + 1}. @${handle} — ${url || 'Link unavailable'} — **${formatCurrency(v.gmv)}**\n`;
    });
  }
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // All-Time Top
  msg += `**__💰 TOP GMV ALL-TIME (Still Performing)__**\n`;
  msg += `*The money printers — regardless of post date*\n\n`;
  if (data.videosAllTime.length === 0) {
    msg += `> No all-time videos with recent sales\n`;
  } else {
    data.videosAllTime.forEach((v, i) => {
      const handle = (v.tiktok_username || '').replace('@', '');
      const url = getTikTokUrl(v.tiktok_username, v.video_id);
      const weeksText = v.weeksAgo === 1 ? '1 week ago' : `${v.weeksAgo} weeks ago`;
      msg += `> ${i + 1}. @${handle} — ${url || 'Link unavailable'} — **${formatCurrency(v.gmv)}** (posted ${weeksText})\n`;
    });
  }
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Risers
  msg += `**__📈 RISERS__**\n`;
  if (risers.length === 0) {
    msg += `> No significant risers this week\n`;
  } else {
    risers.forEach(r => {
      const handle = (r.name || '').replace('@', '');
      msg += `> @${handle} — **+${formatCurrency(r.change)}** vs last week\n`;
    });
  }
  msg += `\n`;

  // New to Board
  msg += `**__🆕 NEW TO THE BOARD__**\n`;
  if (newEntries.length === 0) {
    msg += `> No new entries this week\n`;
  } else {
    newEntries.slice(0, 2).forEach(n => {
      const handle = (n.name || '').replace('@', '');
      msg += `> @${handle} — First time in top 10\n`;
    });
  }

  return msg;
}
