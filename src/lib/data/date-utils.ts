import { subDays, startOfMonth, endOfMonth, subMonths, format, isValid, parseISO, differenceInDays } from 'date-fns';
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
 * - dataThrough: the last date that actually HAS data, from getDataAnchorDate()
 *
 * Returns the canonical { startDate, endDate, preset } the rest of the app keys off.
 *
 * ── Why dataThrough exists ──────────────────────────────────────────────────
 *
 * This function used to end every rolling window on calendar yesterday, with
 * the comment "Never include today, data is always delayed". That hardcodes a
 * ONE day allowance. TikTok routinely runs further behind: on 2026-08-24, 18
 * of 19 brands had data only through 08-21, three days back.
 *
 * The damage is not cosmetic. The trailing days are not merely blank, they
 * silently shorten the window while the PRIOR window stays full length, so
 * every period-over-period figure compares a short window against a long one
 * and reports the difference as performance. Measured on Lemme that morning:
 *
 *     Last 7 Days, calendar-anchored   5 days of data   $98,523.49   -67.9%
 *     Last 7 Days, data-anchored       7 days of data  $172,964.25   -54.0%
 *
 * $74,441 of real GMV missing and the decline overstated by 14 points, with
 * nothing on screen to say the window was short.
 *
 * So a rolling window ends at the ANCHOR: calendar yesterday, or the last
 * uploaded day when ingest is behind. "Last 7 Days" SHIFTS to 08-15..08-21
 * rather than truncating to 08-17..08-21, so it is always seven days of real
 * data measured against seven days of real data.
 *
 * ⚠️ Pass the anchor from the SELECTED brand scope, never per-brand inside a
 * multi-brand total. cosrx was 32 days stale on that same date; anchoring it
 * to its own last upload would have summed July cosrx into an August total.
 * Scoped to the whole selection, cosrx reads zero and the stale-brand banner
 * is what flags it, which is the honest outcome.
 *
 * ⚠️ NOT for freshness or coverage surfaces. /upload and the coverage ledger
 * exist to reveal missing days; anchoring them past the gap hides the thing
 * they are for. See [[project_coverage_ledger]]. Invoicing stays on calendar
 * months because those are contractual.
 *
 * Omitting dataThrough (or passing null, which is what a failed anchor lookup
 * returns) preserves the original calendar behaviour exactly.
 */
export function resolveDateRange(
  preset?: string | null,
  customStart?: string | null,
  customEnd?: string | null,
  dataThrough?: string | null,
): { startDate: string; endDate: string; preset: DatePreset; anchorDate: string; lagDays: number } {
  // Custom range path — must have valid ISO start AND end, with start <= end
  const now = toZonedTime(new Date(), APP_TIMEZONE);
  const calendarYesterday = subDays(now, 1);

  // The newest day a window may honestly end on. Never later than calendar
  // yesterday, and never later than the data itself.
  const parsedAnchor = dataThrough && ISO_DATE.test(dataThrough) ? parseISO(dataThrough) : null;
  const anchor = parsedAnchor && isValid(parsedAnchor) && parsedAnchor < calendarYesterday
    ? parsedAnchor
    : calendarYesterday;
  const lagDays = differenceInDays(calendarYesterday, anchor);
  const anchorDate = format(anchor, 'yyyy-MM-dd');

  // An explicit range is the user's own claim about what they want to see and
  // is never shifted. It still reports the anchor so the UI can say how much
  // of the chosen range has data behind it.
  if (preset === 'custom' && customStart && customEnd && ISO_DATE.test(customStart) && ISO_DATE.test(customEnd)) {
    const s = parseISO(customStart);
    const e = parseISO(customEnd);
    if (isValid(s) && isValid(e) && s <= e) {
      return {
        startDate: format(s, 'yyyy-MM-dd'),
        endDate: format(e, 'yyyy-MM-dd'),
        preset: 'custom',
        anchorDate,
        lagDays,
      };
    }
  }

  const p = (preset && DATE_PRESETS.some(d => d.value === preset) ? preset : 'last7') as DatePreset;

  let start: Date;
  let end: Date = anchor;

  switch (p) {
    case 'yesterday':
      // "Yesterday" means the latest day there is something to look at.
      start = anchor;
      end = anchor;
      break;
    case 'last7':
      start = subDays(anchor, 6); // 7 days of data ending at the anchor
      break;
    case 'last14':
      start = subDays(anchor, 13);
      break;
    case 'last30':
      start = subDays(anchor, 29);
      break;
    case 'thisMonth':
      // Calendar-named, so the month itself is not shifted; only the end is
      // clamped. A brand dark since before the 1st collapses to a single empty
      // day rather than silently displaying LAST month under this month's name.
      start = startOfMonth(now);
      break;
    case 'lastMonth': {
      const lm = subMonths(now, 1);
      start = startOfMonth(lm);
      end = endOfMonth(lm);
      break;
    }
    default:
      start = subDays(anchor, 6);
  }

  // Calendar presets set their own end, so clamp once here rather than in each
  // branch. Guard the inversion this can create for a brand that went dark
  // before the period began.
  if (end > anchor) end = anchor;
  if (end < start) end = start;

  return {
    startDate: format(start, 'yyyy-MM-dd'),
    endDate: format(end, 'yyyy-MM-dd'),
    preset: p,
    anchorDate,
    lagDays,
  };
}
