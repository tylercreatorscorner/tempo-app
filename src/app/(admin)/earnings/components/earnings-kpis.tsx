'use client';

/**
 * The cockpit's 5-KPI band: Total earnings (MoM delta), Retainers, Commission,
 * Invoiced X of Y ($ sent), Collected ($ paid, overdue count).
 *
 * Cards follow the compact shared StatCard styling but keep a free-form detail slot: the
 * Collected card needs a pulse-neg overdue line StatCard can't render.
 * Money renders an em-dash while data is missing — never a fake $0.
 */
import { InterfaceIcon } from '@/components/ui/interface-icon';
import { FinanceMetricStrip } from '@/components/finance/finance-metric-strip';
import { isOverdue } from '@/lib/finance/overdue';
import { formatCurrency } from '@/lib/utils/format';
import type { SeriesPoint } from './earnings-trend-chart';
import type { BrandRow, EarningsResponse } from './types';

/** ▲6% / ▼3% vs-prior-month line, pulse pos/neg. Null when no prior month. */
function MomDelta({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null) return <span className="text-muted-foreground">{label}</span>;
  const positive = pct >= 0;
  return (
    <>
      <span className="inline-flex items-center gap-1 tabular-nums" style={{ color: positive ? 'var(--pulse-pos)' : 'var(--pulse-neg)' }}>
        {<><InterfaceIcon name={positive ? 'increase' : 'decrease'} className="size-3"/><span className="sr-only">{positive ? 'Up ' : 'Down '}</span></>}{Math.abs(pct) < 1 ? Math.abs(pct).toFixed(1) : Math.round(Math.abs(pct))}%
      </span>
      <span className="text-muted-foreground">{label}</span>
    </>
  );
}

/** % change of the last series point vs the one before it, for `key`. */
function momPct(series: SeriesPoint[] | null, key: 'earnings' | 'commission'): number | null {
  if (!series || series.length < 2) return null;
  const cur = series[series.length - 1][key];
  const prev = series[series.length - 2][key];
  if (prev <= 0) return null;
  return ((cur - prev) / prev) * 100;
}

function prevMonthLabel(series: SeriesPoint[] | null): string {
  const ym = series && series.length >= 2 ? series[series.length - 2].month : null;
  if (!ym) return 'vs last month';
  const [y, m] = ym.split('-').map(Number);
  return `vs ${new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}`;
}

/** True for invoices that count toward the invoiced/collected figures. */
function counted(row: BrandRow): boolean {
  return !!row.invoice && row.invoice.status !== 'void';
}

export function EarningsKpis({ data, series, todayIso }: {
  data: EarningsResponse | null;
  series: SeriesPoint[] | null;
  /** yyyy-mm-dd (UTC) — computed once per page render so every surface agrees. */
  todayIso: string;
}) {
  const rows = data?.brands ?? [];
  const invoicedRows = rows.filter(counted);
  const invoiceableCount = rows.filter((r) => r.total > 0 || counted(r)).length;
  const invoicedAmount = invoicedRows.reduce((s, r) => s + (r.invoice?.totalAmount ?? 0), 0);
  const collectedAmount = invoicedRows
    .filter((r) => r.invoice?.status === 'paid')
    .reduce((s, r) => s + (r.invoice?.totalAmount ?? 0), 0);
  // THE shared overdue rule (lib/finance/overdue) — drafts count.
  const overdueCount = invoicedRows.filter((r) => r.invoice && isOverdue(r.invoice, todayIso)).length;

  return (
    <FinanceMetricStrip label="Monthly earnings summary" metrics={[
      { label: 'Total earnings', value: data ? formatCurrency(data.totals.earnings) : '—', tone: 'primary', detail: data ? <MomDelta pct={momPct(series, 'earnings')} label={prevMonthLabel(series)} /> : undefined },
      { label: 'Retainers', value: data ? formatCurrency(data.totals.retainers) : '—', detail: data ? 'monthly base' : undefined },
      { label: 'Commission', value: data ? formatCurrency(data.totals.commission) : '—', detail: data ? <MomDelta pct={momPct(series, 'commission')} label={prevMonthLabel(series)} /> : undefined },
      { label: 'Invoiced', value: data ? `${invoicedRows.length} of ${invoiceableCount}` : '—', detail: data ? invoicedRows.length > 0 ? `${formatCurrency(invoicedAmount)} sent` : 'nothing invoiced yet' : undefined },
      { label: 'Collected', value: data ? formatCurrency(collectedAmount) : '—', detail: data ? overdueCount > 0 ? <span className="text-[var(--pulse-neg)]">{overdueCount} overdue</span> : invoicedRows.length > 0 ? 'nothing overdue' : 'no invoices yet' : undefined },
    ]} />
  );
}
