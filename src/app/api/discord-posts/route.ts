import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { throttle } from '@/lib/rate-limit';
import {
  getWhatsCookingData,
  getWhosCookingData,
  getDailyDropData,
  formatWhatsCookingDiscord,
  formatWhosCookingDiscord,
  formatWhosCookingSlack,
  formatDailyDropDiscord,
  formatDailyDropSlack,
  getMoversData,
  formatMoversDiscord,
  getMtdData,
  formatMtdDiscord,
  type WhosCookingFormat,
} from '@/lib/data/discord-posts';
import { getBrandRegistry, brandLabel } from '@/lib/data/brand-registry';

const VALID_TYPES = new Set([
  'whats-cooking', 'whos-cooking', 'daily-drop', 'movers', 'mtd',
]);

// Post data comes from aggregate RPCs, but a cold cache can still make the
// slowest one crawl; give the function headroom beyond the default limit.
export const runtime = 'nodejs';
export const maxDuration = 60;

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
  // Who's Cooking dual format (v3 mockup): 'highlights' (default) | 'classic'.
  // Only meaningful for type=whos-cooking; ignored for the other types.
  const format = (searchParams.get('format') || 'highlights') as WhosCookingFormat;

  if (!VALID_TYPES.has(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }
  if (period !== '7d' && period !== '30d') {
    return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
  }
  if (type === 'whos-cooking' && format !== 'highlights' && format !== 'classic') {
    return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
  }
  // Managers may only generate posts for one of their own brands.
  if (scope.brandScope.kind === 'scoped'
    && (brand === 'all' || !scope.brandScope.brandSlugs.includes(brand))) {
    return NextResponse.json(
      { error: 'Select one of your brands to generate a post' }, { status: 403 });
  }

  const reg = await getBrandRegistry();
  const brandName = brand === 'all'
    ? 'All Brands'
    : brandLabel(reg, brand);

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
      const text = formatWhosCookingDiscord(data, brandName, period, format);
      const slackText = formatWhosCookingSlack(data, brandName, period, format);
      // Full map (not just leaderboard rows) so rookie/so-close mentions in the
      // preview resolve too.
      const mentionMap: Record<string, string> = {};
      data.discordMap.forEach((v) => {
        if (v.discord_id && v.discord_name) mentionMap[v.discord_id] = v.discord_name;
      });
      return NextResponse.json({
        text,
        slackText,
        format,
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
      const slackText = formatDailyDropSlack(data, brandName);
      const mentionMap: Record<string, string> = {};
      data.discordMap.forEach((v) => {
        if (v.discord_id && v.discord_name) mentionMap[v.discord_id] = v.discord_name;
      });
      return NextResponse.json({
        text,
        slackText,
        mentionMap,
        stats: {
          totalGmv: data.yesterdayGmv,
          videoCount: data.topVideos.length,
          creatorCount: data.topCreators.length,
        },
      });
    } else if (type === 'movers') {
      const data = await getMoversData(brand, period);
      const text = formatMoversDiscord(data, brandName, period);
      const mentionMap: Record<string, string> = {};
      data.discordMap.forEach((v) => {
        if (v.discord_id && v.discord_name) mentionMap[v.discord_id] = v.discord_name;
      });
      return NextResponse.json({
        text,
        mentionMap,
        stats: {
          // No period total here — Movers is a growth board, and summing the
          // top ten's GMV would read as "the brand did this", which is false.
          totalGmv: data.movers.reduce((s, m) => s + m.delta, 0),
          videoCount: 0,
          creatorCount: data.eligibleCount,
        },
      });
    } else if (type === 'mtd') {
      // MTD is a calendar-month board — the 7d/30d selector does not apply.
      const data = await getMtdData(brand);
      const text = formatMtdDiscord(data, brandName);
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
    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }
  } catch (err: unknown) {
    console.error('Discord posts API error:', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
