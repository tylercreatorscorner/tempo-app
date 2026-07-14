'use client';

/**
 * Payments page — operational view of retainer commitments and the audit
 * trail of financial changes.
 *
 * Scope (after the rebuild):
 *   1. Stats: total retainer spend, creators on retainer, at-risk count, paid this month
 *   2. Brand retainer-spend chart
 *   3. Retainer tracker table (post progress + status per creator)
 *   4. Audit log feed
 *
 * What's no longer here (and why):
 *   - "Invoices" tab → /invoicing has the dedicated UI now
 *   - "Commissions" tab → rates live on /earnings, +1% bumps managed in BrandEditSheet
 *   - "Overview" → its stats lived elsewhere or are folded into this page
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, AlertCircle, CheckCircle2, RefreshCw, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { StatCard } from '@/components/dashboard/stat-card';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { TableLoadBar } from '@/components/ui/table-load-bar';
import { BrandSpendChart } from './components/brand-spend-chart';
import { RetainerTracker, type RetainerCreator } from './components/retainer-tracker';
import { AuditFeed, type AuditLog } from './components/audit-feed';

interface OverviewData {
  totalRetainerSpend: number;
  totalCommissionsOwed: number;
  outstandingInvoices: number;
  outstandingAmount: number;
  paidThisMonth: number;
  brandSpend: Record<string, number>;
}

export function PaymentsClient() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [creators, setCreators] = useState<RetainerCreator[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingCreators, setLoadingCreators] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'On Track' | 'Behind' | 'At Risk'>('all');
  // Stable brand list for the filter dropdown — captured once when 'all' is loaded
  // so it doesn't shrink to a single brand when the user picks one.
  const [availableBrands, setAvailableBrands] = useState<string[]>([]);

  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const res = await fetch('/api/payments/overview');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setOverview({
        totalRetainerSpend: j.totalRetainerSpend ?? 0,
        totalCommissionsOwed: j.totalCommissionsOwed ?? 0,
        outstandingInvoices: j.outstandingInvoices ?? 0,
        outstandingAmount: j.outstandingAmount ?? 0,
        paidThisMonth: j.paidThisMonth ?? 0,
        brandSpend: j.brandSpend ?? {},
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load overview');
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  const fetchCreators = useCallback(async (brand: string) => {
    setLoadingCreators(true);
    try {
      const res = await fetch(`/api/payments/retainers?brand=${encodeURIComponent(brand)}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      const list = (j.creators ?? []) as RetainerCreator[];
      setCreators(list);
      // Capture the full brand pool when we have an unfiltered view so the
      // dropdown stays populated even after the user picks a single brand.
      if (brand === 'all') {
        const pool = Array.from(new Set(list.map((c) => c.brand))).sort();
        setAvailableBrands(pool);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load retainers');
    } finally {
      setLoadingCreators(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/payments/history');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setLogs(j.logs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history');
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // Initial load — overview + history are independent of brand filter, creators depends on it
  useEffect(() => {
    fetchOverview();
    fetchHistory();
  }, [fetchOverview, fetchHistory]);

  useEffect(() => {
    fetchCreators(brandFilter);
  }, [brandFilter, fetchCreators]);

  const handleRefresh = () => {
    fetchOverview();
    fetchCreators(brandFilter);
    fetchHistory();
  };

  // Apply status filter client-side on top of server-filtered (by brand) creators
  const filteredCreators = useMemo(() => {
    if (statusFilter === 'all') return creators;
    return creators.filter((c) => c.status === statusFilter);
  }, [creators, statusFilter]);

  const stats = useMemo(() => {
    let atRisk = 0;
    let behind = 0;
    let onTrack = 0;
    for (const c of creators) {
      if (c.status === 'At Risk') atRisk += 1;
      else if (c.status === 'Behind') behind += 1;
      else onTrack += 1;
    }
    return { atRisk, behind, onTrack };
  }, [creators]);

  const loading = loadingOverview || loadingCreators;
  // Indeterminate load bar over the retainer tracker — fires on the
  // brand-filter-driven refetch (loadingCreators), gated by a 150ms delay so
  // fast loads don't flash it. Mirrors the roster page pattern.
  const showBar = useDelayedFlag(loadingCreators);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--foreground)]">Payments</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track creator retainers and audit trail of financial changes.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-border hover:bg-muted text-muted-foreground disabled:opacity-40 transition-colors"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-500 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Retainer Spend"
          value={overview ? formatCurrency(overview.totalRetainerSpend) : '—'}
          subValue="This month"
          accentColor="var(--primary)"
        />
        <StatCard
          label="On Retainer"
          value={String(creators.length)}
          subValue={`${stats.onTrack} on track${stats.behind > 0 || stats.atRisk > 0 ? `, ${stats.behind + stats.atRisk} need attention` : ''}`}
          accentColor="var(--pulse-accent-2)"
        />
        <StatCard
          label="At Risk"
          value={String(stats.atRisk + stats.behind)}
          subValue={`${stats.atRisk} at risk · ${stats.behind} behind`}
          accentColor={stats.atRisk > 0 ? '#EF4444' : stats.behind > 0 ? '#F59E0B' : '#10B981'}
        />
        <StatCard
          label="Paid This Month"
          value={overview ? formatCurrency(overview.paidThisMonth) : '—'}
          subValue="Completed payments"
          accentColor="#10B981"
        />
      </div>

      {/* Brand spend chart */}
      {overview && Object.values(overview.brandSpend).some((v) => v > 0) && (
        <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
          <div className="px-5 pt-4 pb-3">
            <h3 className="text-sm font-bold text-[var(--foreground)]">Retainer Spend by Brand</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Monthly retainer commitments allocated across brands</p>
          </div>
          <div className="px-5 pb-5">
            <BrandSpendChart data={overview.brandSpend} height={Math.max(180, Object.values(overview.brandSpend).filter((v) => v > 0).length * 48)} />
          </div>
        </div>
      )}

      {/* Retainer tracker — main operational view.
          Indeterminate load bar pinned to the top of the card on every
          brand-filter-driven refetch. Only the table BODY dims while refetching
          (and only if rows are already on screen) — the filter bar you just
          interacted with stays crisp. Mirrors the roster page. */}
      <div className="relative">
        <TableLoadBar active={showBar} />
        <RetainerTracker
          creators={filteredCreators}
          loading={loadingCreators}
          brandFilter={brandFilter}
          statusFilter={statusFilter}
          availableBrands={availableBrands}
          onBrandFilterChange={setBrandFilter}
          onStatusFilterChange={setStatusFilter}
          refetching={showBar && creators.length > 0}
        />
      </div>

      {/* Audit history */}
      <AuditFeed logs={logs} loading={loadingHistory} />
    </div>
  );
}

// Re-export for callers that imported these from the old monolithic file (defensive)
export { formatDate };
