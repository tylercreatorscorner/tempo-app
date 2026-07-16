'use client';

/**
 * Earnings page — monthly take across all brands.
 *
 * Layout:
 *   1. Header: month picker + 12-month period summary
 *   2. Stat cards: Total Earnings (hero), Commission, Retainers, Launch Fees, Total GMV
 *   3. Earnings trend (12-month stacked area chart)
 *   4. Goal gauge + Revenue-by-brand stacked bar (50/50 row)
 *   5. Per-brand breakdown table — click a row to edit its settings
 *
 * Editing is done via BrandEditSheet (slide-over drawer). All inline-editing
 * UX has been removed in favor of the dedicated edit panel.
 */

import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, RefreshCw, Pencil, ArrowUp, ArrowDown, Receipt, Loader2, AlertCircle, CheckCircle2, Users, Download, FileSpreadsheet, Plus } from 'lucide-react';
import { downloadCsv } from '@/lib/utils/csv';
import { downloadXlsx } from '@/lib/utils/xlsx';
import { cn } from '@/lib/utils';
import { formatCurrency, buildMonthOptions } from '@/lib/utils/format';
import { StatCard } from '@/components/dashboard/stat-card';
import { Card, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { EarningsTrendChart, type SeriesPoint } from './components/earnings-trend-chart';
import { BrandRevenueChart } from './components/brand-revenue-chart';
import { GoalGauge } from './components/goal-gauge';
import { BrandEditSheet, type BrandSettingsValues, type CompensationModel } from './components/brand-edit-sheet';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { TableLoadBar } from '@/components/ui/table-load-bar';

interface BrandRow {
  brand: string;
  brandLabel: string;
  affiliateGmv: number;
  marketingGmv: number;
  totalGmv: number;
  rate: number;
  effectiveRate: number;
  affiliateCommission: number;
  marketingCommission: number;
  commission: number;
  retainer: number;
  configuredRetainer: number;
  productRetainer: number;
  productRetainerName: string | null;
  launchFee: number;
  launchFeeName: string | null;
  launchFeeEnds: string | null;
  totalFees: number;
  total: number;
  monthlyGoal: number;
  marketingCommissionRate: number;
  billToName: string | null;
  billToEmail: string | null;
  billToAddress: string | null;
  paymentInstructions: string | null;
  compensationModel: CompensationModel;
  revshareMaxOutcome: { winner: 'retainer' | 'commission'; activeAmount: number; comparison: number } | null;
  creators: Array<{ name: string; gmv: number; rate: number; commission: number }>;
}

interface EarningsResponse {
  month: string;
  startDate: string;
  endDate: string;
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
    goalProgressPct: number;
  };
}

type SortKey =
  | 'brandLabel' | 'totalGmv' | 'rate' | 'commission' | 'retainer' | 'launchFee' | 'total';

