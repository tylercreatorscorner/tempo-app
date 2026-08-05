/**
 * Drops board — runs every Discord post format for one brand in a single call.
 *
 * GET /api/drops?brand=<slug>&period=7d|30d|custom[&start=&end=]
 *
 * The board exists because four of these seven generators shipped without ever
 * being reachable from the UI, and the three that were reachable all rank by
 * absolute GMV — so the same creators won every week and the feed read stale.
 * Running them all and showing what each one FOUND is the point; picking one
 * blind from a dropdown is what made the good formats invisible.
 *
 * Every format is settled independently. One generator throwing must not take
 * the board down, so a failure becomes an error card next to five working ones
 * rather than a 500. An empty format is reported as empty, never padded.
 *
 * Only 4 formats take a custom window. Daily Drop is yesterday, Month to Date
 * is a calendar month, Milestones is "recently crossed" — a range is
 * meaningless for those, so they run on their own window and say so.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { throttle } from '@/lib/rate-limit';
import { getBrandRegistry, brandLabel } from '@/lib/data/brand-registry';
import {
  getWhatsCookingData, formatWhatsCookingDiscord,
  getWhosCookingData, formatWhosCookingDiscord,
  getDailyDropData, formatDailyDropDiscord,
  getMoversData, formatMoversDiscord,
  getMtdData, formatMtdDiscord,
  getRookieData, formatRookieDiscord,
  getMilestoneData, formatMilestonesDiscord,
  type DropWindow,
} from '@/lib/data/discord-posts';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Card order is deliberate: growth-ranked formats first, size-ranked last.
 *  The size-ranked ones are the stale-feeling ones and should not lead. */
export interface DropCard {
  id: string;
  label: string;
  /** One line on what this format surfaces, shown under the title. */
  what: string;
  /** false = ranks by absolute GMV, so it repeats the same winners. */
  growthRanked: boolean;
  /** false = ignores the range picker and uses its own window. */
  acceptsWindow: boolean;
  /** Its own window, for the formats that ignore the picker. */
  windowLabel: string;
  text: string | null;
  mentionMap: Record<string, string>;
  /** Short "n of m qualified" line. Null when the format has no pool concept. */
  qualified: string | null;
  empty: boolean;
  error: string | null;
}

const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

function mapMentions(m: Map<string, { discord_id: string | null; discord_name: string | null }>): Record<string, string> {
  const out: Record<string, string> = {};
  m.forEach((v) => { if (v.discord_id && v.discord_name) out[v.discord_id] = v.discord_name; });
  return out;
}

