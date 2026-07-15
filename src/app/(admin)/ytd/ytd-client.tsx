'use client';

/**
 * Year-to-Date earnings dashboard — annual lens on the same data the
 * Earnings page shows month-by-month.
 *
 * Layout:
 *   1. Header: year picker + refresh + export CSV
 *   2. Stat cards: YTD Earnings, GMV, Commission, Retainers, Launch Fees
 *   3. Monthly trend chart (stacked area)
 *   4. Brand contribution chart (stacked bar)
 *   5. Monthly breakdown table
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, RefreshCw, Download, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/format';
import { downloadCsv } from '@/lib/utils/csv';
import { StatCard } from '@/components/dashboard/stat-card';
import { AreaLineChart } from '@/components/charts/area-line-chart';
import { HorizontalBars } from '@/components/charts/bar-chart';

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

interface BrandRow {
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
  brands: BrandRow[];
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

export function YtdClient({ initialYear }: { initialYear: number }) {
  const currentYear = useMemo(() => new Date().getUTCFullYear(), []);
  const yearOptions = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i <= 5; i++) out.push(currentYear - i);
    return out;
  }, [currentYear]);

  const [year, setYear] = useState(initialYear);
  const [data, setData] = useState<YtdResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (y: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/earnings/ytd?year=${y}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load YTD');
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

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-[#8A8FB2]">Year-to-Date</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Annual lens on commission, retainers, and launch fees. {data && data.year === currentYear ? `Through ${monthLabel(data.months[data.months.length - 1]?.month ?? '')}.` : 'Full year.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              disabled={loading}
              className="appearance-none bg-card border border-border rounded-xl pl-4 pr-10 py-2 text-sm font-semibold text-[#8A8FB2] focus:outline-none focus:ring-2 focus:ring-[#6D5EFC]/30 focus:border-[#6D5EFC] cursor-pointer disabled:opacity-50"
            >
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
          <button
            onClick={() => fetchData(year)}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-border hover:bg-muted text-muted-foreground disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={!data || loading}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-border hover:bg-muted text-muted-foreground disabled:opacity-40 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-500 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5">
          <StatCard
            label={`${year} Earnings`}
            value={data ? formatCurrency(data.totals.earnings) : '—'}
            hero
            sparklineData={data?.months.map((m) => m.earnings)}
            accentColor="#6D5EFC"
          />
        </div>
        <div className="lg:col-span-7 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total GMV"   value={data ? formatCurrency(data.totals.totalGmv)   : '—'} accentColor="#2196F3" />
          <StatCard label="Commission"  value={data ? formatCurrency(data.totals.commission) : '—'} accentColor="#A855F7" />
          <StatCard label="Retainers"   value={data ? formatCurrency(data.totals.retainers)  : '—'} accentColor="#10B981" />
          <StatCard label="Launch Fees" value={data ? formatCurrency(data.totals.launchFees) : '—'} accentColor="#FF9800" />
        </div>
      </div>

      {/* Monthly trend */}
      <Panel title="Monthly Trend" subtitle="Earnings stacked by component (commission · retainer · fees)">
        {loading && !data ? (
          <ChartSkeleton height={300} />
        ) : data && data.months.length > 0 ? (
          <MonthlyTrendChart data={data.months} />
        ) : (
          <EmptyState message="No data for this year yet" />
        )}
      </Panel>

      {/* Brand contribution + monthly table */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Panel title="Brand Contribution" subtitle="Total earnings by brand for the year" className="lg:col-span-2">
          {loading && !data ? (
            <ChartSkeleton height={320} />
          ) : data && data.brands.length > 0 ? (
            <BrandContributionChart data={data.brands} />
          ) : (
            <EmptyState message="No brand data yet" />
          )}
        </Panel>

        <Panel title="Monthly Breakdown" subtitle={data ? `${data.months.length} month${data.months.length === 1 ? '' : 's'}` : 'Loading…'} className="lg:col-span-3" bodyPadding={false}>
          {loading && !data ? (
            <div className="p-8"><ChartSkeleton height={200} /></div>
          ) : data ? (
            <MonthlyTable months={data.months} totals={data.totals} year={data.year} />
          ) : null}
        </Panel>
      </div>
    </div>
  );
}

// ── Charts ──────────────────────────────────────────────────────────

function MonthlyTrendChart({ data }: { data: MonthPoint[] }) {
  const labels = data.map((p) => monthLabel(p.month));
  const series = [
    { name: 'Commission', data: data.map((p) => Math.round(p.commission)) },
    { name: 'Retainers',  data: data.map((p) => Math.round(p.retainers)) },
    { name: 'Launch Fees', data: data.map((p) => Math.round(p.launchFees)) },
  ];
  return <AreaLineChart labels={labels} series={series} stacked height={300} showAxis />;
}

function BrandContributionChart({ data }: { data: BrandRow[] }) {
  const sorted = [...data].sort((a, b) => b.total - a.total);
  const rows = sorted.map((d) => ({
    label: d.brandLabel,
    segments: [
      { name: 'Commission', value: Math.round(d.commission) },
      { name: 'Retainer',   value: Math.round(d.retainer + d.productRetainer) },
      { name: 'Launch Fees', value: Math.round(d.launchFee) },
    ],
  }));
  return <HorizontalBars rows={rows} />;
}

// ── Table ──────────────────────────────────────────────────────────

function MonthlyTable({ months, totals, year }: { months: MonthPoint[]; totals: YtdResponse['totals']; year: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/60 border-y border-border">
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Month</th>
            <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">GMV</th>
            <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Commission</th>
            <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Retainers</th>
            <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fees</th>
            <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Earnings</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month} className="border-b border-border hover:bg-primary/5 transition-colors">
              <td className="px-4 py-2.5 font-semibold text-[#8A8FB2]">{monthLabel(m.month)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{formatCurrency(m.totalGmv)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 font-semibold">{formatCurrency(m.commission)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(m.retainers)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{m.launchFees > 0 ? formatCurrency(m.launchFees) : <span className="text-muted-foreground">—</span>}</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-bold text-[#8A8FB2]">{formatCurrency(m.earnings)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted/60 border-t-2 border-border font-bold text-[#8A8FB2]">
            <td className="px-4 py-3">{year} Total</td>
            <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totals.totalGmv)}</td>
            <td className="px-4 py-3 text-right tabular-nums text-emerald-600">{formatCurrency(totals.commission)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totals.retainers)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totals.launchFees)}</td>
            <td className="px-4 py-3 text-right tabular-nums text-[#6D5EFC]">{formatCurrency(totals.earnings)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Atoms ──────────────────────────────────────────────────────────

function Panel({ title, subtitle, children, className, bodyPadding = true }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  bodyPadding?: boolean;
}) {
  return (
    <div className={cn('rounded-2xl bg-card border border-border shadow-sm overflow-hidden', className)}>
      <div className="px-5 pt-4 pb-3">
        <h3 className="text-sm font-bold text-[#8A8FB2]">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className={cn(bodyPadding && 'px-5 pb-5')}>{children}</div>
    </div>
  );
}

function ChartSkeleton({ height }: { height: number }) {
  return <div className="w-full animate-pulse rounded-xl bg-muted" style={{ height }} />;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-sm text-muted-foreground text-center py-12 flex items-center justify-center gap-2">
      <Loader2 className="h-4 w-4 text-muted-foreground" /> {message}
    </div>
  );
}
