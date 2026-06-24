'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Receipt, FileText, Clock, CheckCircle2, Filter, RefreshCw, Download, Plus, AlertCircle, Ban, Search, X, Send, Loader2, FileDown, Users, FileSpreadsheet } from 'lucide-react';
import { downloadCsv } from '@/lib/utils/csv';
import { downloadXlsx } from '@/lib/utils/xlsx';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate, formatPeriod, currentMonth } from '@/lib/utils/format';
import { StatCard } from '@/components/dashboard/stat-card';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { TableLoadBar } from '@/components/ui/table-load-bar';
import { InvoiceDetailSheet, type Invoice } from './components/invoice-detail-sheet';
import { NewInvoiceModal } from './components/new-invoice-modal';
import { AgingPanel, bucketFor, type AgingBucket } from './components/aging-panel';

type Status = 'all' | 'pending' | 'sent' | 'paid' | 'void';

const STATUS_TABS: { value: Status; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'all',     label: 'All',     icon: FileText },
  { value: 'pending', label: 'Pending', icon: Clock },
  { value: 'sent',    label: 'Sent',    icon: Receipt },
  { value: 'paid',    label: 'Paid',    icon: CheckCircle2 },
  { value: 'void',    label: 'Void',    icon: Ban },
];

interface Props {
  /** When set on initial load, auto-open the matching invoice in the detail drawer. */
  initialOpenId?: string | null;
}

