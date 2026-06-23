import { createClient } from '@/lib/supabase/server';
import { BRAND_UUID_MAP, BRAND_DISPLAY_NAMES, expandBrandToDataSlugs } from '@/lib/utils/constants';

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
  /** Last day of the data window (latest report_date). Use for display headers. */
  endDate: Date;
}

export interface WhosCookingData {
  leaderboard: (CreatorEntry & { breakoutPct: number; priorGmv: number; daysPosted: number })[];
  mostProlific: (CreatorEntry & { daysPosted: number }) | null;
  ironChef: (CreatorEntry & { daysPosted: number }) | null;
  breakoutStar: (CreatorEntry & { breakoutPct: number; priorGmv: number }) | null;
  totalGmv: number;
  creatorCount: number;
  videoCount: number;
  /** Last day of the data window (latest report_date). Use for display headers. */
  endDate: Date;
}

// ─── Helpers ────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

// Resolve a roster brand slug to the brand_id UUIDs the daily_* tables are keyed
// by. DB-driven (reads brands_v2) so ANY brand with a row resolves. The old
// hardcoded BRAND_UUID_MAP silently returned null for newer brands (cosrx,
// neurogum, m3, …), and callers treat null as "no brand filter" — so the queries
// scanned every brand and statement-timed-out on the big daily_creator_stats
// table (e.g. cosrx's MTD was a 259k-row all-brands scan instead of 84k scoped).
// 'all'/empty → null (no filter). An unknown specific brand → [] so it scopes to
// nothing rather than widening to all brands.
async function getBrandUuids(supabase: any, brandFilter: string): Promise<string[] | null> {
  if (!brandFilter || brandFilter === 'all') return null;
  // Umbrella brands (leefar) expand to per-store slugs; daily_* tables are keyed per store.
  const slugs = [...expandBrandToDataSlugs(brandFilter)];
  const { data } = await supabase.from('brands_v2').select('id').in('slug', slugs);
  const uuids = (data ?? []).map((r: { id: string }) => r.id);
  if (uuids.length > 0) return uuids;
  const legacy = BRAND_UUID_MAP[brandFilter];
  return legacy ? [legacy] : [];
}

/**
 * The data tables only have data through whatever the most recent CSV upload
 * processed. Anchoring period windows to "today" produces empty results when
 * uploads are stale (e.g. today is Apr 28 but data ends Apr 13 → 7-day window
 * Apr 21–28 returns nothing).
 *
 * This returns a synthetic "today" that is one day after the latest data point
 * we have for the brand IN THE GIVEN TABLE, so `yesterday = latest data date`
 * and all existing "today minus N days" math windows over real data automatically.
 *
 * IMPORTANT: each table can have its own latest upload date — for JiYu,
 * daily_creator_stats is current through Apr but daily_video_stats/daily_product_stats
 * stopped updating in March. Pass the table you're querying so each section
 * shows the freshest data in that source.
 *
 * Falls back to real `new Date()` if the table has zero data for this brand.
 */
async function resolveAnchorToday(
  supabase: any,
  brandUuids: string[] | null,
  table: 'daily_creator_stats' | 'daily_video_product_stats' = 'daily_creator_stats'
): Promise<Date> {
  let query = supabase
    .from(table)
    .select('report_date')
    .order('report_date', { ascending: false })
    .limit(1);
  if (brandUuids) query = query.in('brand_id', brandUuids);
  const { data } = await query;
  if (!data || data.length === 0) return new Date();
  // Build a Date from the latest report_date (UTC noon to avoid TZ slips), then add 1 day so
  // "yesterday" math = the actual latest data date.
  const latest = new Date(data[0].report_date + 'T12:00:00Z');
  latest.setUTCDate(latest.getUTCDate() + 1);
  return latest;
}

/**
 * Returns the latest report_date in the data tables (or null if none exist).
 * Used by the freshness banner so the UI can warn the user when data is stale.
 */
