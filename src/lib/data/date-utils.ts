import { subDays, startOfMonth, endOfMonth, subMonths, format, isValid, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const APP_TIMEZONE = 'America/Chicago'; // Dallas, TX (Central Time)

export type DatePreset = 'yesterday' | 'last7' | 'last14' | 'last30' | 'thisMonth' | 'lastMonth' | 'custom';

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last14', label: 'Last 14 Days' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Resolve a date range from URL params.
 * - preset: one of the DATE_PRESETS values, or 'custom' to use customStart/customEnd
 * - customStart, customEnd: ISO date strings (yyyy-MM-dd) — only honored when preset === 'custom'
 *
 * Returns the canonical { startDate, endDate, preset } the rest of the app keys off.
 */
export function resolveDateRange(
  preset?: string | null,
  customStart?: string | null,
  customEnd?: string | null,
): { startDate: string; endDate: string; preset: DatePreset } {
  // Custom range path — must have valid ISO start AND end, with start <= end
  if (preset === 'custom' && customStart && customEnd && ISO_DATE.test(customStart) && ISO_DATE.test(customEnd)) {
    const s = parseISO(customStart);
    const e = parseISO(customEnd);
    if (isValid(s) && isValid(e) && s <= e) {
      return {
        startDate: format(s, 'yyyy-MM-dd'),
        endDate: format(e, 'yyyy-MM-dd'),
        preset: 'custom',
      };
    }
  }

  const p = (preset && DATE_PRESETS.some(d => d.value === preset) ? preset : 'last7') as DatePreset;
  const now = toZonedTime(new Date(), APP_TIMEZONE);
  const yesterday = subDays(now, 1);

  let start: Date;
  let end: Date = yesterday; // Never include today, data is always delayed

  switch (p) {
    case 'yesterday':
      start = yesterday;
      end = yesterday;
      break;
    case 'last7':
      start = subDays(yesterday, 6); // 7 days ending yesterday
      break;
    case 'last14':
      start = subDays(yesterday, 13); // 14 days ending yesterday
      break;
    case 'last30':
      start = subDays(yesterday, 29); // 30 days ending yesterday
      break;
    case 'thisMonth':
      start = startOfMonth(now);
      break;
    case 'lastMonth': {
      const lm = subMonths(now, 1);
      start = startOfMonth(lm);
      end = endOfMonth(lm);
      break;
    }
    default:
      start = subDays(now, 7);
  }

  return {
    startDate: format(start, 'yyyy-MM-dd'),
    endDate: format(end, 'yyyy-MM-dd'),
    preset: p,
  };
}
