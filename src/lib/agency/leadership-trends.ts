import { agencyMonthBounds, calculateServiceRevenue, summarizeClientRetention, type ClientRecord } from './model';

export interface TrendSource {
  month: string;
  clients: ClientRecord[];
  performance: Array<{ brandId: string; managedGmv: number | null; complete: boolean }>;
}
export function recentAgencyMonths(month: string, count = 6): string[] {
  agencyMonthBounds(month);
  if (!Number.isInteger(count) || count < 1 || count > 12) throw new Error('Invalid history length.');
  const [year, part] = month.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => new Date(Date.UTC(year, part - count + i, 1)).toISOString().slice(0, 7)).filter(value => value >= '2000-01');
}
/** Latest client revisions reconstruct history; these are calculations, never frozen invoice totals. */
export function summarizeAgencyTrend(source: TrendSource) {
  const bounds = agencyMonthBounds(source.month);
  let calculated = 0, eligible = 0;
  let total = BigInt(0);
  for (const client of source.clients) {
    const linked = client.brandIds.map(id => source.performance.find(row => row.brandId === id));
    const complete = linked.length > 0 && linked.every(row => row?.complete && row.managedGmv !== null && Number.isFinite(row.managedGmv));
    const gmv = complete ? linked.reduce((sum, row) => sum + Math.round(row!.managedGmv! * 100), 0) : null;
    const result = calculateServiceRevenue({ client, month: source.month, periodStart: bounds.start, periodEnd: bounds.end, gmvCents: gmv, gmvComplete: complete });
    if (result.status !== 'outside_service') eligible++;
    if (result.status === 'calculated' && result.revenueCents !== null) { calculated++; total += BigInt(result.revenueCents); }
  }
  const safe = total <= BigInt(Number.MAX_SAFE_INTEGER);
  return { month: source.month, calculated, eligible, calculatedCents: calculated && safe ? Number(total) : null,
    partial: calculated < eligible, retention: summarizeClientRetention(source.clients, source.month) };
}

/** Recorded ledger activity only; invoice and cash dates may differ from service month. */
export function summarizeBillingTimeline(data: import('./billing-types').BillingResponse, months: string[]) {
  const totals = new Map(months.map(month => [month, { reviewedCents: 0, reviewedCount: 0, invoicedCents: 0, invoiceEvents: 0, receivedCents: 0, receiptEvents: 0 }]));
  for (const item of data.records) {
    const target = totals.get(item.month);
    if (target) { target.reviewedCents += item.record.review.reviewedCents; target.reviewedCount++; }
  }
  const previous = new Map<string, import('./billing-types').AgencyBillingRecord>();
  for (const item of [...data.history].sort((a, b) => a.revision - b.revision)) {
    const key = `${item.clientId}:${item.month}`, prior = previous.get(key);
    const event = item.events.find(value => value.revision === item.revision);
    if (!event || (prior ? item.revision !== prior.revision + 1 : item.revision !== 1)) throw new Error('Billing history is incomplete.');
    let date: string | undefined, cents = 0, category: 'invoice' | 'receipt' | null = null;
    if (event.action === 'invoice' && item.record.invoice) { date = item.record.invoice.issuedOn; cents = item.record.invoice.amountCents; category = 'invoice'; }
    if (event.action === 'void_invoice' && prior?.record.invoice) { date = event.effectiveOn; cents = -prior.record.invoice.amountCents; category = 'invoice'; }
    if (event.action === 'receipt') {
      const added = item.record.receipts.filter(receipt => !prior?.record.receipts.some(old => old.id === receipt.id));
      if (added.length !== 1) throw new Error('Receipt history is incomplete.');
      date = added[0].receivedOn; cents = added[0].amountCents; category = 'receipt';
    }
    if (event.action === 'reverse_receipt') {
      const removed = prior?.record.receipts.find(receipt => receipt.id === event.receiptId);
      if (!removed) throw new Error('Receipt reversal history is incomplete.');
      date = event.effectiveOn; cents = -removed.amountCents; category = 'receipt';
    }
    if (category && !date) throw new Error('Billing activity date is missing.');
    const target = date ? totals.get(date.slice(0, 7)) : undefined;
    if (target && category === 'invoice') { target.invoicedCents += cents; target.invoiceEvents++; }
    if (target && category === 'receipt') { target.receivedCents += cents; target.receiptEvents++; }
    previous.set(key, item);
  }
  if (previous.size !== data.records.length || data.records.some(item => previous.get(`${item.clientId}:${item.month}`)?.revision !== item.revision)) throw new Error('Billing history does not match current records.');
  for (const row of totals.values()) if (![row.reviewedCents, row.invoicedCents, row.receivedCents].every(Number.isSafeInteger)) throw new Error('Billing totals exceed supported precision.');
  return totals;
}
