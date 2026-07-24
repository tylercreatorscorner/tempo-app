'use client';

/**
 * Year view — the retired /ytd page folded into the Earnings cockpit, rebuilt
 * on the Pulse kit (the old page pre-dated the kit: raw hex, no dark mode).
 *
 * Year picker + refresh + CSV, five stat cards, monthly stacked trend, brand
 * contribution bars, and the monthly breakdown table — all from
 * /api/earnings/ytd. Money errors render an em-dash, never a fake $0.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Download, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/format';
import { downloadCsv } from '@/lib/utils/csv';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { TableLoadBar } from '@/components/ui/table-load-bar';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { HorizontalBars } from '@/components/charts/bar-chart';
import { EarningsTrendChart } from './earnings-trend-chart';

interface MonthPoint {
  month: string;
  affiliateGmv: number;
  marketingGmv: number;
  totalGmv: number;
  commission: number;
  retainers: number;
  launchFees: number;
  earnings: number;
  monthlyGoal: number;
}

interface YtdBrandRow {
  brand: string;
  brandLabel: string;
  affiliateGmv: number;
  marketingGmv: number;
  totalGmv: number;
  commission: number;
  retainer: number;
  productRetainer: number;
  launchFee: number;
  total: number;
}

interface YtdResponse {
  year: number;
  months: MonthPoint[];
  brands: YtdBrandRow[];
  totals: {
    affiliateGmv: number;
    marketingGmv: number;
    totalGmv: number;
    commission: number;
    retainers: number;
    launchFees: number;
    earnings: number;
    monthlyGoal: number;
  };
}

function monthLabel(ym: string) {
  const [, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(2000, (m ?? 1) - 1, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
}

export function YearView({ initialYear }: { initialYear: number }) {
  const currentYear = useMemo(() => new Date().getUTCFullYear(), []);
  const yearOptions = useMemo(() => Array.from({ length: 6 }, (_, i) => currentYear - i), [currentYear]);

  const [year, setYear] = useState(initialYear);
  const [data, setData] = useState<YtdResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const showBar = useDelayedFlag(loading);

  const fetchData = useCallback(async (y: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/earnings/ytd?year=${y}`, { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the year view');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(year); }, [year, fetchData]);

  const handleExport = useCallback(() => {
    if (!data) return;
    const rows = data.months.map((m) => ({
      month: m.month,
      affiliate_gmv: m.affiliateGmv,
      marketing_gmv: m.marketingGmv,
      total_gmv: m.totalGmv,
      commission: m.commission,
      retainers: m.retainers,
      launch_fees: m.launchFees,
      earnings: m.earnings,
      monthly_goal: m.monthlyGoal,
    }));
    rows.push({
      month: `${data.year} TOTAL`,
      affiliate_gmv: data.totals.affiliateGmv,
      marketing_gmv: data.totals.marketingGmv,
      total_gmv: data.totals.totalGmv,
      commission: data.totals.commission,
      retainers: data.totals.retainers,
      launch_fees: data.totals.launchFees,
      earnings: data.totals.earnings,
      monthly_goal: data.totals.monthlyGoal,
    });
    downloadCsv(`earnings_ytd_${data.year}.csv`, rows);
  }, [data]);

  const trendData = useMemo(
    () => (data?.months ?? []).map((m) => ({
      month: m.month,
      earnings: m.earnings,
      commission: m.commission,
      retainers: m.retainers,
      launchFees: m.launchFees,
    })),
    [data],
  );

  const contributionRows = useMemo(
    () => [...(data?.brands ?? [])]
      .sort((a, b) => b.total - a.total)
      .map((d) => ({
        label: d.brandLabel,
        segments: [
          { name: 'Commission', value: Math.round(d.commission) },
          { name: 'Retainer', value: Math.round(d.retainer + d.productRetainer) },
          { name: 'Launch Fees', value: Math.round(d.launchFee) },
        ],
      })),
    [data],
  );

  return (
    <div className="space-y-6">
      {/* Year toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-28">
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="font-semibold" title="Year">
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchData(year)} disabled={loading} title="Refresh">
          <RefreshCw className={cn(loading && 'animate-spin')} />
          Refresh
        </Button>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={!data || loading} title="Export monthly breakdown to CSV">
          <Download />
          CSV
        </Button>
        <div className="ml-auto text-xs text-muted-foreground">
          {data && data.year === currentYear && data.months.length > 0
            ? `Through ${monthLabel(data.months[data.months.length - 1].month)}`
            : data ? 'Full year' : ''}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--pulse-neg)]/25 bg-[var(--pulse-neg-bg)] px-4 py-3 text-sm font-semibold text-[var(--pulse-neg)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="relative">
        <TableLoadBar active={showBar} />
        <div className={cn('space-y-6', showBar && data && 'opacity-60 transition-opacity duration-200')}>
          {/* Stat cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <StatCard
                label={`${year} Earnings`}
                value={data ? formatCurrency(data.totals.earnings) : '—'}
                hero
                sparklineData={data && data.months.length > 1 ? data.months.map((m) => m.earnings) : undefined}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 lg:col-span-7 lg:grid-cols-4">
              <StatCard label="Total GMV"   value={data ? formatCurrency(data.totals.totalGmv)   : '—'} accentColor="var(--pulse-accent-2)" />
              <StatCard label="Commission"  value={data ? formatCurrency(data.totals.commission) : '—'} accentColor="var(--primary)" />
              <StatCard label="Retainers"   value={data ? formatCurrency(data.totals.retainers)  : '—'} accentColor="var(--pulse-pos)" />
              <StatCard label="Launch Fees" value={data ? formatCurrency(data.totals.launchFees) : '—'} accentColor="var(--pulse-warn)" />
            </div>
          </div>

          {/* Monthly trend */}
          <Panel title="Monthly Trend" subtitle="Earnings stacked by component (commission · retainer · fees)">
            {loading && !data ? (
              <div className="h-[300px] w-full animate-pulse rounded-xl bg-muted" />
            ) : data && data.months.length > 0 ? (
              <EarningsTrendChart data={trendData} height={300} />
            ) : (
              <div className="py-12 text-center text-sm text-muted-foreground">No data for this year yet</div>
            )}
          </Panel>

          {/* Brand contribution + monthly table */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <Panel title="Brand Contribution" subtitle="Total earnings by brand for the year" className="lg:col-span-2">
              {loading && !data ? (
                <div className="h-[320px] w-full animate-pulse rounded-xl bg-muted" />
              ) : data && data.brands.length > 0 ? (
                <HorizontalBars rows={contributionRows} />
              ) : (
                <div className="py-12 text-center text-sm text-muted-foreground">No brand data yet</div>
              )}
            </Panel>

            <Panel
              title="Monthly Breakdown"
              subtitle={data ? `${data.months.length} month${data.months.length === 1 ? '' : 's'}` : 'Loading…'}
              className="lg:col-span-3"
              bodyPadding={false}
            >
              {loading && !data ? (
                <div className="p-8"><div className="h-[200px] w-full animate-pulse rounded-xl bg-muted" /></div>
              ) : data ? (
                <MonthlyTable months={data.months} totals={data.totals} year={data.year} />
              ) : null}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, children, className, bodyPadding = true }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  bodyPadding?: boolean;
}) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="px-5 pb-3 pt-4">
        <CardTitle>{title}</CardTitle>
        {subtitle && <CardDescription className="mt-0.5 text-xs">{subtitle}</CardDescription>}
      </div>
      {bodyPadding ? <div className="px-5 pb-5">{children}</div> : children}
    </Card>
  );
}

