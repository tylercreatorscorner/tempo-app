import type { HistoryDay } from '@/lib/data/creator-performance-history-model';
export function shiftDay(value: string, days: number) {
  const date = new Date(value + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function summarizeWeek(rows: HistoryDay[]) {
  const metric = (key: 'gmv' | 'posts') => {
    const recorded = rows.filter(r => r[key] !== null && r[key] !== '' && Number.isFinite(Number(r[key])));
    return { value: recorded.length ? recorded.reduce((sum, r) => sum + Number(r[key]), 0) : null, days: recorded.length };
  };
  return { gmv: metric('gmv'), posts: metric('posts'), activeDays: rows.filter(r => r.posts !== null && Number(r.posts) > 0).length,
    through: rows.filter(r => r.gmv !== null || r.posts !== null).at(-1)?.stat_date ?? null };
}
export function compareWeeks(current: ReturnType<typeof summarizeWeek>, previous: ReturnType<typeof summarizeWeek>) {
  const delta = (key: 'gmv' | 'posts') => {
    const a = current[key], b = previous[key];
    if (a.days !== 7 || b.days !== 7 || a.value === null || b.value === null) return null;
    return { amount: a.value - b.value, percent: b.value === 0 ? null : (a.value - b.value) / b.value * 100 };
  };
  const gmv = delta('gmv'), posts = delta('posts');
  const signal = current.posts.days === 7 && current.posts.value === 0 ? 'No recorded posts'
    : posts && posts.amount < 0 ? 'Posting declined'
    : gmv && gmv.percent !== null && gmv.percent <= -20 ? 'GMV declined'
    : gmv && gmv.amount > 0 ? 'GMV increased'
    : current.gmv.days < 7 || current.posts.days < 7 ? 'Coverage incomplete' : 'Steady activity';
  return { gmv, posts, signal };
}
export type EliteRow = { id: string; name: string; avatar: string | null; current: ReturnType<typeof summarizeWeek>; previous: ReturnType<typeof summarizeWeek>; change: ReturnType<typeof compareWeeks>; days: HistoryDay[]; unavailable: boolean };
export type EliteBrief = { brand: string; week: string; end: string; previousStart: string; rows: EliteRow[]; unmatched: number };
