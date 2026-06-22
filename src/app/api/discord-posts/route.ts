import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { throttle } from '@/lib/rate-limit';
import {
  getWhatsCookingData,
  getWhosCookingData,
  getDailyDropData,
  formatWhatsCookingDiscord,
  formatWhosCookingDiscord,
  formatDailyDropDiscord,
} from '@/lib/data/discord-posts';
import { BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';

const VALID_TYPES = new Set([
  'whats-cooking', 'whos-cooking', 'daily-drop',
]);

export async function GET(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (!throttle(`discord-posts:${scope.userId}`, 3000)) {
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
  // Managers may only generate posts for one of their own brands.
  if (scope.brandScope.kind === 'scoped'
    && (brand === 'all' || !scope.brandScope.brandSlugs.includes(brand))) {
    return NextResponse.json(
      { error: 'Select one of your brands to generate a post' }, { status: 403 });
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
    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }
  } catch (err: unknown) {
    console.error('Discord posts API error:', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