function MonthlyTable({ months, totals, year }: { months: MonthPoint[]; totals: YtdResponse['totals']; year: number }) {
  const th = 'px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-border bg-secondary">
            <th className={cn(th, 'text-left')}>Month</th>
            <th className={cn(th, 'text-right')}>GMV</th>
            <th className={cn(th, 'text-right')}>Commission</th>
            <th className={cn(th, 'text-right')}>Retainers</th>
            <th className={cn(th, 'text-right')}>Fees</th>
            <th className={cn(th, 'text-right')}>Earnings</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month} className="border-b border-border transition-colors hover:bg-muted/60">
              <td className="px-4 py-2.5 font-semibold text-foreground">{monthLabel(m.month)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{formatCurrency(m.totalGmv)}</td>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums" style={{ color: 'var(--pulse-pos)' }}>{formatCurrency(m.commission)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{formatCurrency(m.retainers)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                {m.launchFees > 0 ? formatCurrency(m.launchFees) : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-4 py-2.5 text-right font-bold tabular-nums text-foreground">{formatCurrency(m.earnings)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-secondary font-bold text-foreground">
            <td className="px-4 py-3">{year} Total</td>
            <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totals.totalGmv)}</td>
            <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--pulse-pos)' }}>{formatCurrency(totals.commission)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totals.retainers)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totals.launchFees)}</td>
            <td className="px-4 py-3 text-right tabular-nums text-[var(--primary)]">{formatCurrency(totals.earnings)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