export async function getLatestReportDate(brandFilter: string): Promise<Date | null> {
  const supabase = await createClient();
  const brandUuids = await getBrandUuids(supabase, brandFilter);
  let query = supabase
    .from('daily_creator_stats')
    .select('report_date')
    .order('report_date', { ascending: false })
    .limit(1);
  if (brandUuids) query = query.in('brand_id', brandUuids);
  const { data } = await query;
  if (!data || data.length === 0) return null;
  return new Date(data[0].report_date + 'T12:00:00Z');
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
  const brandUuids = await getBrandUuids(supabase, brandFilter);

  // What's Cooking queries daily_video_stats — anchor to that table specifically
  // so we always show the most recent video data we have (may lag creator data).
  const today = await resolveAnchorToday(supabase, brandUuids, 'daily_video_product_stats');
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
    'daily_video_product_stats',
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
    endDate: yesterday,
  };
}

// ─── Who's Cooking Data ─────────────────────────────────────────

export async function getWhosCookingData(brandFilter: string, period: '7d' | '30d'): Promise<WhosCookingData> {
  const supabase = await createClient();
  const brandUuids = await getBrandUuids(supabase, brandFilter);

  const today = await resolveAnchorToday(supabase, brandUuids);
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
    endDate: yesterday,
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
  /** Date the video/OTW data is reporting on (may lag yesterdayDate when video uploads are stale). */
  videoAsOf: Date;
  /** Date the product data is reporting on (may lag yesterdayDate when product uploads are stale). */
  productAsOf: Date;
  topCreators: { tiktok_username: string; gmv: number }[];
  topVideos: { video_id: string; tiktok_username: string; gmv: number }[];
  topProducts: { name: string; gmv: number }[];
  oneToWatch: { video_id: string; tiktok_username: string; gmv: number; hoursAgo: number } | null;
  discordMap: Map<string, { discord_id: string | null; discord_name: string | null }>;
}

