'use client';

/**
 * Earnings page — replaces the old dashboard's "Calculator" feature.
 *
 * Layout:
 *   1. Month picker (current + last 12 months)
 *   2. Summary strip — Total GMV, Commission, Retainers, Earnings, Tyler/Matt
 *   3. Goal progress bar — total monthly GMV vs sum of brand monthly_gmv_goals
 *   4. Per-brand table with inline-editable Marketing GMV / Rate / Retainer /
 *      Launch Fee / Product Retainer cells. Each edit hits a PATCH endpoint and
 *      re-fetches earnings so the totals update immediately.
 *
 * Note: the GMV column rename bug we just fixed (Apr 2026) means historical
 * months may show $0 in some sections until Tyler re-uploads with the new
 * column maps. Once those land, this page reflects correctly without any
 * code change here.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2, RefreshCw, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatNumber } from '@/lib/utils/format';

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
  productRetainer: number;
  productRetainerName: string | null;
  launchFee: number;
  launchFeeName: string | null;
  launchFeeEnds: string | null;
  totalFees: number;
  total: number;
  tylerShare: number;
  mattShare: number;
  topluxModel: { type: 'retainer' | 'revshare'; activeAmount: number; comparison: number } | null;
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
    tylerShare: number;
    mattShare: number;
    monthlyGoal: number;
    goalProgressPct: number;
  };
}

// Helper: build a list of recent months for the dropdown (current + 12 prior)
function buildMonthOptions(): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 13; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    opts.push({ value, label });
  }
  return opts;
}

export function EarningsClient({ initialMonth }: { initialMonth: string }) {
  const monthOptions = useMemo(buildMonthOptions, []);
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<EarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEarnings = useCallback(async (m: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/earnings?month=${m}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setData(j);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load earnings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEarnings(month); }, [month, fetchEarnings]);

  const handleEditBrandSetting = useCallback(async (brand: string, field: 'rate' | 'retainer' | 'launch_fee' | 'product_retainer', value: number) => {
    try {
      const res = await fetch('/api/earnings/brand-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, field, value }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      await fetchEarnings(month);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }, [month, fetchEarnings]);

  const handleEditMarketingGmv = useCallback(async (brand: string, amount: number) => {
    try {
      const res = await fetch('/api/earnings/marketing-gmv', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, month, amount }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      await fetchEarnings(month);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }, [month, fetchEarnings]);

  return (
    <div className="space-y-5">
      {/* Top bar — month picker */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="appearance-none bg-white border border-gray-200 rounded-xl pl-4 pr-10 py-2 text-sm font-semibold text-[#1A1B3A] focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
          >
            {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <ChevronDown className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        <button
          onClick={() => fetchEarnings(month)}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 disabled:opacity-40 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
        <div className="text-xs text-gray-400 ml-auto">
          {data ? `${data.startDate} → ${data.endDate}` : ''}
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Summary cards */}
      <SummaryStrip data={data} loading={loading} />

      {/* Goal progress */}
      <GoalBar data={data} loading={loading} />

      {/* Per-brand table */}
      <BrandTable
        data={data}
        loading={loading}
        onEditBrandSetting={handleEditBrandSetting}
        onEditMarketingGmv={handleEditMarketingGmv}
      />
    </div>
  );
}

// ── Summary strip ──────────────────────────────────────────────────

function SummaryStrip({ data, loading }: { data: EarningsResponse | null; loading: boolean }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <SummaryCard label="Total GMV"     value={data ? formatCurrency(data.totals.totalGmv)     : '—'} loading={loading} accent="blue" />
      <SummaryCard label="Commission"    value={data ? formatCurrency(data.totals.commission)   : '—'} loading={loading} accent="emerald" />
      <SummaryCard label="Retainers"     value={data ? formatCurrency(data.totals.retainers)    : '—'} loading={loading} accent="purple" />
      <SummaryCard label="Total Earnings" value={data ? formatCurrency(data.totals.earnings)     : '—'} loading={loading} accent="pink"
        sub={data ? `Tyler ${formatCurrency(data.totals.tylerShare)} · Matt ${formatCurrency(data.totals.mattShare)}` : ''} hero />
      <SummaryCard label="Launch Fees"   value={data ? formatCurrency(data.totals.launchFees)   : '—'} loading={loading} accent="amber" />
    </div>
  );
}

const ACCENT_BORDER = {
  blue:    'border-l-blue-400',
  emerald: 'border-l-emerald-400',
  purple:  'border-l-purple-400',
  pink:    'border-l-[#E91E8C]',
  amber:   'border-l-amber-400',
} as const;