export async function GET(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (!throttle(`drops:${scope.userId}`, 3000)) {
    return NextResponse.json({ error: 'Too many requests, please wait a moment' }, { status: 429 });
  }

  const { searchParams } = request.nextUrl;
  const brand = searchParams.get('brand') || 'all';
  const rawPeriod = searchParams.get('period') || '7d';

  let period: '7d' | '30d' = '7d';
  let window: DropWindow | undefined;
  if (rawPeriod === 'custom') {
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    if (!isDate(start) || !isDate(end) || start > end) {
      return NextResponse.json({ error: 'A custom range needs a valid start and end date' }, { status: 400 });
    }
    window = { start, end };
    // Sub-tier thresholds inside the generators still branch on the preset;
    // pick the nearer one so a long custom range behaves like the long preset.
    const days = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000) + 1;
    period = days >= 20 ? '30d' : '7d';
  } else if (rawPeriod === '7d' || rawPeriod === '30d') {
    period = rawPeriod;
  } else {
    return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
  }

  if (scope.brandScope.kind === 'scoped'
    && (brand === 'all' || !scope.brandScope.brandSlugs.includes(brand))) {
    return NextResponse.json(
      { error: 'Select one of your brands to build a board' }, { status: 403 });
  }

  const reg = await getBrandRegistry();
  const brandName = brand === 'all' ? 'All Brands' : brandLabel(reg, brand);
  const rangeLabel = window
    ? `${window.start} to ${window.end}`
    : period === '30d' ? 'Last 30 days' : 'Last 7 days';

  // Each card settles on its own. Promise.allSettled, not all: one generator
  // failing must not blank the board.
  const built = await Promise.allSettled([
    (async (): Promise<DropCard> => {
      const d = await getMoversData(brand, period, window);
      return {
        id: 'movers', label: 'Biggest Movers',
        what: 'Ranks by growth, not size. Surfaces climbers.',
        growthRanked: true, acceptsWindow: true, windowLabel: rangeLabel,
        text: d.movers.length ? formatMoversDiscord(d, brandName, period) : null,
        mentionMap: mapMentions(d.discordMap),
        qualified: `${d.eligibleCount} of ${d.poolCount} creators cleared the floor`,
        empty: d.movers.length === 0, error: null,
      };
    })(),
    (async (): Promise<DropCard> => {
      const d = await getRookieData(brand, period, window);
      return {
        id: 'rookies', label: 'Rookies',
        what: 'First-timers inside their opening weeks.',
        growthRanked: true, acceptsWindow: true, windowLabel: rangeLabel,
        text: d.rookies.length ? formatRookieDiscord(d, brandName, period) : null,
        mentionMap: mapMentions(d.discordMap),
        qualified: `${d.rookieCount} rookie${d.rookieCount === 1 ? '' : 's'} posted in this window`,
        empty: d.rookies.length === 0, error: null,
      };
    })(),
    (async (): Promise<DropCard> => {
      const d = await getMilestoneData(brand);
      return {
        id: 'milestones', label: 'Milestones',
        what: 'Creators crossing a lifetime GMV threshold.',
        growthRanked: true, acceptsWindow: false, windowLabel: 'Last 14 days',
        text: d.milestones.length ? formatMilestonesDiscord(d, brandName) : null,
        mentionMap: mapMentions(d.discordMap),
        qualified: null,
        empty: d.milestones.length === 0, error: null,
      };
    })(),
    (async (): Promise<DropCard> => {
      const d = await getMtdData(brand);
      return {
        id: 'mtd', label: 'Month to Date',
        what: 'Standings with rank movement since last month.',
        growthRanked: true, acceptsWindow: false, windowLabel: 'This calendar month',
        text: d.leaderboard.length ? formatMtdDiscord(d, brandName) : null,
        mentionMap: mapMentions(d.discordMap),
        qualified: `${d.creatorCount} creators so far this month`,
        empty: d.leaderboard.length === 0, error: null,
      };
    })(),
    (async (): Promise<DropCard> => {
      const d = await getWhatsCookingData(brand, period, window);
      return {
        id: 'whats-cooking', label: "What's Cooking",
        what: 'Top performing videos of the window.',
        growthRanked: false, acceptsWindow: true, windowLabel: rangeLabel,
        text: d.videoCount ? formatWhatsCookingDiscord(d, brandName, period) : null,
        mentionMap: mapMentions(d.discordMap),
        qualified: `${d.videoCount} videos, ${d.creatorCount} creators`,
        empty: d.videoCount === 0, error: null,
      };
    })(),
    (async (): Promise<DropCard> => {
      const d = await getWhosCookingData(brand, period, window);
      return {
        id: 'whos-cooking', label: "Who's Cooking",
        what: 'Top creators by GMV. The familiar board.',
        growthRanked: false, acceptsWindow: true, windowLabel: rangeLabel,
        text: d.creatorCount ? formatWhosCookingDiscord(d, brandName, period, 'highlights') : null,
        mentionMap: mapMentions(d.discordMap),
        qualified: `${d.creatorCount} creators, ${d.videoCount} videos`,
        empty: d.creatorCount === 0, error: null,
      };
    })(),
    (async (): Promise<DropCard> => {
      const d = await getDailyDropData(brand);
      return {
        id: 'daily-drop', label: 'Daily Drop',
        what: 'Yesterday at a glance.',
        growthRanked: false, acceptsWindow: false, windowLabel: 'Yesterday only',
        text: formatDailyDropDiscord(d, brandName),
        mentionMap: mapMentions(d.discordMap),
        qualified: null,
        empty: d.yesterdayGmv === 0 && d.topCreators.length === 0, error: null,
      };
    })(),
  ]);

  const META: { id: string; label: string; what: string; growthRanked: boolean; acceptsWindow: boolean; windowLabel: string }[] = [
    { id: 'movers', label: 'Biggest Movers', what: 'Ranks by growth, not size. Surfaces climbers.', growthRanked: true, acceptsWindow: true, windowLabel: rangeLabel },
    { id: 'rookies', label: 'Rookies', what: 'First-timers inside their opening weeks.', growthRanked: true, acceptsWindow: true, windowLabel: rangeLabel },
    { id: 'milestones', label: 'Milestones', what: 'Creators crossing a lifetime GMV threshold.', growthRanked: true, acceptsWindow: false, windowLabel: 'Last 14 days' },
    { id: 'mtd', label: 'Month to Date', what: 'Standings with rank movement since last month.', growthRanked: true, acceptsWindow: false, windowLabel: 'This calendar month' },
    { id: 'whats-cooking', label: "What's Cooking", what: 'Top performing videos of the window.', growthRanked: false, acceptsWindow: true, windowLabel: rangeLabel },
    { id: 'whos-cooking', label: "Who's Cooking", what: 'Top creators by GMV. The familiar board.', growthRanked: false, acceptsWindow: true, windowLabel: rangeLabel },
    { id: 'daily-drop', label: 'Daily Drop', what: 'Yesterday at a glance.', growthRanked: false, acceptsWindow: false, windowLabel: 'Yesterday only' },
  ];

  const cards: DropCard[] = built.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const m = META[i];
    console.error(`[drops] ${m.id} failed:`, r.reason);
    return {
      ...m,
      text: null,
      mentionMap: {},
      qualified: null,
      empty: false,
      // Surfaced on the card. A format that broke must not look like a format
      // that simply found nothing.
      error: r.reason instanceof Error ? r.reason.message : 'Failed to build',
    };
  });

  return NextResponse.json({
    brand,
    brandName,
    rangeLabel,
    found: cards.filter((c) => c.text !== null).length,
    total: cards.length,
    cards,
  });
}
