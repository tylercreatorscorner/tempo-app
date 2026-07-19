import { resolveDateRange, DATE_PRESETS } from '@/lib/data/date-utils';

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
export function resolveCreatorRange(sp: {
  range?: string;
  start?: string;
  end?: string;
}): CreatorRange {
  const { startDate, endDate, preset } = resolveDateRange(sp.range ?? 'last30', sp.start, sp.end);
  return {
    window: { start: startDate, end: endDate },
    rangeLabel:
      preset === 'custom'
        ? `${fmtShort(startDate)} to ${fmtShort(endDate)}`
        : DATE_PRESETS.find((p) => p.value === preset)?.label ?? 'Last 30 Days',
  };
}