export function EarningsClient({ initialMonth }: { initialMonth: string }) {
  const router = useRouter();
  const monthOptions = useMemo(() => buildMonthOptions(13), []);
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<EarningsResponse | null>(null);
  const [series, setSeries] = useState<SeriesPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingBrand, setEditingBrand] = useState<BrandRow | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [generatingBrand, setGeneratingBrand] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  // Active payee — when set, earnings are filtered to this team member's
  // compensation arrangements. null = default to first team member (Tyler).
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [teamMemberId, setTeamMemberId] = useState<string | null>(null);

  // Load team members once
  useEffect(() => {
    fetch('/api/team-members').then(r => r.json()).then(j => {
      const list = (j.teamMembers ?? []) as Array<{ id: string; name: string }>;
      setTeamMembers(list);
      if (list.length > 0 && !teamMemberId) setTeamMemberId(list[0].id);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAll = useCallback(async (m: string, tmId: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const tmParam = tmId ? `&team_member_id=${tmId}` : '';
      // no-store: earnings figures must be recomputed every load, never served
      // from a stale browser/HTTP cache.
      const [earningsRes, seriesRes] = await Promise.all([
        fetch(`/api/earnings?month=${m}${tmParam}`, { cache: 'no-store' }),
        fetch(`/api/earnings/series?endMonth=${m}&months=12`, { cache: 'no-store' }),
      ]);
      const earningsJson = await earningsRes.json();
      if (!earningsRes.ok) throw new Error(earningsJson.error || `HTTP ${earningsRes.status}`);
      setData(earningsJson);

      if (seriesRes.ok) {
        const seriesJson = await seriesRes.json();
        setSeries(seriesJson.series);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load earnings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(month, teamMemberId); }, [month, teamMemberId, fetchAll]);

  const handleGenerateInvoice = useCallback(async (brand: string) => {
    setGeneratingBrand(brand);
    setToast(null);
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, month, team_member_id: teamMemberId }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (res.status === 409 && j.existing) {
          // Already exists — open it instead of erroring out
          setToast({ kind: 'success', message: `${j.existing.invoice_number} already exists. Opening it…` });
          setTimeout(() => router.push(`/invoicing?id=${j.existing.id}`), 600);
          return;
        }
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setToast({ kind: 'success', message: `Created ${j.invoice.invoice_number}. Opening Invoicing…` });
      setTimeout(() => router.push(`/invoicing?id=${j.invoice.id}`), 600);
    } catch (e) {
      setToast({ kind: 'error', message: e instanceof Error ? e.message : 'Failed to generate invoice' });
    } finally {
      setGeneratingBrand(null);
    }
  }, [month, router, teamMemberId]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir('desc');
      return key;
    });
  }, []);

  const sortedBrands = useMemo(() => {
    if (!data) return [];
    const arr = [...data.brands];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      const as = String(av ?? '');
      const bs = String(bv ?? '');
      return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return arr;
  }, [data, sortKey, sortDir]);

  const handleExportCsv = useCallback(() => {
    if (!data) return;
    const rows = data.brands.map((b) => ({
      brand: b.brandLabel,
      affiliate_gmv: b.affiliateGmv,
      marketing_gmv: b.marketingGmv,
      total_gmv: b.totalGmv,
      brand_rate_pct: b.rate,
      effective_rate_pct: b.effectiveRate,
      commission: b.commission,
      retainer: b.retainer,
      product_retainer: b.productRetainer,
      launch_fee: b.launchFee,
      total: b.total,
      compensation_model: b.compensationModel,
      creators_count: b.creators.length,
    }));
    downloadCsv(`earnings_${month}.csv`, rows);
  }, [data, month]);

  const handleExportXlsx = useCallback(() => {
    if (!data) return;
    const brandRows = data.brands.map((b) => ({
      brand: b.brandLabel,
      affiliate_gmv: b.affiliateGmv,
      marketing_gmv: b.marketingGmv,
      total_gmv: b.totalGmv,
      brand_rate_pct: b.rate,
      effective_rate_pct: b.effectiveRate,
      commission: b.commission,
      retainer: b.retainer,
      product_retainer: b.productRetainer,
      launch_fee: b.launchFee,
      total: b.total,
      compensation_model: b.compensationModel,
      creators_count: b.creators.length,
    }));
    // Second tab: every brand's per-creator breakdown flattened, brand-tagged.
    const creatorRows = data.brands.flatMap((b) =>
      b.creators.map((c) => ({
        brand: b.brandLabel,
        creator: c.name,
        gmv: c.gmv,
        rate_pct: c.rate,
        commission: c.commission,
      })),
    );
    void downloadXlsx(`earnings_${month}.xlsx`, [
      { name: 'Brands', rows: brandRows },
      { name: 'Creators', rows: creatorRows },
    ]);
  }, [data, month]);

  // Trend % vs prior month — series is oldest-first, last is current month
  const earningsTrend = useMemo(() => {
    if (!series || series.length < 2) return undefined;
    const cur = series[series.length - 1].earnings;
    const prev = series[series.length - 2].earnings;
    if (prev <= 0) return undefined;
    return ((cur - prev) / prev) * 100;
  }, [series]);

  // Refetch load bar — fires on month / team-member change (via fetchAll).
  // Delayed so it doesn't flash on fast loads; dims existing data while active.
  const showBar = useDelayedFlag(loading);

  return (
    <div className="space-y-6">
      {/* Controls toolbar (page title lives in the server page wrapper) */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-44">
          <Select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="font-semibold"
          >
            {monthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
        {teamMembers.length > 1 && (
          <div className="w-52">
            <Select
              value={teamMemberId ?? ''}
              onChange={(e) => setTeamMemberId(e.target.value || null)}
              className="font-semibold"
              title="View earnings for this team member's compensation arrangements"
            >
              {teamMembers.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
            </Select>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchAll(month, teamMemberId)}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw className={cn(loading && 'animate-spin')} />
          Refresh
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          disabled={!data || loading}
          title="Export brand breakdown to CSV"
        >
          <Download />
          CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportXlsx}
          disabled={!data || loading}
          title="Export brand breakdown + per-creator detail to Excel"
        >
          <FileSpreadsheet />
          Excel
        </Button>
        <div className="text-xs text-muted-foreground ml-auto">
          {data ? `${data.startDate} → ${data.endDate}` : ''}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Stale-on-refetch data region: KPIs + chart + table. The month/team
          controls above stay outside so they don't dim/bar during a refetch. */}
      <div className="relative">
        <TableLoadBar active={showBar} />
        <div className={cn('space-y-6', showBar && data && 'opacity-60 transition-opacity duration-200')}>
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5">
          <StatCard
            label="Total Earnings"
            value={data ? formatCurrency(data.totals.earnings) : '—'}
            hero
            trend={earningsTrend}
            trendLabel="vs last month"
            sparklineData={series?.map((s) => s.earnings) ?? undefined}
            accentColor="var(--primary)"
          />
        </div>
        <div className="lg:col-span-7 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Commission"
            value={data ? formatCurrency(data.totals.commission) : '—'}
            accentColor="var(--pulse-accent-2)"
          />
          <StatCard
            label="Retainers"
            value={data ? formatCurrency(data.totals.retainers) : '—'}
            accentColor="#10B981"
          />
          <StatCard
            label="Launch Fees"
            value={data ? formatCurrency(data.totals.launchFees) : '—'}
            accentColor="#FF9800"
          />
          <StatCard
            label="Total GMV"
            value={data ? formatCurrency(data.totals.totalGmv) : '—'}
            accentColor="#2196F3"
          />
        </div>
      </div>

      {/* Trend chart */}
      <Panel title="Earnings Trend" subtitle="Last 12 months · stacked by component">
        {loading && !series ? (
          <ChartSkeleton height={280} />
        ) : series && series.length > 0 ? (
          <EarningsTrendChart data={series} height={280} />
        ) : (
          <EmptyState message="No trend data available yet" />
        )}
      </Panel>

      {/* Goal gauge + Revenue by brand */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Goal Progress" subtitle="Total GMV vs. monthly target" className="lg:col-span-1">
          {loading && !data ? (
            <ChartSkeleton height={260} />
          ) : data && data.totals.monthlyGoal > 0 ? (
            <GoalGauge current={data.totals.totalGmv} goal={data.totals.monthlyGoal} height={260} />
          ) : (
            <EmptyState message="Set a monthly GMV goal on a brand to see progress" />
          )}
        </Panel>

        <Panel title="Revenue by Brand" subtitle="Commission / retainer / fees breakdown" className="lg:col-span-2">
          {loading && !data ? (
            <ChartSkeleton height={320} />
          ) : data && data.brands.length > 0 ? (
            <BrandRevenueChart
              data={data.brands.map((b) => ({
                brand: b.brand,
                brandLabel: b.brandLabel,
                commission: b.commission,
                retainer: b.retainer + b.productRetainer,
                launchFees: b.launchFee,
              }))}
              height={320}
            />
          ) : (
            <EmptyState message="No brand data for this month yet" />
          )}
        </Panel>
      </div>

      {/* Brand breakdown table */}
      <Panel
        title="Brand Breakdown"
        subtitle={data ? `${data.brands.length} brands · click a row to edit settings` : 'Loading…'}
        bodyPadding={false}
      >
        {loading && !data ? (
          <div className="p-8"><ChartSkeleton height={200} /></div>
        ) : (
          <BrandTable
            rows={sortedBrands}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onEdit={(row) => setEditingBrand(row)}
            onGenerateInvoice={handleGenerateInvoice}
            generatingBrand={generatingBrand}
            totals={data?.totals ?? null}
            month={month}
            onMarketingSaved={() => {
              setToast({ kind: 'success', message: 'Marketing GMV updated' });
              fetchAll(month, teamMemberId);
            }}
            onMarketingError={(m) => setToast({ kind: 'error', message: m })}
          />
        )}
      </Panel>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4">
          <div
            className={cn(
              'flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl border max-w-sm',
              toast.kind === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-900'
                : 'bg-red-500/10 border-red-500/25 text-red-900',
            )}
          >
            {toast.kind === 'success'
              ? <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              : <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />}
            <p className="text-sm font-medium">{toast.message}</p>
          </div>
        </div>
      )}

      {/* Edit drawer */}
      {editingBrand && (
        <BrandEditSheet
          open
          brand={editingBrand.brand}
          brandLabel={editingBrand.brandLabel}
          teamMemberId={teamMemberId}
          initialValues={{
            commission_rate: editingBrand.rate,
            retainer: editingBrand.configuredRetainer,
            launch_fee: editingBrand.launchFee,
            launch_fee_name: editingBrand.launchFeeName,
            launch_fee_ends: editingBrand.launchFeeEnds,
            product_retainer_amount: editingBrand.productRetainer,
            product_retainer_name: editingBrand.productRetainerName,
            monthly_gmv_goal: editingBrand.monthlyGoal,
            marketing_commission_rate: editingBrand.marketingCommissionRate,
            compensation_model: editingBrand.compensationModel,
            bill_to_name: editingBrand.billToName,
            bill_to_email: editingBrand.billToEmail,
            bill_to_address: editingBrand.billToAddress,
            payment_instructions: editingBrand.paymentInstructions,
          }}
          onClose={() => setEditingBrand(null)}
          onSaved={() => fetchAll(month, teamMemberId)}
        />
      )}
    </div>
  );
}

// ── Panel wrapper ─────────────────────────────────────────────────────

function Panel({ title, subtitle, children, className, bodyPadding = true }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  bodyPadding?: boolean;
}) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="px-5 pt-4 pb-3">
        <CardTitle>{title}</CardTitle>
        {subtitle && <CardDescription className="mt-0.5 text-xs">{subtitle}</CardDescription>}
      </div>
      {bodyPadding ? <CardContent>{children}</CardContent> : children}
    </Card>
  );
}

