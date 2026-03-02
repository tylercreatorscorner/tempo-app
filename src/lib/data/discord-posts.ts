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
  // Query creators_v2 joined with tiktok_accounts
  let query = supabase
    .from('tiktok_accounts')
    .select('tiktok_username, creator:creators_v2!inner(discord_id, discord_name)');

  if (brandUuids) {
    query = query.in('brand_id', brandUuids);
  }

  const { data } = await query;
  const map = new Map<string, { discord_id: string | null; discord_name: string | null }>();

  (data || []).forEach((row: any) => {
    const handle = (row.tiktok_username || '').toLowerCase().replace('@', '');
    if (handle && row.creator) {
      map.set(handle, {
        discord_id: row.creator.discord_id,
        discord_name: row.creator.discord_name,
      });
    }
  });

  return map;
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

  // Fetch video stats - aggregate by video_id
  let query = supabase
    .from('daily_video_stats')
    .select('video_id, video_url, video_title, tiktok_username, gmv, orders, post_date, brand_id, report_date')
    .gte('report_date', fullStartDate)
    .lte('report_date', endDate);

  if (brandUuids) {
    query = query.in('brand_id', brandUuids);
  }

  const { data: rawData, error } = await query;
  if (error) throw error;

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

  // Current period data
  let currentQuery = supabase
    .from('daily_creator_stats')
    .select('tiktok_username, gmv, orders, items_sold, videos, brand_id, report_date')
    .gte('report_date', currentStart)
    .lte('report_date', endDate);

  if (brandUuids) {
    currentQuery = currentQuery.in('brand_id', brandUuids);
  }

  const { data: currentData, error: currentError } = await currentQuery;
  if (currentError) throw currentError;

  // Prior period data
  let priorQuery = supabase
    .from('daily_creator_stats')
    .select('tiktok_username, gmv, brand_id, report_date')
    .gte('report_date', priorStart)
    .lt('report_date', priorEnd);

  if (brandUuids) {
    priorQuery = priorQuery.in('brand_id', brandUuids);
  }

  const { data: priorData } = await priorQuery;

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
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const periodLabel = period === '30d' ? 'Monthly performance' : 'Performance from the last 7 days';

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

  let text = `🍳 **What's Cooking?** | ${brandName} | ${dateStr}\n`;
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
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const periodLabel = period === '30d' ? 'Top performers this month' : 'Top performers from the last 7 days';
  const comparisonLabel = period === '30d' ? 'from last month' : 'from last week';

  let text = `👨‍🍳 **Who's Cooking?** | ${brandName} | ${dateStr}\n`;
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
