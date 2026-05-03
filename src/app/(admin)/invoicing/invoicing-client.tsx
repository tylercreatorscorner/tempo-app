'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Receipt, FileText, Clock, CheckCircle2, Filter, RefreshCw, Download, Plus, AlertCircle, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate, formatPeriod, currentMonth } from '@/lib/utils/format';
import { StatCard } from '@/components/dashboard/stat-card';
import { InvoiceDetailSheet, type Invoice } from './components/invoice-detail-sheet';
import { NewInvoiceModal } from './components/new-invoice-modal';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(initialOpenId ?? null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      if (brand !== 'all') params.set('brand', brand);
      const res = await fetch(`/api/invoices?${params.toString()}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setInvoices(j.invoices ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [status, brand]);

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

      {/* Filter bar */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
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

          <button
            onClick={fetchInvoices}
            disabled={loading}
            className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 disabled:opacity-40 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
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
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/60 border-b border-gray-100">
                  <Th align="left">Invoice #</Th>
                  <Th align="left">Brand</Th>
                  <Th align="left">Period</Th>
                  <Th align="right">Total</Th>
                  <Th align="center">Status</Th>
                  <Th align="left">Issued</Th>
                  <Th align="left">Due</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => setActiveInvoice(inv)}
                    className="border-b border-gray-50 hover:bg-[#FFF0F5]/40 cursor-pointer transition-colors group"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-[#1A1B3A]">{inv.invoice_number}</td>
                    <td className="px-4 py-3 font-semibold text-[#1A1B3A]">{inv.brand}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtPeriod(inv.period_month)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-[#1A1B3A]">
                      {formatCurrency(Number(inv.total_amount))}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDate(inv.generated_at)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {inv.due_date ? formatDate(inv.due_date) : <span className="text-gray-300">—</span>}
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
