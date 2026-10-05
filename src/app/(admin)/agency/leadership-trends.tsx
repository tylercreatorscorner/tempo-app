"use client";
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import type { AgencyBusinessResponse } from './workspace';
import type { BillingResponse } from '@/lib/agency/billing-types';
import { recentAgencyMonths, summarizeAgencyTrend, summarizeBillingTimeline } from '@/lib/agency/leadership-trends';
import styles from './leadership-trends.module.css';
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const label = (month: string) => new Date(`${month}-01T12:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
const percent = (value: number | null) => value === null ? 'No opening cohort' : `${(value * 100).toFixed(1)}%`;

export function LeadershipTrends({ data }: { data: AgencyBusinessResponse }) {
  const [expanded, setExpanded] = useState(false);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState<AgencyBusinessResponse[]>([]);
  const [billing, setBilling] = useState<BillingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const months = useMemo(() => recentAgencyMonths(data.month), [data.month]);
  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    setLoading(true); setError(null); setSources([]); setBilling(null); setBillingError(null);
    async function load() {
      const remaining = months.filter(month => month !== data.month);
      const results = [data];
      const worker = async () => {
        while (remaining.length && !controller.signal.aborted) {
          const month = remaining.shift()!;
          const response = await fetch(`/api/agency/business?month=${month}`, { signal: controller.signal, cache: 'no-store' });
          const payload = await response.json();
          if (!response.ok || payload.month !== month) throw new Error('Some months could not be loaded. Try again.');
          results.push(payload);
        }
      };
      // A bounded six-month window, with no more than two performance requests at a time.
      const loadBilling = async () => {
        try {
          const response = await fetch('/api/agency/billing', { signal: controller.signal, cache: 'no-store' });
          const payload = await response.json();
          if (!response.ok) throw new Error('Recorded billing activity is unavailable.');
          summarizeBillingTimeline(payload, months);
          if (!controller.signal.aborted) setBilling(payload);
        } catch (cause) { if (!controller.signal.aborted) setBillingError(cause instanceof Error ? cause.message : 'Recorded billing activity is unavailable.'); }
      };
      const loadPerformance = async () => {
        const workers = await Promise.allSettled([worker(), worker()]);
        if (controller.signal.aborted) return;
        if (workers.some(result => result.status === 'rejected')) throw new Error('Some months could not be loaded. Try again.');
        setSources(results.sort((a, b) => a.month.localeCompare(b.month)));
      };
      await Promise.all([loadPerformance(), loadBilling()]);
    }
    void load().catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'History is unavailable.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [expanded, retry, data, months]);
  const rows = useMemo(() => sources.map(summarizeAgencyTrend), [sources]);
  const ledger = useMemo(() => billing?.storageReady ? summarizeBillingTimeline(billing, months) : null, [billing, months]);
  return <section className={styles.panel}>
    <button type="button" className={styles.heading} aria-expanded={expanded} aria-controls="agency-leadership-history" onClick={() => setExpanded(value => !value)}><span><strong>Business over time</strong><small>Six completed months of fees, billing activity and client retention</small></span><ChevronDown size={17} className={expanded ? styles.expanded : undefined} /></button>
    {expanded && <div id="agency-leadership-history" aria-busy={loading}>
      {loading && <div role="status" className={styles.notice}><Loader2 size={15} className={styles.spin} />Loading monthly history</div>}
      {error && <div className={styles.notice} role="alert">{error}<button type="button" onClick={() => setRetry(value => value + 1)}><RefreshCw size={13} />Retry</button></div>}
      {!error && rows.length > 0 && <>
        <div className={styles.tableWrap}><table><caption className={styles.caption}>Agency service fees and recorded billing activity</caption><thead><tr><th scope="col">Month</th><th scope="col">Calculated fees</th><th scope="col">Reviewed fees</th><th scope="col">Net invoiced</th><th scope="col">Net collected</th></tr></thead><tbody>{rows.map(row => { const recorded = ledger?.get(row.month); return <tr key={row.month}><th scope="row">{label(row.month)}</th><td>{row.calculatedCents === null ? 'Not calculated' : money.format(row.calculatedCents / 100)}<small>{row.calculated} / {row.eligible} clients{row.partial ? ' · partial' : ''}</small></td><td>{recorded?.reviewedCount ? money.format(recorded.reviewedCents / 100) : ledger ? 'None recorded' : 'Unavailable'}{recorded && recorded.reviewedCount > 0 && <small>{recorded.reviewedCount} reviews · service month</small>}</td><td>{recorded?.invoiceEvents ? money.format(recorded.invoicedCents / 100) : ledger ? 'None recorded' : 'Unavailable'}</td><td>{recorded?.receiptEvents ? money.format(recorded.receivedCents / 100) : ledger ? 'None recorded' : 'Unavailable'}</td></tr>; })}</tbody></table></div>
        {billingError && <div className={styles.notice} role="alert">{billingError}<button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></div>}
        {billing && !billing.storageReady && <p className={styles.note}>Billing records are not available yet. Calculated fees remain separate from reviewed, invoiced and collected amounts.</p>}
        <p className={styles.note}>Calculated fees use current saved agreements; reviewed fees use the latest saved review for each service month. Invoices follow issue dates; collections follow receipt dates. Voids and reversals subtract on their effective dates. These columns are different time bases, not a conversion funnel. Creator funding and team compensation are excluded.</p>
        <div className={styles.tableWrap}><table><caption className={styles.caption}>Client retention</caption><thead><tr><th scope="col">Month</th><th scope="col">Opening</th><th scope="col">Started</th><th scope="col">Exited</th><th scope="col">Retained</th><th scope="col">Churn</th></tr></thead><tbody>{rows.map(({ month, retention }) => <tr key={month}><th scope="row">{label(month)}</th><td>{retention.opening}</td><td>{retention.newClients}</td><td>{retention.exitedClients}</td><td>{percent(retention.retentionRate)}</td><td>{percent(retention.churnRate)}<small>{retention.churned} / {retention.opening} opening clients</small></td></tr>)}</tbody></table></div>
        <p className={styles.note}>Based on saved service start and end dates. Same-month starts and exits appear in activity; churn measures the opening cohort only. {data.clients.filter(client => !client.serviceStart).length} clients without start dates are excluded. Changes to client dates revise this history.</p>
      </>}
    </div>}
  </section>;
}