function SummaryCard({
  label, value, sub, accent, loading, hero,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: keyof typeof ACCENT_BORDER;
  loading: boolean;
  hero?: boolean;
}) {
  return (
    <div className={cn(
      'rounded-2xl bg-white border border-gray-100 shadow-sm p-4 border-l-4',
      ACCENT_BORDER[accent],
      hero && 'lg:col-span-2 bg-gradient-to-br from-[#1A1B3A] to-[#2a2b4a]',
    )}>
      <div className={cn('text-[10px] font-bold uppercase tracking-[0.15em]', hero ? 'text-pink-200' : 'text-gray-500')}>
        {label}
      </div>
      <div className={cn('mt-2 text-2xl font-extrabold', hero ? 'text-white' : 'text-[#1A1B3A]')}>
        {loading && !value.startsWith('$') ? <Loader2 className="h-5 w-5 animate-spin" /> : value}
      </div>
      {sub && (
        <div className={cn('text-[11px] mt-1', hero ? 'text-pink-100/80' : 'text-gray-500')}>{sub}</div>
      )}
    </div>
  );
}

// ── Goal progress bar ──────────────────────────────────────────────

function GoalBar({ data, loading }: { data: EarningsResponse | null; loading: boolean }) {
  if (loading || !data || data.totals.monthlyGoal === 0) return null;
  const pct = Math.min(100, data.totals.goalProgressPct);
  const reached = data.totals.goalProgressPct >= 100;
  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">Monthly GMV goal</div>
          <div className="text-sm font-semibold text-[#1A1B3A]">
            {formatCurrency(data.totals.totalGmv)} of {formatCurrency(data.totals.monthlyGoal)} · <span className={cn(reached ? 'text-emerald-600' : 'text-[#E91E8C]')}>{Math.round(data.totals.goalProgressPct)}%</span>
          </div>
        </div>
        {reached && <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 px-2 py-0.5 rounded-full">🎯 Goal hit!</span>}
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', reached ? 'bg-emerald-400' : 'bg-[#E91E8C]')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Brand table with inline editing ────────────────────────────────

function BrandTable({
  data, loading, onEditBrandSetting, onEditMarketingGmv,
}: {
  data: EarningsResponse | null;
  loading: boolean;
  onEditBrandSetting: (brand: string, field: 'rate' | 'retainer' | 'launch_fee' | 'product_retainer', value: number) => Promise<void>;
  onEditMarketingGmv: (brand: string, amount: number) => Promise<void>;
}) {
  if (loading && !data) {
    return (
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-12 text-center">
        <Loader2 className="h-5 w-5 mx-auto animate-spin text-gray-300" />
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left bg-gray-50/60 border-b border-gray-100">
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">Brand</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 text-right">Affiliate GMV</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 text-right">Marketing GMV</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 text-right">Total GMV</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 text-center">Rate</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 text-right">Commission</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 text-right">Retainer</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 text-right">Product Retainer</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 text-right">Launch Fee</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 text-right">Total</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 text-right">Tyler</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 text-right">Matt</th>
            </tr>
          </thead>
          <tbody>
            {data.brands.map(b => (
              <BrandTableRow
                key={b.brand}
                row={b}
                onEditBrandSetting={onEditBrandSetting}
                onEditMarketingGmv={onEditMarketingGmv}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50/60 border-t border-gray-200 font-bold text-[#1A1B3A]">
              <td className="px-4 py-3">Totals</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(data.totals.affiliateGmv)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(data.totals.marketingGmv)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(data.totals.totalGmv)}</td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3 text-right tabular-nums text-emerald-600">{formatCurrency(data.totals.commission)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(data.totals.retainers)}</td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(data.totals.launchFees)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-[#E91E8C]">{formatCurrency(data.totals.earnings)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(data.totals.tylerShare)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(data.totals.mattShare)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Single editable row ────────────────────────────────────────────

function BrandTableRow({
  row, onEditBrandSetting, onEditMarketingGmv,
}: {
  row: BrandRow;
  onEditBrandSetting: (brand: string, field: 'rate' | 'retainer' | 'launch_fee' | 'product_retainer', value: number) => Promise<void>;
  onEditMarketingGmv: (brand: string, amount: number) => Promise<void>;
}) {
  return (
    <tr className="border-t border-gray-50 hover:bg-gray-50/30">
      <td className="px-4 py-3 font-semibold text-[#1A1B3A]">{row.brandLabel}</td>
      <td className="px-4 py-3 text-right tabular-nums text-[#E91E8C] font-semibold">{formatCurrency(row.affiliateGmv)}</td>
      <td className="px-4 py-3 text-right">
        <NumberCell
          value={row.marketingGmv}
          step={100}
          onSave={(v) => onEditMarketingGmv(row.brand, v)}
          accent="purple"
          width="w-24"
        />
      </td>
      <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatCurrency(row.totalGmv)}</td>
      <td className="px-4 py-3 text-center">
        <div className="flex flex-col items-center gap-0.5">
          <NumberCell
            value={row.rate}
            step={0.5}
            suffix="%"
            onSave={(v) => onEditBrandSetting(row.brand, 'rate', v)}
            width="w-16"
          />
          {Math.abs(row.effectiveRate - row.rate) > 0.01 && (
            <span className="text-[10px] text-[#E91E8C]" title="Effective rate after per-creator overrides">
              eff: {row.effectiveRate.toFixed(2)}%
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex flex-col items-end">
          <span className="tabular-nums text-emerald-600 font-semibold">{formatCurrency(row.commission)}</span>
          {row.marketingGmv > 0 && row.commission > 0 && (
            <span className="text-[10px] text-gray-400 mt-0.5">
              {formatCurrency(row.affiliateCommission)} aff + {formatCurrency(row.marketingCommission)} mkt
            </span>
          )}
          {row.topluxModel && (
            <span className="text-[10px] text-purple-600 mt-0.5" title={`Toplux uses MAX(retainer, 5% rev share). Active: ${row.topluxModel.type}`}>
              {row.topluxModel.type === 'revshare' ? `5% rev share (${formatCurrency(row.topluxModel.activeAmount)})` : 'flat retainer (rev share would be ' + formatCurrency(row.topluxModel.comparison) + ')'}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <NumberCell
          value={row.retainer}
          step={100}
          onSave={(v) => onEditBrandSetting(row.brand, 'retainer', v)}
          width="w-24"
        />
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex flex-col items-end gap-0.5">
          <NumberCell
            value={row.productRetainer}
            step={100}
            onSave={(v) => onEditBrandSetting(row.brand, 'product_retainer', v)}
            width="w-24"
          />
          {row.productRetainerName && (
            <span className="text-[10px] text-[#E91E8C]">{row.productRetainerName}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex flex-col items-end gap-0.5">
          <NumberCell
            value={row.launchFee}
            step={100}
            onSave={(v) => onEditBrandSetting(row.brand, 'launch_fee', v)}
            width="w-24"
          />
          {row.launchFeeName && (
            <span className="text-[10px] text-blue-600">{row.launchFeeName}{row.launchFeeEnds ? ` · ends ${row.launchFeeEnds}` : ''}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-right tabular-nums font-bold text-[#1A1B3A]">{formatCurrency(row.total)}</td>
      <td className="px-4 py-3 text-right tabular-nums text-blue-600">{formatCurrency(row.tylerShare)}</td>
      <td className="px-4 py-3 text-right tabular-nums text-purple-600">{formatCurrency(row.mattShare)}</td>
    </tr>
  );
}

// ── Reusable inline-edit number cell ───────────────────────────────

function NumberCell({
  value, step, suffix, prefix, onSave, accent, width,
}: {
  value: number;
  step: number;
  suffix?: string;
  prefix?: string;
  onSave: (v: number) => Promise<void>;
  accent?: 'pink' | 'purple';
  width?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // When the value prop changes (e.g. after a refetch), reset the draft
  useEffect(() => {
    setDraft(String(value));
    setDirty(false);
  }, [value]);

  const commit = useCallback(async () => {
    if (!dirty) return;
    const n = parseFloat(draft);
    if (Number.isNaN(n) || n < 0) {
      setDraft(String(value));
      setDirty(false);
      return;
    }
    if (n === value) {
      setDirty(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(n);
    } finally {
      setSaving(false);
      setDirty(false);
    }
  }, [draft, dirty, value, onSave]);

  return (
    <div className="inline-flex items-center gap-1">
      {prefix && <span className="text-[11px] text-gray-400">{prefix}</span>}
      <div className="relative inline-block">
        <input
          type="number"
          step={step}
          min={0}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          disabled={saving}
          className={cn(
            'text-right text-sm border rounded-lg px-2 py-1 tabular-nums focus:outline-none focus:ring-2',
            width ?? 'w-20',
            saving       ? 'bg-gray-50 text-gray-400 border-gray-200' :
            accent === 'purple' ? 'bg-purple-50 border-purple-200 text-purple-900 focus:ring-purple-200' :
                          'bg-white border-gray-200 text-gray-900 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]',
            dirty && !saving && 'border-[#E91E8C] ring-1 ring-[#E91E8C]/20',
          )}
        />
        {saving && (
          <Loader2 className="h-3 w-3 animate-spin text-gray-400 absolute right-2 top-1/2 -translate-y-1/2" />
        )}
        {dirty && !saving && (
          <Save className="h-3 w-3 text-[#E91E8C] absolute -right-4 top-1/2 -translate-y-1/2" />
        )}
      </div>
      {suffix && <span className="text-[11px] text-gray-400">{suffix}</span>}
    </div>
  );
}
