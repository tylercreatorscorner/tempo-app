'use client';

/**
 * Earnings cockpit — the billing surface for Finance.
 *
 * Month view (mockup Surface 1): Month|Year tabs, month + payee pickers, the
 * "Run {month} invoices · N ready" button, the 5-KPI band, and the brand table
 * with the invoice lifecycle inline. Year view folds in the retired /ytd page.
 *
 * This file is the thin orchestrator (state + fetching + wiring); the surface
 * lives in ./components: earnings-kpis, brand-earnings-table, invoice-chip,
 * marketing-gmv-editor, run-invoices-modal, year-view, brand-edit-sheet.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Receipt, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { todayIsoUtc } from '@/lib/finance/overdue';
import { downloadCsv } from '@/lib/utils/csv';
import { downloadXlsx } from '@/lib/utils/xlsx';
import { buildMonthOptions } from '@/lib/utils/format';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { SegmentedControl } from '@/components/ui/segmented';
import { TableLoadBar } from '@/components/ui/table-load-bar';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { EarningsKpis } from './components/earnings-kpis';
import { BrandEarningsTable, type SortKey } from './components/brand-earnings-table';
import { RunInvoicesModal } from './components/run-invoices-modal';
import { YearView } from './components/year-view';
import { BrandEditSheet, type BrandSettingsValues } from './components/brand-edit-sheet';
import type { SeriesPoint } from './components/earnings-trend-chart';
import type { BrandRow, EarningsResponse, RunPlan } from './components/types';

type View = 'month' | 'year';

export function EarningsClient({ initialMonth, initialView, initialYear }: {
  initialMonth: string;
  initialView: View;
  initialYear: number;
}) {
  const monthOptions = useMemo(() => buildMonthOptions(13), []);
  const [view, setView] = useState<View>(initialView);
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<EarningsResponse | null>(null);
  const [series, setSeries] = useState<SeriesPoint[] | null>(null);
  const [plan, setPlan] = useState<RunPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Brand KEY, not a captured row object: the sheet's initialValues always
  // resolve from the CURRENT rows array, so reopening during the post-save
  // refetch shows the optimistic values, never a stale pre-save snapshot.
  const [editingBrandKey, setEditingBrandKey] = useState<string | null>(null);
  // Post-save reconcile: the saved brand's money cells shimmer until the
  // authoritative refetch lands, then the row flashes highlight.
  const [reconcilingBrand, setReconcilingBrand] = useState<string | null>(null);
  const [flashBrand, setFlashBrand] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [generatingBrand, setGeneratingBrand] = useState<string | null>(null);
  const [runOpen, setRunOpen] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  // Active payee — when set, earnings are filtered to this team member's
  // compensation arrangements. null = default to first team member (Tyler).
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [teamMemberId, setTeamMemberId] = useState<string | null>(null);

  // Load team members once
  useEffect(() => {
    fetch('/api/team-members')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((j) => {
        const list = (j.teamMembers ?? []) as Array<{ id: string; name: string }>;
        setTeamMembers(list);
        setTeamMemberId((prev) => prev ?? (list.length > 0 ? list[0].id : null));
      })
      .catch(() => {});
  }, []);

  // Keep ?view= in the URL (no server round-trip — this is pure client state).
  const switchView = useCallback((v: View) => {
    setView(v);
    const url = new URL(window.location.href);
    if (v === 'year') url.searchParams.set('view', 'year');
    else url.searchParams.delete('view');
    window.history.replaceState(null, '', url.toString());
  }, []);

  // Stale-response guard (house pattern — see compose-panel's previewSeq):
  // bumped on every fetch and on every month/payee/view change, so a slow
  // older request can never overwrite the newer selection's data, error, or
  // loading state.
  const fetchSeq = useRef(0);

  // Resolves true only when THIS call's data committed to state (not stale,
  // not errored) — the post-save reconcile uses it to time the row flash.
  const fetchAll = useCallback(async (m: string, tmId: string | null): Promise<boolean> => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    setError(null);
    try {
      const tmParam = tmId ? `&team_member_id=${tmId}` : '';
      // no-store: earnings figures must be recomputed every load, never served
      // from a stale browser/HTTP cache.
      const [earningsRes, seriesRes, planRes] = await Promise.all([
        fetch(`/api/earnings?month=${m}${tmParam}`, { cache: 'no-store' }),
        fetch(`/api/earnings/series?endMonth=${m}&months=12`, { cache: 'no-store' }),
        fetch(`/api/invoices/run?month=${m}${tmParam}`, { cache: 'no-store' }),
      ]);
      const earningsJson = await earningsRes.json();
      const seriesJson = seriesRes.ok ? await seriesRes.json() : null;
      const planJson = planRes.ok ? await planRes.json() : null;
      if (seq !== fetchSeq.current) return false; // stale — a newer selection owns the UI
      if (!earningsRes.ok) throw new Error(earningsJson.error || `HTTP ${earningsRes.status}`);
      setData(earningsJson);

      if (seriesJson) setSeries(seriesJson.series);
      // Plan failure is non-fatal: the run button falls back to counts derived
      // from the (same-source) enriched earnings rows.
      setPlan(planJson);
      return true;
    } catch (err) {
      if (seq !== fetchSeq.current) return false; // stale — drop the error too
      setError(err instanceof Error ? err.message : 'Failed to load earnings');
      return false;
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, []);

  // Month-view data. The Year view owns its own /api/earnings/ytd fetch.
  useEffect(() => {
    if (view !== 'month') {
      // Leaving the month view invalidates any in-flight month fetch.
      fetchSeq.current += 1;
      return;
    }
    fetchAll(month, teamMemberId);
  }, [view, month, teamMemberId, fetchAll]);

  // Single-brand draft generation from the "Ready to invoice" chip. Stays on
  // the cockpit: the chip flips to Draft on the refetch and links to Invoicing.
  const handleGenerateInvoice = useCallback(async (brand: string) => {
    setGeneratingBrand(brand);
    setToast(null);
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, month, team_member_id: teamMemberId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && j.existing) {
          setToast({ kind: 'success', message: `${j.existing.invoice_number} already exists.` });
          fetchAll(month, teamMemberId);
          return;
        }
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setToast({ kind: 'success', message: `Created ${j.invoice.invoice_number} as a draft.` });
      fetchAll(month, teamMemberId);
    } catch (e) {
      setToast({ kind: 'error', message: e instanceof Error ? e.message : 'Failed to generate invoice' });
    } finally {
      setGeneratingBrand(null);
    }
  }, [month, teamMemberId, fetchAll]);

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
      invoice_status: b.invoice?.status ?? '',
      invoice_number: b.invoice?.invoiceNumber ?? '',
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
      invoice_status: b.invoice?.status ?? '',
      invoice_number: b.invoice?.invoiceNumber ?? '',
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

  // The active payee's display name — the edit sheet header and the save toast
  // both name the payee, since arrangements are per (brand, team member).
  const payeeName = useMemo(
    () => teamMembers.find((tm) => tm.id === teamMemberId)?.name ?? data?.teamMember?.name ?? null,
    [teamMembers, teamMemberId, data],
  );

  // Always re-derived from the CURRENT rows array (stale-reopen fix): after an
  // optimistic patch or a refetch, the sheet sees the freshest values.
  const editingRow = useMemo(
    () => (editingBrandKey ? data?.brands.find((b) => b.brand === editingBrandKey) ?? null : null),
    [editingBrandKey, data],
  );

  // Post-save flow: (1) the sheet already PATCHed successfully and handed us
  // the saved values; (2) patch the CONFIGURED fields onto the row in place —
  // the derived money (commission/retainer/total) is NOT reproducible
  // client-side (per-creator overrides live server-side), so those cells
  // shimmer as "recalculating"; (3) toast; (4) refetch reconciles, row flashes.
  const handleArrangementSaved = useCallback((row: BrandRow, saved: BrandSettingsValues) => {
    setData((prev) => prev && ({
      ...prev,
      brands: prev.brands.map((b) => (b.brand === row.brand ? {
        ...b,
        rate: saved.commission_rate,
        configuredRetainer: saved.retainer,
        launchFee: saved.launch_fee,
        launchFeeName: saved.launch_fee_name,
        launchFeeEnds: saved.launch_fee_ends,
        productRetainer: saved.product_retainer_amount,
        productRetainerName: saved.product_retainer_name,
        monthlyGoal: saved.monthly_gmv_goal,
        marketingCommissionRate: saved.marketing_commission_rate,
        compensationModel: saved.compensation_model,
        billToName: saved.bill_to_name,
        billToEmail: saved.bill_to_email,
        billToAddress: saved.bill_to_address,
        paymentInstructions: saved.payment_instructions,
      } : b)),
    }));
    setReconcilingBrand(row.brand);
    setToast({ kind: 'success', message: `Saved - ${row.brandLabel}${payeeName ? ` · ${payeeName}` : ''}` });
    void fetchAll(month, teamMemberId).then((landed) => {
      setReconcilingBrand((cur) => (cur === row.brand ? null : cur));
      if (landed) {
        setFlashBrand(row.brand);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlashBrand(null), 1600);
      }
    });
  }, [fetchAll, month, teamMemberId, payeeName]);

  // Ready count for the run button — plan-driven, falling back to the enriched
  // rows (identical definition: total > 0 and no invoice yet).
  const readyCount = plan
    ? plan.ready.length
    : (data?.brands.filter((b) => b.total > 0 && !b.invoice).length ?? 0);

  const monthName = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  }, [month]);

  // Refetch load bar — fires on month / team-member change (via fetchAll).
  // Delayed so it doesn't flash on fast loads; dims existing data while active.
  const showBar = useDelayedFlag(loading);

  // ONE "today" per render — the KPI band and every invoice chip read the
  // shared overdue rule against the same date so they can never disagree.
  const todayIso = todayIsoUtc();

  return (
    <div className="space-y-6">
      {/* Controls toolbar (page title lives in the server page wrapper) */}
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl<View>
          options={[{ value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]}
          value={view}
          onValueChange={switchView}
          ariaLabel="Earnings view"
        />
        {view === 'month' && (
          <>
            <div className="w-44">
              <Select value={month} onChange={(e) => setMonth(e.target.value)} className="font-semibold">
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
                  {teamMembers.map((tm) => <option key={tm.id} value={tm.id}>Payee: {tm.name}</option>)}
                </Select>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => fetchAll(month, teamMemberId)} disabled={loading} title="Refresh">
              <RefreshCw className={cn(loading && 'animate-spin')} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!data || loading} title="Export brand breakdown to CSV">
              <Download />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportXlsx} disabled={!data || loading} title="Export brand breakdown + per-creator detail to Excel">
              <FileSpreadsheet />
              Excel
            </Button>
            {readyCount > 0 && (
              <Button variant="primary" size="md" className="ml-auto" onClick={() => setRunOpen(true)}>
                <Receipt />
                Run {monthName} invoices · {readyCount} ready
              </Button>
            )}
          </>
        )}
      </div>

      {view === 'year' ? (
        <YearView initialYear={initialYear} />
      ) : (
        <>
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--pulse-neg)]/25 bg-[var(--pulse-neg-bg)] px-4 py-3 text-sm font-semibold text-[var(--pulse-neg)]">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Stale-on-refetch data region: KPIs + table. The view/month/payee
              controls above stay outside so they don't dim during a refetch. */}
          <div className="relative">
            <TableLoadBar active={showBar} />
            <div className={cn('space-y-6', showBar && data && 'opacity-60 transition-opacity duration-200')}>
              <EarningsKpis data={data} series={series} todayIso={todayIso} />

              <Card className="overflow-hidden">
                <div className="px-5 pb-3 pt-4">
                  <CardTitle>Brand Breakdown</CardTitle>
                  <CardDescription className="mt-0.5 text-xs">
                    {data
                      ? `${data.brands.length} brands · click a row for the creator breakdown`
                      : 'Loading…'}
                  </CardDescription>
                </div>
                {loading && !data ? (
                  <div className="p-8"><div className="h-[240px] w-full animate-pulse rounded-xl bg-muted" /></div>
                ) : (
                  <BrandEarningsTable
                    rows={sortedBrands}
                    todayIso={todayIso}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    onEdit={(row) => setEditingBrandKey(row.brand)}
                    onGenerateInvoice={handleGenerateInvoice}
                    generatingBrand={generatingBrand}
                    reconcilingBrand={reconcilingBrand}
                    flashBrand={flashBrand}
                    totals={data?.totals ?? null}
                    month={month}
                    onMarketingSaved={() => {
                      setToast({ kind: 'success', message: 'Marketing GMV updated' });
                      fetchAll(month, teamMemberId);
                    }}
                    onMarketingError={(m) => setToast({ kind: 'error', message: m })}
                  />
                )}
              </Card>
            </div>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4">
          <div
            className={cn(
              'flex max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl',
              // Text tokens, not palette: -900 shades are fixed near-black and
              // never flip, so these toasts were unreadable on the dark ground.
              toast.kind === 'success'
                ? 'border-[var(--pulse-pos)]/25 bg-[var(--pulse-pos-bg)] text-foreground'
                : 'border-[var(--pulse-neg)]/25 bg-[var(--pulse-neg-bg)] text-foreground',
            )}
          >
            {toast.kind === 'success'
              ? <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--pulse-pos)]" />
              : <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--pulse-neg)]" />}
            <p className="text-sm font-medium">{toast.message}</p>
          </div>
        </div>
      )}

      {/* Run modal */}
      {runOpen && (
        <RunInvoicesModal
          month={month}
          teamMemberId={teamMemberId}
          onClose={() => setRunOpen(false)}
          onRunCompleted={() => fetchAll(month, teamMemberId)}
        />
      )}

      {/* Edit drawer — keyed by brand so each open is a fresh mount, and fed
          from editingRow (derived from the CURRENT rows array) so a reopen
          during the post-save refetch shows the optimistic values. */}
      {editingRow && (
        <BrandEditSheet
          key={editingRow.brand}
          open
          brand={editingRow.brand}
          brandLabel={editingRow.brandLabel}
          teamMemberId={teamMemberId}
          payeeName={payeeName}
          preview={{
            monthLabel: monthName,
            affiliateGmv: editingRow.affiliateGmv,
            marketingGmv: editingRow.marketingGmv,
            brandRate: editingRow.rate,
            creators: editingRow.creators.map((c) => ({ gmv: c.gmv, rate: c.rate })),
          }}
          initialValues={{
            commission_rate: editingRow.rate,
            retainer: editingRow.configuredRetainer,
            launch_fee: editingRow.launchFee,
            launch_fee_name: editingRow.launchFeeName,
            launch_fee_ends: editingRow.launchFeeEnds,
            product_retainer_amount: editingRow.productRetainer,
            product_retainer_name: editingRow.productRetainerName,
            monthly_gmv_goal: editingRow.monthlyGoal,
            marketing_commission_rate: editingRow.marketingCommissionRate,
            compensation_model: editingRow.compensationModel,
            bill_to_name: editingRow.billToName,
            bill_to_email: editingRow.billToEmail,
            bill_to_address: editingRow.billToAddress,
            payment_instructions: editingRow.paymentInstructions,
          }}
          onClose={() => setEditingBrandKey(null)}
          onSaved={(saved) => handleArrangementSaved(editingRow, saved)}
        />
      )}
    </div>
  );
}
