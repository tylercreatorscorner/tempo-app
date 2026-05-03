'use client';

import { useEffect, useState } from 'react';
import { X, Save, Download, Trash2, Loader2, Send, CheckCircle2, RotateCcw, RefreshCw, Users, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/lib/utils/format';

export interface InvoiceCreator {
  name: string;
  gmv: number;
  rate: number;
  commission: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  brand: string;
  period_month: string;
  affiliate_gmv: number | string;
  marketing_gmv: number | string;
  total_gmv: number | string;
  commission: number | string;
  retainer: number | string;
  product_retainer: number | string;
  launch_fee: number | string;
  total_amount: number | string;
  status: 'pending' | 'sent' | 'paid' | 'void';
  generated_at: string;
  sent_at: string | null;
  paid_at: string | null;
  due_date: string | null;
  notes: string | null;
  bill_to_name: string | null;
  bill_to_email: string | null;
  bill_to_address: string | null;
  payment_instructions: string | null;
  creator_breakdown?: InvoiceCreator[] | null;
}

interface Props {
  invoice: Invoice;
  onClose: () => void;
  onUpdated: (inv: Invoice) => void;
  onDeleted: (id: string) => void;
}

export function InvoiceDetailSheet({ invoice, onClose, onUpdated, onDeleted }: Props) {
  const [draft, setDraft] = useState({
    commission: Number(invoice.commission),
    retainer: Number(invoice.retainer),
    product_retainer: Number(invoice.product_retainer),
    launch_fee: Number(invoice.launch_fee),
    due_date: invoice.due_date ?? '',
    notes: invoice.notes ?? '',
    bill_to_name: invoice.bill_to_name ?? '',
    bill_to_email: invoice.bill_to_email ?? '',
    bill_to_address: invoice.bill_to_address ?? '',
    payment_instructions: invoice.payment_instructions ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft({
      commission: Number(invoice.commission),
      retainer: Number(invoice.retainer),
      product_retainer: Number(invoice.product_retainer),
      launch_fee: Number(invoice.launch_fee),
      due_date: invoice.due_date ?? '',
      notes: invoice.notes ?? '',
      bill_to_name: invoice.bill_to_name ?? '',
      bill_to_email: invoice.bill_to_email ?? '',
      bill_to_address: invoice.bill_to_address ?? '',
      payment_instructions: invoice.payment_instructions ?? '',
    });
  }, [invoice]);

  const computedTotal =
    draft.commission + draft.retainer + draft.product_retainer + draft.launch_fee;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commission: draft.commission,
          retainer: draft.retainer,
          product_retainer: draft.product_retainer,
          launch_fee: draft.launch_fee,
          due_date: draft.due_date || null,
          notes: draft.notes || null,
          bill_to_name: draft.bill_to_name || null,
          bill_to_email: draft.bill_to_email || null,
          bill_to_address: draft.bill_to_address || null,
          payment_instructions: draft.payment_instructions || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      onUpdated(j.invoice);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(newStatus: 'pending' | 'sent' | 'paid' | 'void') {
    setStatusUpdating(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      onUpdated(j.invoice);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Status update failed');
    } finally {
      setStatusUpdating(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/refresh`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      onUpdated(j.invoice);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete invoice ${invoice.invoice_number}? This can't be undone.`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      onDeleted(invoice.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <button aria-label="Close" className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400">Invoice</p>
            <h2 className="text-lg font-extrabold text-[#1A1B3A] font-mono truncate">{invoice.invoice_number}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{invoice.brand} · {fmtPeriod(invoice.period_month)}</p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg hover:bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Status bar with actions */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/40 flex items-center gap-2 flex-wrap">
          <StatusPill status={invoice.status} />
          <div className="text-[11px] text-gray-500 ml-auto">
            {invoice.status === 'pending' && <>Generated {formatDate(invoice.generated_at)}</>}
            {invoice.status === 'sent' && invoice.sent_at && <>Sent {formatDate(invoice.sent_at)}</>}
            {invoice.status === 'paid' && invoice.paid_at && <>Paid {formatDate(invoice.paid_at)}</>}
            {invoice.status === 'void' && <>Voided</>}
          </div>
          <div className="basis-full" />
          {invoice.status === 'pending' && (
            <button
              onClick={() => handleStatus('sent')}
              disabled={statusUpdating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-bold hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
              Mark as Sent
            </button>
          )}
          {invoice.status === 'sent' && (
            <button
              onClick={() => handleStatus('paid')}
              disabled={statusUpdating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark as Paid
            </button>
          )}
          {(invoice.status === 'sent' || invoice.status === 'paid' || invoice.status === 'void') && (
            <button
              onClick={() => handleStatus('pending')}
              disabled={statusUpdating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-white disabled:opacity-50 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {invoice.status === 'void' ? 'Reopen' : 'Revert'}
            </button>
          )}
          {(invoice.status === 'pending' || invoice.status === 'sent') && (
            <button
              onClick={() => {
                if (confirm(`Void invoice ${invoice.invoice_number}? It stays on file but won't count toward outstanding.`)) {
                  handleStatus('void');
                }
              }}
              disabled={statusUpdating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              <Ban className="h-3.5 w-3.5" />
              Void
            </button>
          )}
          {invoice.status === 'pending' && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-white disabled:opacity-50 transition-colors"
              title="Re-pull line items and creator breakdown from current earnings"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
              {refreshing ? 'Refreshing…' : 'Refresh from Earnings'}
            </button>
          )}
          <a
            href={`/api/invoices/${invoice.id}/pdf`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-white transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </a>
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* GMV summary (read-only) */}
          <Section title="GMV Snapshot">
            <div className="grid grid-cols-3 gap-2">
              <ReadOnlyStat label="Affiliate" value={formatCurrency(Number(invoice.affiliate_gmv))} />
              <ReadOnlyStat label="Marketing" value={formatCurrency(Number(invoice.marketing_gmv))} />
              <ReadOnlyStat label="Total GMV" value={formatCurrency(Number(invoice.total_gmv))} highlight />
            </div>
            {Array.isArray(invoice.creator_breakdown) && (
              <div className={cn(
                'mt-2 rounded-xl px-3 py-2 flex items-center gap-2 text-xs',
                invoice.creator_breakdown.length > 0
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                  : 'bg-amber-50 border border-amber-200 text-amber-700',
              )}>
                <Users className="h-3.5 w-3.5 flex-shrink-0" />
                {invoice.creator_breakdown.length > 0 ? (
                  <span><span className="font-bold">{invoice.creator_breakdown.length}</span> creator{invoice.creator_breakdown.length === 1 ? '' : 's'} included in PDF breakdown</span>
                ) : (
                  <span>Creator breakdown is empty. Click <span className="font-bold">Refresh from Earnings</span> above to populate it.</span>
                )}
              </div>
            )}
          </Section>

          {/* Line items (editable) */}
          <Section title="Line Items">
            <Field label="Commission" prefix="$">
              <NumberInput value={draft.commission} step={10} onChange={(v) => setDraft({ ...draft, commission: v })} />
            </Field>
            <Field label="Retainer" prefix="$">
              <NumberInput value={draft.retainer} step={100} onChange={(v) => setDraft({ ...draft, retainer: v })} />
            </Field>
            <Field label="Product Retainer" prefix="$">
              <NumberInput value={draft.product_retainer} step={100} onChange={(v) => setDraft({ ...draft, product_retainer: v })} />
            </Field>
            <Field label="Launch Fee" prefix="$">
              <NumberInput value={draft.launch_fee} step={100} onChange={(v) => setDraft({ ...draft, launch_fee: v })} />
            </Field>
            <div className="rounded-xl bg-gradient-to-br from-[#FFF0F5] to-white border border-pink-100 px-4 py-3 flex items-center justify-between mt-2">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Total</span>
              <span className="text-xl font-extrabold text-[#FF4D8D] tabular-nums">{formatCurrency(computedTotal)}</span>
            </div>
          </Section>

          {/* Bill to */}
          <Section title="Bill To">
            <Field label="Recipient Name">
              <TextInput value={draft.bill_to_name} onChange={(v) => setDraft({ ...draft, bill_to_name: v })} placeholder="e.g. Jane Smith, Accounts Payable" />
            </Field>
            <Field label="Email">
              <TextInput type="email" value={draft.bill_to_email} onChange={(v) => setDraft({ ...draft, bill_to_email: v })} placeholder="ap@brand.com" />
            </Field>
            <Field label="Address" hint="Multi-line">
              <TextArea value={draft.bill_to_address} onChange={(v) => setDraft({ ...draft, bill_to_address: v })} placeholder="123 Main St&#10;Atlanta, GA 30303" />
            </Field>
          </Section>

          {/* Payment terms */}
          <Section title="Payment Terms">
            <Field label="Due Date">
              <TextInput type="date" value={draft.due_date} onChange={(v) => setDraft({ ...draft, due_date: v })} />
            </Field>
            <Field label="Payment Instructions" hint="Appears on the PDF">
              <TextArea
                value={draft.payment_instructions}
                onChange={(v) => setDraft({ ...draft, payment_instructions: v })}
                placeholder="Wire to:&#10;  Bank: ...&#10;  Routing #: ...&#10;  Account #: ..."
              />
            </Field>
            <Field label="Notes" hint="Optional · appears on the PDF below payment instructions">
              <TextArea value={draft.notes} onChange={(v) => setDraft({ ...draft, notes: v })} placeholder="e.g. Net 30, internal PO #, thanks message" />
            </Field>
          </Section>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50/40">
          {invoice.status === 'pending' ? (
            <button
              onClick={handleDelete}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-40 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          ) : <div />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-40">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-[#FF4D8D] rounded-xl hover:bg-[#E91E8C] disabled:opacity-50 transition-colors shadow-sm"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

function fmtPeriod(ym: string) {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function StatusPill({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    pending: { bg: 'bg-amber-100',   text: 'text-amber-800',   label: 'Pending' },
    sent:    { bg: 'bg-blue-100',    text: 'text-blue-800',    label: 'Sent' },
    paid:    { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Paid' },
    void:    { bg: 'bg-gray-200',    text: 'text-gray-600',    label: 'Void' },
  };
  const c = config[status] ?? { bg: 'bg-gray-100', text: 'text-gray-700', label: status };
  return (
    <span className={cn('inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider', c.bg, c.text)}>
      {c.label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500 mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, hint, prefix, children }: {
  label: string;
  hint?: string;
  prefix?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-semibold text-gray-700">{label}</span>
        {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
      </div>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">{prefix}</span>}
        <div className={cn(prefix && '[&_input]:pl-7')}>{children}</div>
      </div>
    </label>
  );
}

function NumberInput({ value, step, onChange }: { value: number; step: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  return (
    <input
      type="number"
      step={step}
      min={0}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseFloat(e.target.value);
        if (Number.isFinite(n) && n >= 0) onChange(n);
      }}
      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-[#1A1B3A] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D] transition-colors"
    />
  );
}

function TextInput({ value, placeholder, type = 'text', onChange }: {
  value: string; placeholder?: string; type?: 'text' | 'email' | 'date'; onChange: (v: string) => void;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-[#1A1B3A] focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D] transition-colors"
    />
  );
}

function TextArea({ value, placeholder, onChange }: { value: string; placeholder?: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-[#1A1B3A] focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D] transition-colors resize-y"
    />
  );
}

function ReadOnlyStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn(
      'rounded-xl border p-3',
      highlight ? 'border-[#FF4D8D]/20 bg-[#FFF0F5]/40' : 'border-gray-100 bg-gray-50/40',
    )}>
      <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={cn('text-sm font-bold tabular-nums mt-0.5', highlight ? 'text-[#FF4D8D]' : 'text-[#1A1B3A]')}>{value}</p>
    </div>
  );
}
