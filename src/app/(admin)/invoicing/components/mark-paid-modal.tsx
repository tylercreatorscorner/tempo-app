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
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

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
    <ModalOverlay onClose={onClose} closeOnBackdropClick={false}>
    <div className="absolute inset-0 flex items-center justify-center p-4">
      <button aria-label="Close" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-card rounded-xl border border-border shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-5 border-b border-border flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-pulse-grad flex items-center justify-center flex-shrink-0 shadow-pulse-primary">
              <CheckCircle2 className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Mark as Paid</p>
              <h2 className="text-lg font-extrabold text-[var(--foreground)] font-mono truncate">{invoiceNumber}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Capture payment detail for reconciliation.</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={saving}
            className="flex-shrink-0"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Method */}
          <Field label="Payment Method">
            <Select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              disabled={saving}
            >
              {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </Field>

          {/* Reference */}
          <Field label="Reference / Transaction #" hint="Optional">
            <Input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. WIRE-20260503-ABC, check #1042"
              disabled={saving}
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
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none z-10">$</span>
              <Input
                type="number"
                step={0.01}
                min={0}
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setError(null); }}
                disabled={saving}
                className="pl-7 tabular-nums"
              />
            </div>
          </Field>

          {/* Notes */}
          <Field label="Notes" hint="Optional · for your records">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. wire fee $25 deducted, partial — remainder due 5/15"
              rows={2}
              disabled={saving}
            />
          </Field>

          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">{error}</div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2 bg-muted/40">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={saving || !amountValid}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Mark as Paid'}
          </Button>
        </div>
      </div>
    </div>
    </ModalOverlay>
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
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11.5px] font-semibold tracking-[0.02em] uppercase text-muted-foreground">{label}</span>
        {hint && (
          <span className={cn(
            'text-[11px]',
            tone === 'error' ? 'text-destructive font-medium' : tone === 'warn' ? 'text-[var(--pulse-warn)] font-medium' : 'text-muted-foreground',
          )}>{hint}</span>
        )}
      </div>
      {children}
    </label>
  );
}
