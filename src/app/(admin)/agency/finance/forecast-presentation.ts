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

/** Group repeated monthly gaps without hiding the exact month that needs attention. */
export function groupForecastGaps(gaps: ForecastGap[]) {
  const clients = new Map<string, { clientId: string; clientName: string; issues: { message: string; months: ForecastGap[] }[] }>();
  for (const gap of gaps) {
    let client = clients.get(gap.clientId);
    if (!client) {
      client = { clientId: gap.clientId, clientName: gap.clientName, issues: [] };
      clients.set(gap.clientId, client);
    }
    let issue = client.issues.find(value => value.message === gap.message);
    if (!issue) { issue = { message: gap.message, months: [] }; client.issues.push(issue); }
    issue.months.push(gap);
  }
  return [...clients.values()];
}
