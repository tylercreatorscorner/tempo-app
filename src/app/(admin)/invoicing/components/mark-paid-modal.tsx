'use client';

/**
 * Modal that captures payment detail when marking an invoice as paid:
 * method, reference, exact amount received, and notes. Submitting PATCHes
 * the invoice to status='paid' along with these fields.
 */

import { useEffect, useState } from 'react';
import { X, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/format';

const METHODS = [
  { value: 'wire',   label: 'Wire Transfer' },
  { value: 'ach',    label: 'ACH' },
  { value: 'check',  label: 'Check' },
  { value: 'zelle',  label: 'Zelle' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'other',  label: 'Other' },
];

interface Props {
  open: boolean;
  invoiceNumber: string;
  totalAmount: number;
  /** Pre-fill amount received with the invoice total. */
  defaultAmount?: number;
  /** Pre-fill method (e.g. when re-marking paid after an error). */
  defaultMethod?: string | null;
  defaultReference?: string | null;
  defaultNotes?: string | null;
  saving: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    payment_method: string;
    payment_reference: string | null;
    amount_received: number;
    payment_received_notes: string | null;
  }) => void;
}

export function MarkPaidModal({
  open, invoiceNumber, totalAmount,
  defaultAmount, defaultMethod, defaultReference, defaultNotes,
  saving, onClose, onConfirm,
}: Props) {
  const [method, setMethod] = useState<string>(defaultMethod ?? 'wire');
  const [reference, setReference] = useState<string>(defaultReference ?? '');
  const [amount, setAmount] = useState<string>(String(defaultAmount ?? totalAmount));
  const [notes, setNotes] = useState<string>(defaultNotes ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMethod(defaultMethod ?? 'wire');
      setReference(defaultReference ?? '');
      setAmount(String(defaultAmount ?? totalAmount));
      setNotes(defaultNotes ?? '');
      setError(null);
    }
  }, [open, defaultMethod, defaultReference, defaultAmount, defaultNotes, totalAmount]);

  if (!open) return null;

  const amountNum = parseFloat(amount);
  const amountValid = Number.isFinite(amountNum) && amountNum >= 0;
  const diff = amountValid ? amountNum - totalAmount : 0;

  function handleSubmit() {
    if (!amountValid) {
      setError('Amount received must be a non-negative number');
      return;
    }
    onConfirm({
      payment_method: method,
      payment_reference: reference.trim() || null,
      amount_received: amountNum,
      payment_received_notes: notes.trim() || null,
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button aria-label="Close" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0 shadow-sm">
              <CheckCircle2 className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400">Mark as Paid</p>
              <h2 className="text-lg font-extrabold text-[#1A1B3A] font-mono truncate">{invoiceNumber}</h2>
              <p className="text-xs text-gray-500 mt-0.5">Capture payment detail for reconciliation.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="h-8 w-8 rounded-lg hover:bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Method */}
          <Field label="Payment Method">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white text-[#1A1B3A] focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D] disabled:opacity-50"
            >
              {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>

          {/* Reference */}
          <Field label="Reference / Transaction #" hint="Optional">
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. WIRE-20260503-ABC, check #1042"
              disabled={saving}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-[#1A1B3A] focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D] disabled:opacity-50"
            />
          </Field>

          {/* Amount received */}
          <Field
            label="Amount Received"
            hint={diff !== 0 && amountValid
              ? (diff > 0
                ? `${formatCurrency(diff)} over invoice total`
                : `${formatCurrency(Math.abs(diff))} short — partial / fees deducted`)
              : `Invoice total ${formatCurrency(totalAmount)}`
            }
            tone={!amountValid ? 'error' : diff < 0 ? 'warn' : 'default'}
          >
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">$</span>
              <input
                type="number"
                step={0.01}
                min={0}
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setError(null); }}
                disabled={saving}
                className="w-full pl-7 pr-3 py-2 rounded-xl border border-gray-200 text-sm tabular-nums text-[#1A1B3A] focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D] disabled:opacity-50"
              />
            </div>
          </Field>

          {/* Notes */}
          <Field label="Notes" hint="Optional · for your records">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. wire fee $25 deducted, partial — remainder due 5/15"
              rows={2}
              disabled={saving}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-[#1A1B3A] focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D] resize-y disabled:opacity-50"
            />
          </Field>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">{error}</div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50/40">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-40">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !amountValid}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-emerald-500 rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-colors shadow-sm"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Mark as Paid'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, tone = 'default', children }: {
  label: string;
  hint?: string;
  tone?: 'default' | 'error' | 'warn';
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-semibold text-gray-700">{label}</span>
        {hint && (
          <span className={cn(
            'text-[11px]',
            tone === 'error' ? 'text-red-600 font-medium' : tone === 'warn' ? 'text-amber-600 font-medium' : 'text-gray-400',
          )}>{hint}</span>
        )}
      </div>
      {children}
    </label>
  );
}
