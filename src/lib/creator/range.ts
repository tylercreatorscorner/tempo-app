import { resolveDateRange, DATE_PRESETS } from '@/lib/data/date-utils';
import { getDataAnchorDate } from '@/lib/data/data-anchor';

export interface CreatorRange {
  window: { start: string; end: string };
  rangeLabel: string;
}

/** e.g. "7/1" — for the custom-range label. */
function fmtShort(iso: string) {
  const [, m, d] = iso.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

/**
 * Resolve the creator-portal date window + a display label from URL params,
 * using the SAME preset/custom-range system as the admin (date-utils), defaulting
 * to Last 30 Days (a slow week at 7d reads as broken for big creators).
 */
export async function resolveCreatorRange(sp: {
  range?: string;
  start?: string;
  end?: string;
}): Promise<CreatorRange> {
  // Async since 2026-08-24: rolling windows end at the last day with data, not
  // calendar yesterday. A creator looking at "Last 30 Days" while ingest was
  // three days behind was being shown 27 days of posting effort under a 30-day
  // label, and judged against a full 30-day prior window. Global anchor here —
  // a creator's rows come from the same ingest as everyone else's, and this
  // page has no brand selection to scope to.
  const dataThrough = await getDataAnchorDate();
  const { startDate, endDate, preset, lagDays } =
    resolveDateRange(sp.range ?? 'last30', sp.start, sp.end, dataThrough);
  const baseLabel =
    preset === 'custom'
      ? `${fmtShort(startDate)} to ${fmtShort(endDate)}`
      : DATE_PRESETS.find((p) => p.value === preset)?.label ?? 'Last 30 Days';
  return {
    window: { start: startDate, end: endDate },
    // The label must move with the window. Shifting the dates silently is the
    // same defect as not shifting them at all.
    rangeLabel: lagDays > 0 && preset !== 'custom'
      ? `${baseLabel} (through ${fmtShort(endDate)})`
      : baseLabel,
  };
}