export function InvoicingClient({ initialOpenId }: Props) {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [status, setStatus] = useState<Status>('all');
  const [brand, setBrand] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [agingBucket, setAgingBucket] = useState<AgingBucket>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'sent' | 'paid' | 'void' | null>(null);
  const [loading, setLoading] = useState(true);
  // Gate the load bar behind a short delay so it doesn't flash on fast refetches
  // (status / brand / payee changes re-query the server) — only shows on slow loads.
  const showBar = useDelayedFlag(loading);
  const [error, setError] = useState<string | null>(null);
  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(initialOpenId ?? null);
  // Team member filter — 'all' shows everyone's invoices; otherwise filters
  // to a single payee. Loaded once on mount.
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [teamMemberFilter, setTeamMemberFilter] = useState<string>('all');

  useEffect(() => {
    fetch('/api/team-members')
      .then(r => r.json())
      .then(j => setTeamMembers((j.teamMembers ?? []) as Array<{ id: string; name: string }>))
      .catch(() => {});
  }, []);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      if (brand !== 'all') params.set('brand', brand);
      if (teamMemberFilter !== 'all') params.set('team_member_id', teamMemberFilter);
      const res = await fetch(`/api/invoices?${params.toString()}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setInvoices(j.invoices ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [status, brand, teamMemberFilter]);

  // Lookup map: team_member_id → name (used for the per-row issuer label).
  const memberNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const tm of teamMembers) m.set(tm.id, tm.name);
    return m;
  }, [teamMembers]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  // Auto-open invoice when ?id= is in the URL (deep link from earnings page on conflict)
  useEffect(() => {
    if (!pendingOpenId || invoices.length === 0) return;
    const match = invoices.find((i) => i.id === pendingOpenId);
    if (match) {
      setActiveInvoice(match);
      setPendingOpenId(null);
      // Clean the query string so a future refresh doesn't re-open it
      router.replace('/invoicing');
    }
  }, [pendingOpenId, invoices, router]);

  // Build brand filter options from the loaded invoices.
  const brandOptions = useMemo(() => {
    const set = new Set(invoices.map((i) => i.brand));
    return Array.from(set).sort();
  }, [invoices]);

  // Stats — all dollar amounts, with counts shown as subtitles for context.
  const stats = useMemo(() => {
    let pendingAmount = 0;
    let pendingCount = 0;
    let sentAmount = 0;
    let sentCount = 0;
    let paidThisYearAmount = 0;
    let paidThisYearCount = 0;
    let outstandingAmount = 0;
    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
    for (const inv of invoices) {
      const amt = Number(inv.total_amount);
      if (inv.status === 'pending') { pendingAmount += amt; pendingCount += 1; }
      if (inv.status === 'sent') { sentAmount += amt; sentCount += 1; }
      if (inv.status !== 'paid' && inv.status !== 'void') outstandingAmount += amt;
      if (inv.status === 'paid' && inv.paid_at && inv.paid_at >= yearStart) {
        paidThisYearAmount += amt;
        paidThisYearCount += 1;
      }
    }
    return { outstandingAmount, pendingAmount, pendingCount, sentAmount, sentCount, paidThisYearAmount, paidThisYearCount };
  }, [invoices]);

  // Apply client-side aging + search filters on top of the server-filtered list.
  const filteredInvoices = useMemo(() => {
    const now = new Date();
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      // Aging bucket filter
      if (agingBucket !== 'all') {
        const b = bucketFor(inv, now);
        if (b !== agingBucket) return false;
      }
      // Search filter
      if (q) {
        const haystack = [
          inv.invoice_number,
          inv.brand,
          inv.period_month,
          inv.notes ?? '',
          inv.bill_to_name ?? '',
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [invoices, agingBucket, search]);

  // Selection helpers — selection is keyed by invoice id and persists across filters
  const visibleSelectedCount = filteredInvoices.filter((i) => selectedIds.has(i.id)).length;
  const allVisibleSelected = filteredInvoices.length > 0 && visibleSelectedCount === filteredInvoices.length;
  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const inv of filteredInvoices) next.delete(inv.id);
      } else {
        for (const inv of filteredInvoices) next.add(inv.id);
      }
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulk = useCallback(async (action: 'sent' | 'paid' | 'void') => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    if (action === 'void' && !confirm(`Void ${ids.length} invoice${ids.length === 1 ? '' : 's'}? They stay on file but won't count toward outstanding.`)) {
      return;
    }
    setBulkAction(action);
    setError(null);
    try {
      const res = await fetch('/api/invoices/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, status: action }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      // Merge updated rows back into local state
      const updatedById = new Map((j.invoices as Invoice[]).map((inv) => [inv.id, inv]));
      setInvoices((prev) => prev.map((inv) => updatedById.get(inv.id) ?? inv));
      setSelectedIds(new Set()); // Clear selection after success
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk action failed');
    } finally {
      setBulkAction(null);
    }
  }, [selectedIds]);

  const buildExportRows = useCallback(() => {
    const list = filteredInvoices.length > 0 ? filteredInvoices : invoices;
    return list.map((inv) => ({
      invoice_number: inv.invoice_number,
      brand: inv.brand,
      period_month: inv.period_month,
      status: inv.status,
      affiliate_gmv: Number(inv.affiliate_gmv),
      marketing_gmv: Number(inv.marketing_gmv),
      total_gmv: Number(inv.total_gmv),
      commission: Number(inv.commission),
      retainer: Number(inv.retainer),
      product_retainer: Number(inv.product_retainer),
      launch_fee: Number(inv.launch_fee),
      total_amount: Number(inv.total_amount),
      generated_at: inv.generated_at,
      sent_at: inv.sent_at ?? '',
      paid_at: inv.paid_at ?? '',
      due_date: inv.due_date ?? '',
      bill_to_name: inv.bill_to_name ?? '',
      bill_to_email: inv.bill_to_email ?? '',
    }));
  }, [filteredInvoices, invoices]);

  const handleExportCsv = useCallback(() => {
    const rows = buildExportRows();
    if (rows.length === 0) return;
    const stamp = new Date().toISOString().split('T')[0];
    downloadCsv(`invoices_${stamp}.csv`, rows);
  }, [buildExportRows]);

  const handleExportXlsx = useCallback(() => {
    const rows = buildExportRows();
    if (rows.length === 0) return;
    const stamp = new Date().toISOString().split('T')[0];
    void downloadXlsx(`invoices_${stamp}.xlsx`, [{ name: 'Invoices', rows }]);
  }, [buildExportRows]);

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
      // Not in current filtered set — refetch with all filters cleared
      setStatus('all');
      setBrand('all');
      setPendingOpenId(id);
    }
  }, [invoices]);

  return (
    <div className="space-y-6">
      {/* Page header with title + Create Invoice CTA */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1A1B3A]">Invoicing</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Generate, track, and download monthly invoices for each brand.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FF4D8D] text-white text-sm font-bold hover:bg-[#E91E8C] transition-colors shadow-sm flex-shrink-0"
        >
          <Plus className="h-4 w-4" />
          Create Invoice
        </button>
      </div>

      {/* Stats row — all $ amounts with counts as context */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Outstanding"
          value={formatCurrency(stats.outstandingAmount)}
          subValue={`${stats.pendingCount + stats.sentCount} unpaid`}
          accentColor="#FF4D8D"
        />
        <StatCard
          label="Pending"
          value={formatCurrency(stats.pendingAmount)}
          subValue={`${stats.pendingCount} invoice${stats.pendingCount === 1 ? '' : 's'}`}
          accentColor="#F59E0B"
        />
        <StatCard
          label="Sent"
          value={formatCurrency(stats.sentAmount)}
          subValue={`${stats.sentCount} invoice${stats.sentCount === 1 ? '' : 's'}`}
          accentColor="#2196F3"
        />
        <StatCard
          label="Paid This Year"
          value={formatCurrency(stats.paidThisYearAmount)}
          subValue={`${stats.paidThisYearCount} invoice${stats.paidThisYearCount === 1 ? '' : 's'}`}
          accentColor="#10B981"
        />
      </div>

      {/* Aging panel */}
      <AgingPanel invoices={invoices} active={agingBucket} onPick={setAgingBucket} />

      {/* Filter bar */}
      <div className="relative rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <TableLoadBar active={showBar} />
        <div className="px-5 py-3 flex items-center gap-3 flex-wrap border-b border-gray-100">
          <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1">
            {STATUS_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = status === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setStatus(tab.value)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    active ? 'bg-white text-[#FF4D8D] shadow-sm' : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <BrandFilter value={brand} onChange={setBrand} options={brandOptions} />

          {teamMembers.length > 1 && (
            <TeamMemberFilter
              value={teamMemberFilter}
              onChange={setTeamMemberFilter}
              members={teamMembers}
            />
          )}

          <SearchInput value={search} onChange={setSearch} />

          {agingBucket !== 'all' && (
            <button
              onClick={() => setAgingBucket('all')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 text-xs font-semibold text-gray-600 hover:bg-gray-200 transition-colors"
              title="Clear aging filter"
            >
              Aging: {agingBucket === 'current' ? 'Current' : `${agingBucket} days`}
              <X className="h-3 w-3" />
            </button>
          )}

          <button
            onClick={fetchInvoices}
            disabled={loading}
            className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 disabled:opacity-40 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </button>

          <button
            onClick={handleExportCsv}
            disabled={loading || invoices.length === 0}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 disabled:opacity-40 transition-colors"
            title={filteredInvoices.length < invoices.length ? `Export ${filteredInvoices.length} filtered invoices to CSV` : `Export all ${invoices.length} invoices to CSV`}
          >
            <FileDown className="h-3.5 w-3.5" />
            CSV
          </button>

          <button
            onClick={handleExportXlsx}
            disabled={loading || invoices.length === 0}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 disabled:opacity-40 transition-colors"
            title={filteredInvoices.length < invoices.length ? `Export ${filteredInvoices.length} filtered invoices to Excel` : `Export all ${invoices.length} invoices to Excel`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Excel
          </button>
        </div>

        {error && (
          <div className="px-5 py-3 bg-red-50 border-b border-red-100 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Invoice list */}
        {loading && invoices.length === 0 ? (
          <div className="p-12 text-center">
            <div className="inline-block h-8 w-8 rounded-full border-2 border-gray-200 border-t-[#FF4D8D] animate-spin" />
          </div>
        ) : invoices.length === 0 ? (
          <EmptyState onCreate={() => setCreating(true)} />
        ) : filteredInvoices.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
              <Search className="h-5 w-5 text-gray-300" />
            </div>
            <p className="text-sm font-bold text-[#1A1B3A]">No invoices match your filters</p>
            <p className="text-xs text-gray-400 mt-1">Try clearing search, status, or aging filters.</p>
          </div>
        ) : (
          <div className={cn('overflow-x-auto', showBar && invoices.length > 0 && 'opacity-60 transition-opacity duration-200')}>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/60 border-b border-gray-100">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-[#FF4D8D] focus:ring-[#FF4D8D]/30 cursor-pointer"
                      aria-label="Select all visible"
                    />
                  </th>
                  <Th align="left">Invoice #</Th>
                  <Th align="left">Brand</Th>
                  <Th align="left">Period</Th>
                  <Th align="right">Total</Th>
                  <Th align="center">Status</Th>
                  <Th align="left">Issued</Th>
                  <Th align="left">Due / Aging</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => {
                  const isSelected = selectedIds.has(inv.id);
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => setActiveInvoice(inv)}
                      className={cn(
                        'border-b border-gray-50 cursor-pointer transition-colors',
                        isSelected ? 'bg-[#FFF0F5]/60 hover:bg-[#FFF0F5]/80' : 'hover:bg-[#FFF0F5]/40',
                      )}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(inv.id)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-[#FF4D8D] focus:ring-[#FF4D8D]/30 cursor-pointer"
                          aria-label={`Select ${inv.invoice_number}`}
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-[#1A1B3A]">
                        <div>{inv.invoice_number}</div>
                        {/* Show issuer name when there's > 1 team member, so Tyler's
                            and Vic's invoices are distinguishable in the unfiltered view. */}
                        {teamMembers.length > 1 && inv.team_member_id && (
                          <div className="text-[10px] font-normal text-gray-400 mt-0.5 normal-case">
                            {memberNameById.get(inv.team_member_id) ?? '—'}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#1A1B3A]">{inv.brand}</td>
                      <td className="px-4 py-3 text-gray-600">{fmtPeriod(inv.period_month)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-[#1A1B3A]">
                        {formatCurrency(Number(inv.total_amount))}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={inv.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDate(inv.generated_at)}</td>
                      <td className="px-4 py-3 text-xs">
                        {inv.due_date ? (
                          <div>
                            <div className="text-gray-500">{formatDate(inv.due_date)}</div>
                            <DueIndicator invoice={inv} />
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <a
                          href={`/api/invoices/${inv.id}/pdf`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:text-[#FF4D8D] hover:bg-white rounded-lg transition-colors"
                          title="Download PDF"
                        >
                          <Download className="h-3.5 w-3.5" />
                          PDF
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bulk action bar (sticky bottom) */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-4">
          <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#1A1B3A] text-white shadow-2xl border border-[#2D2E5C]">
            <span className="text-sm">
              <span className="font-bold">{selectedIds.size}</span> selected
            </span>
            <span className="h-5 w-px bg-white/20" />
            <button
              onClick={() => handleBulk('sent')}
              disabled={bulkAction !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-bold hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {bulkAction === 'sent' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Mark as Sent
            </button>
            <button
              onClick={() => handleBulk('paid')}
              disabled={bulkAction !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 disabled:opacity-50 transition-colors"
            >
              {bulkAction === 'paid' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Mark as Paid
            </button>
            <button
              onClick={() => handleBulk('void')}
              disabled={bulkAction !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-400/40 text-red-300 text-xs font-bold hover:bg-red-500/20 disabled:opacity-50 transition-colors"
            >
              {bulkAction === 'void' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
              Void
            </button>
            <span className="h-5 w-px bg-white/20" />
            <button
              onClick={() => setSelectedIds(new Set())}
              className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              title="Clear selection"
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* New invoice modal */}
      <NewInvoiceModal
        open={creating}
        defaultMonth={currentMonth()}
        onClose={() => setCreating(false)}
        onCreated={handleCreated}
        onViewExisting={handleViewExisting}
      />

      {/* Detail drawer */}
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

// ── Helpers / sub-components ──────────────────────────────────────────

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search invoice #, brand, period…"
        className="bg-white border border-gray-200 rounded-xl pl-9 pr-8 py-2 text-xs text-[#1A1B3A] focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D] w-56 transition-colors"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Clear search"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function DueIndicator({ invoice }: { invoice: Invoice }) {
  if (invoice.status === 'paid' || invoice.status === 'void') return null;
  if (!invoice.due_date) return null;
  const due = new Date(invoice.due_date);
  const days = Math.floor((Date.now() - due.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) {
    const inDays = Math.abs(days);
    return (
      <div className="text-[10px] text-gray-400 mt-0.5">
        {inDays === 0 ? 'Due today' : `Due in ${inDays} day${inDays === 1 ? '' : 's'}`}
      </div>
    );
  }
  const tone = days > 60 ? 'text-red-600' : days > 30 ? 'text-orange-600' : 'text-amber-600';
  return (
    <div className={cn('text-[10px] font-bold mt-0.5', tone)}>
      {days} day{days === 1 ? '' : 's'} overdue
    </div>
  );
}


const fmtPeriod = (ym: string) => formatPeriod(ym, { short: true });

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      className={cn(
        'px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
      )}
    >
      {children}
    </th>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    pending: { bg: 'bg-amber-50 border-amber-200',   text: 'text-amber-700',  label: 'Pending' },
    sent:    { bg: 'bg-blue-50 border-blue-200',     text: 'text-blue-700',   label: 'Sent' },
    paid:    { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', label: 'Paid' },
    void:    { bg: 'bg-gray-100 border-gray-300',    text: 'text-gray-500',   label: 'Void' },
  };
  const c = config[status] ?? { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-700', label: status };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border', c.bg, c.text)}>
      {c.label}
    </span>
  );
}

function BrandFilter({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-white border border-gray-200 rounded-xl pl-9 pr-8 py-2 text-xs font-semibold text-[#1A1B3A] focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D] cursor-pointer"
      >
        <option value="all">All brands</option>
        {options.map((b) => <option key={b} value={b}>{b}</option>)}
      </select>
      <Filter className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  );
}

function TeamMemberFilter({ value, onChange, members }: {
  value: string;
  onChange: (v: string) => void;
  members: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-white border border-gray-200 rounded-xl pl-9 pr-8 py-2 text-xs font-semibold text-[#1A1B3A] focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D] cursor-pointer"
        title="Filter invoices by who issued them"
      >
        <option value="all">All payees</option>
        {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <Users className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="px-6 py-16 text-center">
      <div className="mx-auto h-14 w-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
        <Receipt className="h-7 w-7 text-gray-300" />
      </div>
      <h3 className="text-base font-bold text-[#1A1B3A] mb-1">No invoices yet</h3>
      <p className="text-sm text-gray-400 mb-6 max-w-sm mx-auto">
        Generate your first invoice — pick a brand and a month, we&apos;ll pull the line items from your earnings.
      </p>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-2 px-4 py-2 bg-[#FF4D8D] text-white rounded-xl text-sm font-bold hover:bg-[#E91E8C] transition-colors shadow-sm"
      >
        <Plus className="h-4 w-4" />
        Create Invoice
      </button>
    </div>
  );
}