function ChartSkeleton({ height }: { height: number }) {
  return (
    <div className="w-full animate-pulse rounded-xl bg-muted" style={{ height }} />
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-sm text-muted-foreground text-center py-12">{message}</div>
  );
}

// ── Marketing GMV inline editor ───────────────────────────────────────

/**
 * Inline-editable Marketing GMV figure inside the brand row's GMV cell. Click to
 * edit, Enter / blur to save, Esc to cancel. Sends the roster brand + amount to
 * /api/earnings/marketing-gmv (which expands umbrella → per-store writes
 * server-side), then asks the parent to refetch.
 */
function MarketingGmvEditor({ row, month, onSaved, onError }: {
  row: BrandRow;
  month: string;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.marketingGmv ? String(row.marketingGmv) : '');
  const [saving, setSaving] = useState(false);
  // Set just before an Escape-triggered blur so onBlur cancels instead of saves.
  const cancelledRef = useRef(false);

  useEffect(() => {
    setDraft(row.marketingGmv ? String(row.marketingGmv) : '');
  }, [row.marketingGmv]);

  const cancel = () => {
    setDraft(row.marketingGmv ? String(row.marketingGmv) : '');
    setEditing(false);
  };

  async function commit() {
    const amount = draft.trim() === '' ? 0 : parseFloat(draft);
    if (!Number.isFinite(amount) || amount < 0) { cancel(); return; }
    if (amount === row.marketingGmv) { setEditing(false); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/earnings/marketing-gmv', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: row.brand, month, amount }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setEditing(false);
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to save marketing GMV');
      cancel();
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <span className="text-muted-foreground">$</span>
        <input
          autoFocus
          type="number"
          min={0}
          step={100}
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancelledRef.current = true; e.currentTarget.blur(); }
          }}
          onBlur={() => {
            if (cancelledRef.current) { cancelledRef.current = false; cancel(); return; }
            commit();
          }}
          className="w-24 px-1.5 py-0.5 text-[11px] tabular-nums rounded-md border border-[var(--primary)]/50 bg-card focus:outline-none focus:ring-1 focus:ring-[var(--primary)]/40"
        />
        {saving && <Loader2 className="h-3 w-3 animate-spin text-[var(--primary)]" />}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className="group/mkt inline-flex items-center gap-1 hover:text-[var(--primary)] transition-colors"
      title="Edit marketing GMV for this month"
    >
      {row.marketingGmv > 0 ? (
        <span className="tabular-nums">{formatCurrency(row.marketingGmv)} mkt</span>
      ) : (
        <span className="inline-flex items-center gap-0.5 text-muted-foreground group-hover/mkt:text-[var(--primary)]">
          <Plus className="h-2.5 w-2.5" /> marketing
        </span>
      )}
      <Pencil className="h-2.5 w-2.5 opacity-0 group-hover/mkt:opacity-100 transition-opacity" />
    </button>
  );
}

