/**
 * Pre-defined schedule frequencies. Keeping the option set small and curated keeps
 * the UI simple and avoids exposing raw cron syntax to users.
 *
 * All times resolve in Central Time (America/Chicago) — Tyler's timezone.
 */

import { addDays, addMonths, set, startOfMonth } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

const TZ = 'America/Chicago';

export const FREQUENCIES = [
  { label: 'Daily at 9 AM CT',     description: 'Every day, 9:00 AM Central' },
  { label: 'Weekly (Monday 9 AM)', description: 'Every Monday, 9:00 AM Central' },
  { label: 'Weekly (Friday 9 AM)', description: 'Every Friday, 9:00 AM Central' },
  { label: 'Monthly (1st 9 AM)',   description: '1st of each month, 9:00 AM Central' },
] as const;

export type FrequencyLabel = typeof FREQUENCIES[number]['label'];

const LABEL_SET = new Set(FREQUENCIES.map((f) => f.label));

export function isValidFrequency(label: string): label is FrequencyLabel {
  return LABEL_SET.has(label as FrequencyLabel);
}

/**
 * Compute the next run timestamp for the given frequency label.
 * `fromDate` is the reference point (defaults to now). The next run is always strictly
 * AFTER `fromDate` so back-to-back runs don't fire repeatedly on the same minute.
 */
export function nextRunFromLabel(label: string, fromDate: Date = new Date()): Date {
  const fromCT = toZonedTime(fromDate, TZ);

  // Helper to set CT time for a given day, then convert back to UTC
  const at9amCT = (d: Date): Date => {
    const ct = set(d, { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 });
    return fromZonedTime(ct, TZ);
  };

  switch (label) {
    case 'Daily at 9 AM CT': {
      const today9 = at9amCT(fromCT);
      if (today9 > fromDate) return today9;
      return at9amCT(addDays(fromCT, 1));
    }
    case 'Weekly (Monday 9 AM)':
      return nextWeekday(fromCT, fromDate, 1, at9amCT);
    case 'Weekly (Friday 9 AM)':
      return nextWeekday(fromCT, fromDate, 5, at9amCT);
    case 'Monthly (1st 9 AM)': {
      const thisMonthFirst = at9amCT(startOfMonth(fromCT));
      if (thisMonthFirst > fromDate) return thisMonthFirst;
      return at9amCT(startOfMonth(addMonths(fromCT, 1)));
    }
    default:
      // Unknown frequency — fall through to tomorrow 9am
      return at9amCT(addDays(fromCT, 1));
  }
}

/** Returns the next occurrence of the given weekday (Sun=0, Mon=1, …) at 9am CT, after `fromDate`. */
function nextWeekday(fromCT: Date, fromDate: Date, weekday: number, at9amCT: (d: Date) => Date): Date {
  const todayDow = fromCT.getDay();
  let daysAhead = (weekday - todayDow + 7) % 7;
  // If today IS the target weekday but we're already past 9am, skip to next week
  if (daysAhead === 0) {
    const today9 = at9amCT(fromCT);
    if (today9 > fromDate) return today9;
    daysAhead = 7;
  }
  return at9amCT(addDays(fromCT, daysAhead));
}
