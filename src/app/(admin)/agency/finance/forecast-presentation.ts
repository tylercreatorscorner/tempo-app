import type { CashEvent, ForecastGap } from '@/lib/agency/finance-model';

/** A configured zero produces an event; missing setup by itself cannot establish zero. */
export function forecastAmountsAvailable(result: { events: CashEvent[]; missing: string[] }) {
  return result.events.length > 0 || result.missing.length === 0;
}

export function forecastSetupHref(gap: ForecastGap) {
  const section = gap.message.includes('creator roster') ? 'creator-billing' : gap.message.includes('GMV estimate') ? 'gmv-estimates' : 'overview';
  const params = new URLSearchParams({ client: gap.clientId, month: gap.month, section });
  return `/agency/finance?${params}`;
}
