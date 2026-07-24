'use client';

/**
 * The cockpit's 5-KPI band: Total earnings (MoM delta), Retainers, Commission,
 * Invoiced X of Y ($ sent), Collected ($ paid, overdue count).
 *
 * Cards match the kit StatCard's visual spec exactly (rounded-[20px], elev-1,
 * uppercase label, tabular value) but keep a free-form detail slot — the
 * Collected card needs a pulse-neg overdue line StatCard can't render.
 * Money renders an em-dash while data is missing — never a fake $0.
 */
import type { ReactNode } from 'react';
import { isOverdue } from '@/lib/finance/overdue';
import { formatCurrency } from '@/lib/utils/format';
import type { SeriesPoint } from './earnings-trend-chart';
import type { BrandRow, EarningsResponse } from './types';

function KpiCard({ label, value, detail }: { label: string; value: string; detail?: ReactNode }) {
  return (
    <div className="rounded-[20px] border border-border bg-card p-4 shadow-[var(--pulse-elev-1)]">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-extrabold leading-none tracking-tight tabular-nums text-foreground">{value}</p>
      {detail && <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-semibold">{detail}</div>}
    </div>
  );
}

/** ▲6% / ▼3% vs-prior-month line, pulse pos/neg. Null when no prior month. */
function MomDelta({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null) return <span className="text-muted-foreground">{label}</span>;
  const positive = pct >= 0;
  return (
    <>
      <span className="tabular-nums" style={{ color: positive ? 'var(--pulse-pos)' : 'var(--pulse-neg)' }}>
        {positive ? '▲' : '▼'}{Math.abs(pct) < 1 ? Math.abs(pct).toFixed(1) : Math.round(Math.abs(pct))}%
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
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <KpiCard
        label="Total earnings"
        value={data ? formatCurrency(data.totals.earnings) : '—'}
        detail={data ? <MomDelta pct={momPct(series, 'earnings')} label={prevMonthLabel(series)} /> : undefined}
      />
      <KpiCard
        label="Retainers"
        value={data ? formatCurrency(data.totals.retainers) : '—'}
        detail={data ? <span className="text-muted-foreground">monthly base</span> : undefined}
      />
      <KpiCard
        label="Commission"
        value={data ? formatCurrency(data.totals.commission) : '—'}
        detail={data ? <MomDelta pct={momPct(series, 'commission')} label={prevMonthLabel(series)} /> : undefined}
      />
      <KpiCard
        label="Invoiced"
        value={data ? `${invoicedRows.length} of ${invoiceableCount}` : '—'}
        detail={
          data ? (
            <span className="tabular-nums text-muted-foreground">
              {invoicedRows.length > 0 ? `${formatCurrency(invoicedAmount)} sent` : 'nothing invoiced yet'}
            </span>
          ) : undefined
        }
      />
      <KpiCard
        label="Collected"
        value={data ? formatCurrency(collectedAmount) : '—'}
        detail={
          data ? (
            overdueCount > 0 ? (
              <span className="tabular-nums" style={{ color: 'var(--pulse-neg)' }}>
                {overdueCount} overdue
              </span>
            ) : (
              <span className="text-muted-foreground">{invoicedRows.length > 0 ? 'nothing overdue' : 'no invoices yet'}</span>
            )
          ) : undefined
        }
      />
    </div>
  );
}
