'use client';

/**
 * Invoicing orchestrator — one full fetch of the workspace's invoices, shared
 * by two views:
 *
 *   Board (default) — the lifecycle board (Draft / Sent / Overdue / Paid),
 *                     ?view= synced so links land on the right tab.
 *   List            — the filterable table with bulk actions + exports.
 *
 * Both views open the same InvoiceDetailSheet; creation goes through the same
 * NewInvoiceModal. Filtering is client-side in the List (the set is small), so
 * switching tabs never refetches and the two views can never disagree.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Columns3, Plus, Rows3 } from 'lucide-react';
import { todayIsoUtc } from '@/lib/finance/overdue';
import { currentMonth } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented';
import { InvoiceDetailSheet, type Invoice } from './components/invoice-detail-sheet';
import { NewInvoiceModal } from './components/new-invoice-modal';
import { InvoiceBoard } from './components/invoice-board';
import { InvoiceList, type TeamMemberOption } from './components/invoice-list';

export type InvoicingView = 'board' | 'list';

interface Props {
  /** When set on initial load, auto-open the matching invoice in the detail drawer. */
  initialOpenId?: string | null;
  /** From ?view= — board is the default read. */
  initialView?: InvoicingView;
}

export function InvoicingClient({ initialOpenId, initialView = 'board' }: Props) {
  const router = useRouter();
  // ONE "today" per render — the board, list, and aging panel all read the
  // shared overdue rule against the same date so they can never disagree.
  const todayIso = todayIsoUtc();
  const [view, setView] = useState<InvoicingView>(initialView);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(initialOpenId ?? null);
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([]);

  useEffect(() => {
    fetch('/api/team-members')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => setTeamMembers((j.teamMembers ?? []) as TeamMemberOption[]))
      .catch(() => {
        // Cosmetic (payee filter + issuer labels) — the page still works without it.
      });
  }, []);

  // One unfiltered fetch — the API scopes to the caller's brands server-side.
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/invoices');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setInvoices((j.invoices ?? []) as Invoice[]);
    } catch (e) {
      // Last-good rows stay on screen; the banner names the failure.
      setError(e instanceof Error ? e.message : 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const urlFor = useCallback((v: InvoicingView) => (v === 'list' ? '/invoicing?view=list' : '/invoicing'), []);

  const handleViewChange = useCallback((v: InvoicingView) => {
    setView(v);
    router.replace(urlFor(v), { scroll: false });
  }, [router, urlFor]);

  // Auto-open invoice when ?id= is in the URL (deep link from earnings on conflict).
  useEffect(() => {
    if (!pendingOpenId || invoices.length === 0) return;
    const match = invoices.find((i) => i.id === pendingOpenId);
    if (match) {
      setActiveInvoice(match);
      setPendingOpenId(null);
      // Clean the query string (keeping the view) so a refresh doesn't re-open it.
      router.replace(urlFor(view), { scroll: false });
    }
  }, [pendingOpenId, invoices, router, urlFor, view]);

  const handleCreated = useCallback((created: Invoice) => {
    setInvoices((prev) => [created, ...prev]);
    setCreating(false);
    setActiveInvoice(created);
  }, []);

  const handleViewExisting = useCallback((id: string) => {
    setCreating(false);
    const match = invoices.find((i) => i.id === id);
    if (match) {
      setActiveInvoice(match);
    } else {
      // Not in the loaded set (stale data) — refetch, then auto-open resolves.
      setPendingOpenId(id);
      fetchInvoices();
    }
  }, [invoices, fetchInvoices]);

  const handleMerge = useCallback((updated: Invoice[]) => {
    const updatedById = new Map(updated.map((inv) => [inv.id, inv]));
    setInvoices((prev) => prev.map((inv) => updatedById.get(inv.id) ?? inv));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance"
        title="Invoicing"
        subtitle="Where every invoice stands, from draft to paid."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl<InvoicingView>
              ariaLabel="Invoicing view"
              size="sm"
              value={view}
              onValueChange={handleViewChange}
              options={[
                {
                  value: 'board',
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <Columns3 className="h-3.5 w-3.5" />
                      Board
                    </span>
                  ),
                },
                {
                  value: 'list',
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <Rows3 className="h-3.5 w-3.5" />
                      List
                    </span>
                  ),
                },
              ]}
            />
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              Create Invoice
            </Button>
          </div>
        }
      />

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--pulse-neg)]/25 bg-[var(--pulse-neg-bg)] px-4 py-3 text-sm text-[var(--pulse-neg)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <Button variant="outline" size="sm" className="ml-auto" onClick={fetchInvoices} disabled={loading}>
            Retry
          </Button>
        </div>
      )}

      {view === 'board' ? (
        <InvoiceBoard
          invoices={invoices}
          loading={loading}
          todayIso={todayIso}
          onOpen={setActiveInvoice}
          onCreate={() => setCreating(true)}
          onRefresh={fetchInvoices}
        />
      ) : (
        <InvoiceList
          invoices={invoices}
          loading={loading}
          todayIso={todayIso}
          teamMembers={teamMembers}
          onOpen={setActiveInvoice}
          onCreate={() => setCreating(true)}
          onRefresh={fetchInvoices}
          onMerge={handleMerge}
        />
      )}

      {/* New invoice modal */}
      <NewInvoiceModal
        open={creating}
        defaultMonth={currentMonth()}
        onClose={() => setCreating(false)}
        onCreated={handleCreated}
        onViewExisting={handleViewExisting}
      />

      {/* Detail drawer — shared by both views */}
      {activeInvoice && (
        <InvoiceDetailSheet
          invoice={activeInvoice}
          onClose={() => setActiveInvoice(null)}
          onUpdated={(updated) => {
            setInvoices((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
            setActiveInvoice(updated);
          }}
          onDeleted={(id) => {
            setInvoices((prev) => prev.filter((i) => i.id !== id));
            setActiveInvoice(null);
          }}
        />
      )}
    </div>
  );
}