// ── Brand table ───────────────────────────────────────────────────────

function BrandTable({
  rows, sortKey, sortDir, onSort, onEdit, onGenerateInvoice, generatingBrand, totals,
  month, onMarketingSaved, onMarketingError,
}: {
  rows: BrandRow[];
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  onEdit: (row: BrandRow) => void;
  onGenerateInvoice: (brand: string) => void;
  generatingBrand: string | null;
  totals: EarningsResponse['totals'] | null;
  month: string;
  onMarketingSaved: () => void;
  onMarketingError: (message: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (brand: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(brand)) next.delete(brand); else next.add(brand);
    return next;
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/60 border-y border-border">
            <SortHeader k="brandLabel" label="Brand" align="left" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHeader k="totalGmv"   label="GMV"          align="right" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHeader k="rate"       label="Rate"         align="right" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHeader k="commission" label="Commission"   align="right" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHeader k="retainer"   label="Retainer"     align="right" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHeader k="launchFee"  label="Launch Fee"   align="right" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHeader k="total"      label="Total"        align="right" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-right w-32">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isExpanded = expanded.has(row.brand);
            return (
            <Fragment key={row.brand}>
            <tr
              className="border-b border-border hover:bg-primary/10/40 cursor-pointer transition-colors group"
              onClick={() => toggle(row.brand)}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <ChevronRight className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', isExpanded && 'rotate-90 text-[var(--primary)]')} />
                  <span className="font-semibold text-[var(--foreground)]">{row.brandLabel}</span>
                  <ModelBadge model={row.compensationModel} outcome={row.revshareMaxOutcome} />
                  {row.creators.length > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground" title={`${row.creators.length} managed creators contributed to this brand`}>
                      <Users className="h-3 w-3" />
                      {row.creators.length}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {/* Lead with AFFILIATE (managed) GMV — this is the figure that
                    matches the Creators page "Managed GMV". Marketing GMV is a
                    separate manual line; the combined total only shows when a
                    brand actually has marketing GMV. */}
                <div className="font-semibold text-[var(--foreground)]" title="Affiliate GMV — matches the Creators page Managed GMV">{formatCurrency(row.affiliateGmv)}</div>
                <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                  <span className="uppercase tracking-wide">affiliate</span>
                  <span aria-hidden="true">·</span>
                  <MarketingGmvEditor
                    row={row}
                    month={month}
                    onSaved={onMarketingSaved}
                    onError={onMarketingError}
                  />
                </div>
                {row.marketingGmv > 0 && (
                  <div className="mt-0.5 text-[10px] text-muted-foreground tabular-nums" title="Affiliate GMV + marketing GMV">
                    = {formatCurrency(row.totalGmv)} total
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                <span className="font-medium text-foreground">{row.rate.toFixed(2)}%</span>
                {Math.abs(row.effectiveRate - row.rate) > 0.01 && (
                  <div className="text-[10px] text-[var(--primary)] mt-0.5" title="Effective rate after per-creator overrides">
                    eff: {row.effectiveRate.toFixed(2)}%
                  </div>
                )}
                {row.marketingGmv > 0 && (
                  <div className="text-[10px] text-muted-foreground mt-0.5" title="Marketing commission rate applied to marketing GMV">
                    mkt: {(row.marketingCommissionRate * 100).toFixed(2)}%
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-emerald-600 font-semibold">
                {formatCurrency(row.commission)}
                {row.commission > 0 && row.marketingCommission > 0 && (
                  <div className="text-[10px] font-normal text-muted-foreground mt-0.5" title="Affiliate vs marketing commission split">
                    {formatCurrency(row.affiliateCommission)} aff · {formatCurrency(row.marketingCommission)} mkt
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                <div>{formatCurrency(row.retainer + row.productRetainer)}</div>
                {row.productRetainer > 0 && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    +{formatCurrency(row.productRetainer)} {row.productRetainerName ?? 'product'}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {row.launchFee > 0 ? (
                  <>
                    <div className="text-amber-600 font-medium">{formatCurrency(row.launchFee)}</div>
                    {row.launchFeeName && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">{row.launchFeeName}</div>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-bold text-[var(--foreground)]">
                {formatCurrency(row.total)}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onEdit(row)}
                    className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-muted-foreground hover:text-[var(--primary)] hover:bg-card transition-colors"
                    title="Edit brand settings"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onGenerateInvoice(row.brand)}
                    disabled={generatingBrand === row.brand || row.total <= 0}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 border border-primary/10 text-[var(--primary)] text-[11px] font-bold hover:bg-[var(--primary)] hover:text-white hover:border-[var(--primary)] disabled:opacity-40 disabled:hover:bg-primary/10 disabled:hover:text-[var(--primary)] transition-colors"
                    title={row.total > 0 ? 'Generate invoice for this brand & month' : 'Nothing to invoice'}
                  >
                    {generatingBrand === row.brand
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Receipt className="h-3 w-3" />}
                    Invoice
                  </button>
                </div>
              </td>
            </tr>
            {isExpanded && (
              <tr className="bg-muted/40 border-b border-border">
                <td colSpan={8} className="px-4 py-4">
                  <CreatorBreakdownPanel row={row} />
                </td>
              </tr>
            )}
            </Fragment>
          );
          })}
        </tbody>
        {totals && (
          <tfoot>
            <tr className="bg-muted/60 border-t-2 border-border font-bold text-[var(--foreground)]">
              <td className="px-4 py-3">Totals</td>
              <td className="px-4 py-3 text-right tabular-nums">
                <div>{formatCurrency(totals.affiliateGmv)}</div>
                {totals.marketingGmv > 0 && (
                  <div className="text-[10px] font-medium text-muted-foreground tabular-nums">= {formatCurrency(totals.totalGmv)} total</div>
                )}
              </td>
              <td />
              <td className="px-4 py-3 text-right tabular-nums text-emerald-600">{formatCurrency(totals.commission)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totals.retainers)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totals.launchFees)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-[var(--primary)]">{formatCurrency(totals.earnings)}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function SortHeader({ k, label, align, sortKey, sortDir, onSort }: {
  k: SortKey;
  label: string;
  align: 'left' | 'right';
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th
      onClick={() => onSort(k)}
      className={cn(
        'px-4 py-3 text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none transition-colors',
        align === 'right' ? 'text-right' : 'text-left',
        active ? 'text-[var(--primary)]' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </span>
    </th>
  );
}

function CreatorBreakdownPanel({ row }: { row: BrandRow }) {
  if (row.creators.length === 0) {
    return (
      <div className="text-xs text-muted-foreground text-center py-4">
        No managed creators contributed GMV to this brand for this month.
      </div>
    );
  }
  const top = row.creators.slice(0, 25);
  const remaining = row.creators.length - top.length;
  const remainingGmv = row.creators.slice(25).reduce((s, c) => s + c.gmv, 0);
  const remainingCommission = row.creators.slice(25).reduce((s, c) => s + c.commission, 0);

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <div className="px-4 py-2.5 flex items-baseline justify-between border-b border-border bg-muted/40">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          Creator Breakdown
        </h4>
        <span className="text-[11px] text-muted-foreground">
          {row.creators.length} creator{row.creators.length === 1 ? '' : 's'} · {formatCurrency(row.affiliateGmv)} affiliate GMV
        </span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-2 text-left text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Creator</th>
            <th className="px-4 py-2 text-right text-[9px] font-bold uppercase tracking-wider text-muted-foreground">GMV</th>
            <th className="px-4 py-2 text-right text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Rate</th>
            <th className="px-4 py-2 text-right text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Commission</th>
          </tr>
        </thead>
        <tbody>
          {top.map((c, i) => {
            const isOverride = Math.abs(c.rate - row.rate) > 0.01;
            return (
              <tr key={`${c.name}-${i}`} className="border-b border-border last:border-0">
                <td className="px-4 py-1.5 font-medium text-[var(--foreground)]">
                  {c.name.startsWith('@') ? c.name : `@${c.name}`}
                </td>
                <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">{formatCurrency(c.gmv)}</td>
                <td className="px-4 py-1.5 text-right tabular-nums">
                  <span className={cn(isOverride ? 'text-[var(--primary)] font-semibold' : 'text-muted-foreground')}>
                    {c.rate.toFixed(2)}%
                  </span>
                  {isOverride && <span className="ml-1 text-[9px] text-[var(--primary)]" title="Per-creator rate override">*</span>}
                </td>
                <td className="px-4 py-1.5 text-right tabular-nums text-emerald-600 font-semibold">{formatCurrency(c.commission)}</td>
              </tr>
            );
          })}
          {remaining > 0 && (
            <tr className="border-b border-border last:border-0 bg-muted/30">
              <td className="px-4 py-1.5 italic text-muted-foreground">
                + {remaining} more creator{remaining === 1 ? '' : 's'}
              </td>
              <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">{formatCurrency(remainingGmv)}</td>
              <td className="px-4 py-1.5" />
              <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">{formatCurrency(remainingCommission)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ModelBadge({ model, outcome }: {
  model: CompensationModel;
  outcome: BrandRow['revshareMaxOutcome'];
}) {
  if (model === 'standard') return null;
  const config: Record<Exclude<CompensationModel, 'standard'>, { label: string; bg: string; text: string; tip: string }> = {
    revshare_max: {
      label: 'MAX',
      bg: 'bg-purple-500/10 border-purple-500/25',
      text: 'text-purple-500',
      tip: outcome
        ? `MAX(retainer, commission). ${outcome.winner === 'commission' ? 'Rev share' : 'Retainer'} won.`
        : 'MAX(retainer, commission)',
    },
    commission_only: {
      label: 'Comm only',
      bg: 'bg-blue-500/10 border-blue-500/25',
      text: 'text-blue-500',
      tip: 'No retainer, commission only',
    },
    retainer_only: {
      label: 'Retainer only',
      bg: 'bg-emerald-500/10 border-emerald-500/25',
      text: 'text-emerald-500',
      tip: 'Flat retainer, no commission',
    },
  };
  const c = config[model];
  return (
    <span
      title={c.tip}
      className={cn('inline-flex items-center px-1.5 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider', c.bg, c.text)}
    >
      {c.label}
    </span>
  );
}
