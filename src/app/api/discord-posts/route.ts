import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { throttle } from '@/lib/rate-limit';
import {
  getWhatsCookingData,
  getWhosCookingData,
  getDailyDropData,
  getWeeklyWrapData,
  getMonthlyRecapData,
  getBrandClientUpdateData,
  formatWhatsCookingDiscord,
  formatWhosCookingDiscord,
  formatDailyDropDiscord,
  formatWeeklyWrapDiscord,
  formatMonthlyRecapDiscord,
  formatBrandClientUpdateSlack,
} from '@/lib/data/discord-posts';
import { BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';

const VALID_TYPES = new Set([
  'whats-cooking', 'whos-cooking', 'daily-drop',
  'weekly-wrap', 'monthly-recap', 'brand-client-update',
]);

export async function GET(request: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (!throttle(`discord-posts:${profile.user_id}`, 3000)) {
    return NextResponse.json({ error: 'Too many requests, please wait a moment' }, { status: 429 });
  }

  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type') || 'whats-cooking';
  const brand = searchParams.get('brand') || 'all';
  const period = (searchParams.get('period') || '7d') as '7d' | '30d';

  if (!VALID_TYPES.has(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }
  if (period !== '7d' && period !== '30d') {
    return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
  }

  const brandName = brand === 'all'
    ? 'All Brands'
    : BRAND_DISPLAY_NAMES[brand] || brand;

  try {
    if (type === 'whats-cooking') {
      const data = await getWhatsCookingData(brand, period);
      const text = formatWhatsCookingDiscord(data, brandName, period);
      const mentionMap: Record<string, string> = {};
      data.discordMap.forEach((v) => {
        if (v.discord_id && v.discord_name) mentionMap[v.discord_id] = v.discord_name;
      });
      return NextResponse.json({
        text,
        mentionMap,
        stats: {
          totalGmv: data.totalGmv,
          videoCount: data.videoCount,
          creatorCount: data.creatorCount,
        },
      });
    } else if (type === 'whos-cooking') {
      const data = await getWhosCookingData(brand, period);
      const text = formatWhosCookingDiscord(data, brandName, period);
      const mentionMap: Record<string, string> = {};
      data.leaderboard.forEach(c => {
        if (c.discord_id && c.discord_name) mentionMap[c.discord_id] = c.discord_name;
      });
      return NextResponse.json({
        text,
        mentionMap,
        stats: {
          totalGmv: data.totalGmv,
          videoCount: data.videoCount,
          creatorCount: data.creatorCount,
        },
      });
    } else if (type === 'daily-drop') {
      const data = await getDailyDropData(brand);
      const text = formatDailyDropDiscord(data, brandName);
      const mentionMap: Record<string, string> = {};
      data.discordMap.forEach((v) => {
        if (v.discord_id && v.discord_name) mentionMap[v.discord_id] = v.discord_name;
      });
      return NextResponse.json({
        text,
        mentionMap,
        stats: {
          totalGmv: data.yesterdayGmv,
          videoCount: data.topVideos.length,
          creatorCount: data.topCreators.length,
        },
      });
    } else if (type === 'weekly-wrap') {
      const data = await getWeeklyWrapData(brand);
      const text = formatWeeklyWrapDiscord(data, brandName);
      const mentionMap: Record<string, string> = {};
      data.discordMap.forEach((v) => {
        if (v.discord_id && v.discord_name) mentionMap[v.discord_id] = v.discord_name;
      });
      return NextResponse.json({
        text,
        mentionMap,
        stats: {
          totalGmv: data.weekTotal,
          videoCount: data.hotVideos.length,
          creatorCount: data.topCreators.length,
        },
      });
    } else if (type === 'monthly-recap') {
      const data = await getMonthlyRecapData(brand);
      const text = formatMonthlyRecapDiscord(data, brandName);
      const mentionMap: Record<string, string> = {};
      data.discordMap.forEach((v) => {
        if (v.discord_id && v.discord_name) mentionMap[v.discord_id] = v.discord_name;
      });
      return NextResponse.json({
        text,
        mentionMap,
        stats: {
          totalGmv: data.monthTotal,
          videoCount: data.bestVideo ? 1 : 0,
          creatorCount: data.topCreators.length,
        },
      });
    } else if (type === 'brand-client-update') {
      // Always Slack-formatted; client-facing weekly recap.
      const data = await getBrandClientUpdateData(brand);
      const text = formatBrandClientUpdateSlack(data, brandName);
      return NextResponse.json({
        text,
        mentionMap: {},
        stats: {
          totalGmv: data.weekTotal,
          videoCount: data.videoCount,
          creatorCount: data.creatorCount,
        },
      });
    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }
  } catch (err: unknown) {
    console.error('Discord posts API error:', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