export async function getDailyDropData(brandFilter: string): Promise<DailyDropData> {
  const supabase = await createClient();
  const brandUuids = await getBrandUuids(supabase, brandFilter);

  // Each table can have its own latest upload date. For JiYu, daily_creator_stats
  // is current through Apr but daily_video_stats and daily_product_stats stopped
  // at Mar 14. Anchor each section's queries to its own table so video/product
  // sections still show the freshest data they have, instead of empty results.
  const [creatorAnchor, videoAnchor, productAnchor] = await Promise.all([
    resolveAnchorToday(supabase, brandUuids, 'daily_creator_stats'),
    resolveAnchorToday(supabase, brandUuids, 'daily_video_product_stats'),
    resolveAnchorToday(supabase, brandUuids, 'daily_video_product_stats'),
  ]);

  // Header date / "yesterday" math uses the creator anchor (most authoritative
  // for headline GMV and pacing). Video/product sections use their own anchors.
  const today = creatorAnchor;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const dayBefore = new Date(today);
  dayBefore.setDate(today.getDate() - 2);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const videoYesterday = new Date(videoAnchor);
  videoYesterday.setDate(videoAnchor.getDate() - 1);
  const videoThreeDaysAgo = new Date(videoAnchor);
  videoThreeDaysAgo.setDate(videoAnchor.getDate() - 3);

  const productYesterday = new Date(productAnchor);
  productYesterday.setDate(productAnchor.getDate() - 1);

  const yesterdayStr = formatDate(yesterday);
  const dayBeforeStr = formatDate(dayBefore);
  const monthStartStr = formatDate(monthStart);
  const videoYesterdayStr = formatDate(videoYesterday);
  const productYesterdayStr = formatDate(productYesterday);

  // All queries below run in parallel — sequential awaits were timing out on JiYu
  // (140K+ rows/month) on the Hobby-plan 10s function ceiling.

  // Yesterday's creator stats - paginated
  const ycFilters: { column: string; op: string; value: any }[] = [
    { column: 'report_date', op: 'eq', value: yesterdayStr },
    { column: 'gmv', op: 'gt', value: 0 },
  ];
  if (brandUuids) ycFilters.push({ column: 'brand_id', op: 'in', value: brandUuids });

  // Day-before creator stats - paginated
  const dbFilters: { column: string; op: string; value: any }[] = [
    { column: 'report_date', op: 'eq', value: dayBeforeStr },
  ];
  if (brandUuids) dbFilters.push({ column: 'brand_id', op: 'in', value: brandUuids });

  // MTD GMV is a single SQL aggregate (dcs_gmv_sum RPC), NOT a paginate-every-row
  // sum. For a multi-store umbrella (LeeFar ~47k MTD rows) or the all-brands drop
  // (~259k) the old paginated sum was dozens/hundreds of deep-offset round-trips
  // and timed the function out (504). brandUuids null = all brands.

  // Video sections use the video table's anchor (may differ from creator anchor).
  const yvFilters: { column: string; op: string; value: any }[] = [
    { column: 'report_date', op: 'eq', value: videoYesterdayStr },
    { column: 'gmv', op: 'gt', value: 0 },
  ];
  if (brandUuids) yvFilters.push({ column: 'brand_id', op: 'in', value: brandUuids });

  // Product section uses the product table's anchor.
  const ypFilters: { column: string; op: string; value: any }[] = [
    { column: 'report_date', op: 'eq', value: productYesterdayStr },
    { column: 'gmv', op: 'gt', value: 0 },
  ];
  if (brandUuids) ypFilters.push({ column: 'brand_id', op: 'in', value: brandUuids });

  // One to Watch: anchored to the video table's latest 3-day window.
  const otwFilters: { column: string; op: string; value: any }[] = [
    { column: 'post_date', op: 'gte', value: formatDate(videoThreeDaysAgo) },
    { column: 'gmv', op: 'gt', value: 0 },
  ];
  if (brandUuids) otwFilters.push({ column: 'brand_id', op: 'in', value: brandUuids });

  const [yesterdayCreators, dayBeforeCreators, mtdSumRes, yesterdayVideos, yesterdayProducts, recentVideoStats, discordMap] = await Promise.all([
    paginatedFetch(supabase, 'daily_creator_stats', 'tiktok_username, gmv', ycFilters),
    paginatedFetch(supabase, 'daily_creator_stats', 'gmv', dbFilters),
    supabase.rpc('dcs_gmv_sum', { p_brand_ids: brandUuids, p_start: monthStartStr, p_end: yesterdayStr }),
    paginatedFetch(supabase, 'daily_video_product_stats', 'video_id, tiktok_username, gmv', yvFilters),
    paginatedFetch(supabase, 'daily_video_product_stats', 'product_name, gmv', ypFilters),
    paginatedFetch(supabase, 'daily_video_product_stats', 'video_id, tiktok_username, gmv, post_date, report_date', otwFilters),
    getDiscordMap(supabase, brandUuids),
  ]);

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

  // Aggregate products from daily_video_product_stats (rows are per
  // video×product×day, so sum gmv by product_name).
  const productMap = new Map<string, number>();
  (yesterdayProducts || []).forEach((p: any) => {
    const name = p.product_name || 'Unknown Product';
    productMap.set(name, (productMap.get(name) || 0) + (parseFloat(p.gmv) || 0));
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
    // hoursAgo is relative to the video table's anchor — when comparing to
    // creator's "today" we'd get nonsensical numbers when the tables diverge.
    const hoursAgo = Math.round((videoAnchor.getTime() - postDate.getTime()) / (1000 * 60 * 60));
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
  const mtdGmv = Number((mtdSumRes as { data?: number | string | null })?.data ?? 0) || 0;

  return {
    yesterdayGmv,
    dayBeforeGmv,
    mtdGmv,
    monthlyGoal: getMonthlyGoal(brandFilter),
    yesterdayDate: yesterday,
    dayBeforeDate: dayBefore,
    videoAsOf: videoYesterday,
    productAsOf: productYesterday,
    topCreators,
    topVideos,
    topProducts,
    oneToWatch,
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
  const today = data.endDate;
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

  const subtitle = period === '30d' ? "Top performers this month" : 'Performance from the last 7 days';
  let text = `🍳 **What's Cooking?** | ${brandName} | ${headerLabel}\n`;
  text += `*${subtitle}*\n\n`;
  text += `📊 *${rangeLabel}* — **${formatCurrency(data.totalGmv)}** GMV from **${data.videoCount}** videos and **${data.creatorCount}** creators\n\n`;

  // Hot — videos posted within the most recent 7 days, regardless of period
  text += `**__🔥 HOT VIDEOS (posted last 7 days)__**\n`;
  if (data.hotVideos.length === 0) {
    text += `> No hot posts crossed the threshold yet.\n`;
  } else {
    data.hotVideos.slice(0, 10).forEach((v, i) => { text += formatVideo(v, i) + '\n'; });
  }
  text += `\n`;

  // Rising — posted 7–14 days ago and still pulling sales
  text += `**__📈 RISING (posted 7–14 days ago)__**\n`;
  if (data.risingVideos.length === 0) {
    text += `> Nothing rising in this window — keep cooking 🔥\n`;
  } else {
    data.risingVideos.slice(0, 10).forEach((v, i) => { text += formatVideo(v, i) + '\n'; });
  }
  text += `\n`;

  // All-time leaders within window — money printers regardless of post date
  text += `**__🏆 TOP PERFORMERS (highest GMV)__**\n`;
  if (data.topVideos.length === 0) {
    text += `> No standout performers yet.\n`;
  } else {
    data.topVideos.slice(0, 10).forEach((v, i) => { text += formatVideo(v, i) + '\n'; });
  }
  text += `\n@everyone`;

  return text;
}

export function formatWhosCookingDiscord(
  data: WhosCookingData,
  brandName: string,
  period: '7d' | '30d'
): string {
  const today = data.endDate;
  const periodDays = period === '30d' ? 30 : 7;
  const periodStart = new Date(today);
  periodStart.setDate(today.getDate() - periodDays);

  const headerLabel = period === '30d' ? 'MONTHLY' : 'WEEKLY';
  const rangeLabel = `${periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  const comparisonLabel = period === '30d' ? 'vs last month' : 'vs last week';
  const totalDays = period === '30d' ? 30 : 7;

  const subtitle = period === '30d' ? 'Top performers this month' : 'Top performers from the last 7 days';
  let text = `👨‍🍳 **Who's Cooking?** | ${brandName} | ${headerLabel}\n`;
  text += `*${subtitle}*\n\n`;
  text += `📊 *${rangeLabel}* — **${formatCurrency(data.totalGmv)}** GMV across **${data.creatorCount}** creators (${data.videoCount} videos)\n\n`;

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
    shoutouts.push(`> 🎬 **Most Prolific**: ${mention} dropped **${m.videos}** videos this ${period === '30d' ? 'month' : 'week'}!`);
  }
  if (data.ironChef) {
    const ic = data.ironChef;
    const mention = getMention(ic.tiktok_username.replace('@', ''), ic.discord_id, ic.discord_name);
    const dayText = ic.daysPosted >= totalDays ? '**every single day**' : `**${ic.daysPosted} of ${totalDays}** days`;
    shoutouts.push(`> 📅 **Iron Chef**: ${mention} posted ${dayText}!`);
  }
  if (data.breakoutStar) {
    const bs = data.breakoutStar;
    const mention = getMention(bs.tiktok_username.replace('@', ''), bs.discord_id, bs.discord_name);
    shoutouts.push(`> 📈 **Breakout Star**: ${mention} up **${Math.round(bs.breakoutPct)}%** ${comparisonLabel}!`);
  }

  if (shoutouts.length > 0) {
    text += `\n**__⭐ SPECIAL SHOUTOUTS__**\n`;
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

  // Goal pacing — anchor month math to the yesterday date so we project against
  // the correct month even when data is stale (otherwise we'd compare MTD against
  // the wrong month's day count)
  const daysInMonth = new Date(yesterdayDate.getFullYear(), yesterdayDate.getMonth() + 1, 0).getDate();
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

  const DIV = `━━━━━━━━━━━━━━━━━━━━━━━━`;

  // Header — brand kept in the title; old divider framing restored.
  let msg = `# 📈 DAILY DROP | ${brandName} | ${dateFull}\n\n`;
  msg += `${DIV}\n\n`;
  msg += `💰 YESTERDAY'S GMV: **${formatCurrency(data.yesterdayGmv)}**${dodChange}\n`;
  msg += `📊 ${monthName} GOAL: **${formatCurrency(data.monthlyGoal)}**\n`;
  msg += `🔥 PROGRESS: ${progressBar} **${progressPercent}%** (${formatCurrency(data.mtdGmv)})\n`;
  msg += `${pacingNote}\n\n`;
  msg += `${DIV}\n\n`;

  // Top 5 Creators — @handle linked to their TikTok profile (clean, no mass-ping)
  msg += `**__👑 TOP 5 CREATORS (Yesterday)__**\n`;
  if (data.topCreators.length === 0) {
    msg += `> No creator data available\n`;
  } else {
    data.topCreators.slice(0, 5).forEach((c, i) => {
      const handle = (c.tiktok_username || '').replace('@', '');
      msg += `> ${i + 1}. [@${handle}](https://www.tiktok.com/@${handle}) — **${formatCurrency(c.gmv)}**\n`;
    });
  }
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Top 5 Videos — use markdown links rather than naked URLs.
  // Label the section's "as of" date when video data lags creator data.
  const videoAsOfStr = data.videoAsOf.toISOString().slice(0, 10);
  const yesterdayStr2 = yesterdayDate.toISOString().slice(0, 10);
  const videoStaleLabel = videoAsOfStr !== yesterdayStr2
    ? ` _(as of ${data.videoAsOf.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})_`
    : '';
  msg += `**__🎬 TOP 5 VIDEOS (Yesterday)__**${videoStaleLabel}\n`;
  if (data.topVideos.length === 0) {
    msg += `> No video data available\n`;
  } else {
    data.topVideos.slice(0, 5).forEach((v, i) => {
      const handle = (v.tiktok_username || '').replace('@', '');
      const url = getTikTokUrl(v.tiktok_username, v.video_id);
      if (url) {
        msg += `> ${i + 1}. [@${handle}](${url}) — **${formatCurrency(v.gmv)}**\n`;
      } else {
        msg += `> ${i + 1}. @${handle} — **${formatCurrency(v.gmv)}**\n`;
      }
    });
  }
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Top 5 Products — label the section's "as of" date when product data lags.
  const productAsOfStr = data.productAsOf.toISOString().slice(0, 10);
  const productStaleLabel = productAsOfStr !== yesterdayStr2
    ? ` _(as of ${data.productAsOf.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})_`
    : '';
  msg += `**__📦 TOP 5 PRODUCTS (Yesterday)__**${productStaleLabel}\n`;
  if (data.topProducts.length === 0) {
    msg += `> No product data available\n`;
  } else {
    data.topProducts.slice(0, 5).forEach((p, i) => {
      msg += `> ${i + 1}. ${p.name} — **${formatCurrency(p.gmv)}**\n`;
    });
  }
  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // One to Watch — two-line narrative with the naked link (Discord shows a preview)
  msg += `**__👀 ONE TO WATCH__**\n`;
  if (data.oneToWatch) {
    const handle = (data.oneToWatch.tiktok_username || '').replace('@', '');
    const url = getTikTokUrl(data.oneToWatch.tiktok_username, data.oneToWatch.video_id);
    msg += `> @${handle} — ${url || 'Link unavailable'}\n`;
    msg += `> Posted ${data.oneToWatch.hoursAgo} hours ago. Already at **${formatCurrency(data.oneToWatch.gmv)}** and climbing.\n`;
  } else {
    msg += `> No trending videos to highlight today.\n`;
  }

  msg += `\n${DIV}\n\n`;
  msg += `Let's get it today. 🔥`;

  return msg;
}

