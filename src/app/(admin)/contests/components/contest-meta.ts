import { formatCurrency, formatNumber } from '@/lib/utils/format';
import type { ContestRow } from '@/lib/contests/types';

/**
 * Pure display helpers for the Contests surface. Everything here derives from
 * the shared contest contract types — no fetching, no React.
 */

export type ContestGroup = 'live' | 'upcoming' | 'settled';

export const SCORING_META: Record<ContestRow['scoring'], { label: string; description: string }> = {
  gmv: { label: 'GMV', description: 'Most sales in the window. Scores itself.' },
  posts: { label: 'Posts', description: 'Most posts in the window. Scores itself.' },
  raffle: { label: 'Raffle', description: 'Entries accrue from activity. Draw ships next phase.' },
  manual: { label: 'Manual', description: 'You pick the winner. For judged contests.' },
};

export const RAFFLE_RULE_OPTIONS: Array<{
  value: NonNullable<ContestRow['raffle_entry_rule']>;
  label: string;
}> = [
  { value: 'per_posting_day', label: '1 entry per posting day' },
  { value: 'per_post', label: '1 entry per post' },
  { value: 'per_gmv_step', label: '1 entry per $X of GMV' },
  { value: 'one_per_creator', label: '1 entry per creator' },
];

/** Human label for a contest's raffle rule, with the $ step filled in. */
export function raffleRuleLabel(contest: ContestRow): string | null {
  if (!contest.raffle_entry_rule) return null;
  if (contest.raffle_entry_rule === 'per_gmv_step') {
    return `1 entry per ${formatCurrency(contest.raffle_gmv_step ?? 100)} of GMV`;
  }
  return RAFFLE_RULE_OPTIONS.find((o) => o.value === contest.raffle_entry_rule)?.label ?? null;
}

/**
 * Today as yyyy-MM-dd on the OPERATOR'S LOCAL calendar — deliberately not UTC.
 * Grouping and "ended" checks compare against this: with UTC, a contest still
 * on its final evening (e.g. 7pm CDT) would flip to "Ended — settle" and
 * suppress the early-settle warning hours early. Stored date STRINGS are still
 * rendered UTC-safe (displayDate/windowLabel) — only "now" is local.
 */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * List grouping. Live = launched and window open, OR ended-but-unsettled
 * ('closed' rows and past-window 'live' rows stay here with an "ended — settle"
 * chip until they're actually settled). Upcoming = drafts + launched contests
 * whose window hasn't opened.
 */
export function groupOf(contest: ContestRow, today: string): ContestGroup {
  if (contest.status === 'settled') return 'settled';
  if (contest.status === 'draft') return 'upcoming';
  if (contest.window_start.slice(0, 10) > today) return 'upcoming';
  return 'live';
}

/** The window is over but the contest hasn't settled — surface the settle nudge. */
export function windowEnded(contest: ContestRow, today: string): boolean {
  return contest.window_end.slice(0, 10) < today;
}

function utcDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

/** "Jul 15 – Jul 31" (years shown only when not the current year). */
export function windowLabel(start: string, end: string): string {
  const now = new Date().getUTCFullYear();
  const fmt = (iso: string) => {
    const d = utcDate(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(d.getUTCFullYear() !== now ? { year: 'numeric' as const } : {}),
      timeZone: 'UTC',
    });
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

/** "Jul 23, 2026" — UTC-rendered so a date-only string never shifts a day. */
export function displayDate(iso: string): string {
  return utcDate(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "6d 14h" until the END of the (inclusive) last window day in the operator's
 *  LOCAL timezone (consistent with todayIso-based grouping); null once past. */
export function closesIn(endIso: string): string | null {
  const [y, m, d] = endIso.slice(0, 10).split('-').map(Number);
  const end = new Date(y, m - 1, d, 23, 59, 59).getTime();
  const ms = end - Date.now();
  if (ms <= 0) return null;
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  return days > 0 ? `${days}d ${hours}h` : `${Math.max(hours, 1)}h`;
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", … */
export function placeLabel(place: number): string {
  const v = place % 100;
  const suffix =
    v >= 11 && v <= 13 ? 'th' : place % 10 === 1 ? 'st' : place % 10 === 2 ? 'nd' : place % 10 === 3 ? 'rd' : 'th';
  return `${place}${suffix}`;
}

export function sortedPrizes(prizes: ContestRow['prizes']): ContestRow['prizes'] {
  return [...(prizes ?? [])].sort((a, b) => a.place - b.place);
}

/** "$1,000 · 1st place" or "$1,000 · 1st +2 more" for multi-place. */
export function prizeSummary(prizes: ContestRow['prizes']): string {
  const sorted = sortedPrizes(prizes);
  if (sorted.length === 0) return '—';
  const top = sorted[0];
  if (sorted.length === 1) return `${top.label} · ${placeLabel(top.place)} place`;
  return `${top.label} · ${placeLabel(top.place)} +${sorted.length - 1} more`;
}

/** Score formatted per scoring mode: $ for GMV, counts for posts, entries for raffle. */
export function formatScore(scoring: ContestRow['scoring'], score: number): string {
  switch (scoring) {
    case 'gmv':
      return formatCurrency(score);
    case 'posts':
      return `${formatNumber(score)} ${score === 1 ? 'post' : 'posts'}`;
    case 'raffle':
      return `${formatNumber(score)} ${score === 1 ? 'entry' : 'entries'}`;
    default:
      return formatNumber(score);
  }
}

/** Sum of the cash amounts attached to prizes (label-only places contribute 0). */
export function totalPrizeCash(prizes: ContestRow['prizes']): number {
  return (prizes ?? []).reduce((sum, p) => sum + (p.amount ?? 0), 0);
}
