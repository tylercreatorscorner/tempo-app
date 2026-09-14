import type { PerformancePoint } from '@/components/creators/performance/model';
export interface HistoryDay { stat_date: string; gmv: number | string | null; posts: number | string | null }
const DAY = 86_400_000;

/** Calendar arithmetic without timezone drift or silent range truncation. */
export function historyDays(start: string, end: string): string[] {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!valid(start) || !valid(end)) return [];
  const first = Date.parse(start), count = (Date.parse(end) - first) / DAY + 1;
  if (count < 1 || count > 366) return [];
  return Array.from({ length: count }, (_, i) => new Date(first + i * DAY).toISOString().slice(0, 10));
}

export function historyPoints(days: string[], rows: HistoryDay[]): PerformancePoint[] {
  const monthly = days.length > 62;
  const groups = new Map<string, { dates: string[]; gmv: number | null; posts: number | null }>();
  const number = (value: number | string | null) => value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  for (const row of rows) {
    const key = monthly ? row.stat_date.slice(0, 7) : row.stat_date;
    const group = groups.get(key) ?? { dates: [], gmv: 0, posts: 0 };
    const gmv = number(row.gmv), posts = number(row.posts);
    group.dates.push(row.stat_date);
    group.gmv = group.gmv === null || gmv === null ? null : group.gmv + gmv;
    group.posts = group.posts === null || posts === null || !Number.isInteger(posts) || posts < 0 ? null : group.posts + posts;
    groups.set(key, group);
  }
  if (rows.every(row => row.gmv === null && row.posts === null)) return [];
  const format = (date: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(date));
  return [...groups].map(([key, group]) => ({ key,
    axisLabel: new Intl.DateTimeFormat('en-US', { month: 'short', ...(monthly ? { year: 'numeric' as const } : { day: 'numeric' as const }), timeZone: 'UTC' }).format(new Date(group.dates[0])),
    label: monthly ? `${format(group.dates[0])}–${format(group.dates[group.dates.length - 1])}` : format(key),
    gmv: group.gmv, posts: group.posts,
  }));
}
