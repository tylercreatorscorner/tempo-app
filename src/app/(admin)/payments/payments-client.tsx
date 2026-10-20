'use client';

/**
 * Payments — the money-side operational view, built on REAL sources only:
 *
 *   1. KPIs: Retainer book /mo (managed_creators — the same figure as the
 *      roster's Total Retainers), Outstanding invoices, Overdue, Collected
 *      this month (all from invoices).
 *   2. Retainer book by brand chart (managed_creators).
 *   3. Retainer book table (managed_creators).
 *   4. Audit log feed (payment_audit_log).
 *
 * What's intentionally ABSENT: retainer spend / commissions owed / paid this
 * month as previously shown — those read creator_payments, a table with ONE
 * row ever written, so the numbers were structurally fake. Commissions owed
 * to creators isn't re-sourced from anywhere: creator payout tracking is the
 * future payouts station, and absence is the honest state until it exists.
 *
 * Error discipline: a failed money read renders the error banner and "—" on
 * the cards — never a fabricated $0. Warm refetch failures keep last-good
 * figures under the banner.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatPeriod, currentMonth } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { FinanceMetricStrip } from '@/components/finance/finance-metric-strip';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { TableLoadBar } from '@/components/ui/table-load-bar';
import { BrandSpendChart } from './components/brand-spend-chart';
import { RetainerBook, type RetainerBookRow } from './components/retainer-book';
import { AuditFeed, type AuditLog } from './components/audit-feed';

interface OverviewData {
  retainerBook: number;
  retainerCreatorCount: number;
  outstandingAmount: number;
  outstandingCount: number;
  overdueAmount: number;
  overdueCount: number;
  collectedAmount: number;
  collectedCount: number;
  brandSpend: Record<string, number>;
}

export function PaymentsClient() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [creators, setCreators] = useState<RetainerBookRow[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingCreators, setLoadingCreators] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [brandFilter, setBrandFilter] = useState<string>('all');
  // Stable brand list for the filter dropdown — captured when 'all' is loaded
  // so it doesn't shrink to a single brand when the user picks one.
  const [availableBrands, setAvailableBrands] = useState<string[]>([]);

  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const res = await fetch('/api/payments/overview');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setOverview({
        retainerBook: j.retainerBook ?? 0,
        retainerCreatorCount: j.retainerCreatorCount ?? 0,
        outstandingAmount: j.outstandingAmount ?? 0,
        outstandingCount: j.outstandingCount ?? 0,
        overdueAmount: j.overdueAmount ?? 0,
        overdueCount: j.overdueCount ?? 0,
        collectedAmount: j.collectedAmount ?? 0,
        collectedCount: j.collectedCount ?? 0,
        brandSpend: j.brandSpend ?? {},
      });
      setError(null);
    } catch (e) {
      // Cold: overview stays null → cards render "—", never $0.
      // Warm: last-good figures stay up under the error banner.
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
      const list = (j.creators ?? []) as RetainerBookRow[];
      setCreators(list);
      if (brand === 'all') {
        const pool = Array.from(new Set(list.map((c) => c.brand))).sort();
        setAvailableBrands(pool);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the retainer book');
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

  // Initial load — overview + history are brand-independent; creators follows the filter.
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

  const loading = loadingOverview || loadingCreators;
  // Load bar over the retainer book on brand-filter refetches, gated by a
  // short delay so fast loads don't flash it.
  const showBar = useDelayedFlag(loadingCreators);
  const monthLabel = formatPeriod(currentMonth());

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        eyebrow="Finance"
        title="Payments"
        subtitle="Retainer commitments, invoice collections, and the audit trail."
        actions={
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--pulse-neg)]/25 bg-[var(--pulse-neg-bg)] px-4 py-3 text-sm text-[var(--pulse-neg)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <Button variant="outline" size="sm" className="ml-auto" onClick={handleRefresh} disabled={loading}>
            Retry
          </Button>
        </div>
      )}

      {/* KPI row — "—" until the read succeeds; a failed read is never a $0. */}
      <FinanceMetricStrip label="Commitments and collections summary" metrics={[
        { label: 'Retainer book /mo', value: overview ? formatCurrency(overview.retainerBook) : '—', detail: overview ? `${overview.retainerCreatorCount} creator${overview.retainerCreatorCount === 1 ? '' : 's'} on retainer` : undefined, tone: 'primary' },
        { label: 'Outstanding invoices', value: overview ? formatCurrency(overview.outstandingAmount) : '—', detail: overview ? `${overview.outstandingCount} pending + sent` : undefined },
        { label: 'Overdue', value: overview ? formatCurrency(overview.overdueAmount) : '—', detail: overview ? `${overview.overdueCount} invoice${overview.overdueCount === 1 ? '' : 's'} past due` : undefined, tone: 'negative' },
        { label: 'Collected this month', value: overview ? formatCurrency(overview.collectedAmount) : '—', detail: overview ? `${overview.collectedCount} paid · ${monthLabel}` : undefined, tone: 'positive' },
      ]} />

      <div className="grid min-w-0 items-start gap-4 min-[1440px]:grid-cols-[minmax(0,1fr)_310px]">
      {/* Retainer book table — the load bar covers brand-filter refetches. */}
      <div className="relative min-w-0">
        <TableLoadBar active={showBar} />
        <RetainerBook
          creators={creators}
          loading={loadingCreators}
          brandFilter={brandFilter}
          availableBrands={availableBrands}
          onBrandFilterChange={setBrandFilter}
          refetching={showBar && creators.length > 0}
        />
      </div>

      <aside className="grid min-w-0 grid-cols-1 items-start gap-4 md:max-[1439px]:grid-cols-2" aria-label="Commitment breakdown and payment activity">
        {overview && Object.values(overview.brandSpend).some((v) => v > 0) && (
          <Card className="min-w-0 overflow-hidden">
            <CardHeader className="border-b border-border px-4 py-3">
              <div>
                <CardTitle className="text-sm">Commitments by brand</CardTitle>
                <CardDescription className="mt-0.5 text-xs">Monthly retainers · all active brands</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="max-h-80 overflow-y-auto px-4 py-3"><BrandSpendChart data={overview.brandSpend} /></CardContent>
          </Card>
        )}
        <AuditFeed logs={logs} loading={loadingHistory} />
      </aside>
      </div>

      <p className="text-xs text-muted-foreground">
        Creator payout tracking arrives with the payouts release.
      </p>
    </div>
  );
}
