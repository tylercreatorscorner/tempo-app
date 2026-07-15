'use client';

/**
 * New invoice creation modal.
 *
 * Flow:
 *   1. User picks a month (defaults to current)
 *   2. We fetch /api/earnings?month=X to populate brand options with previews
 *      (each brand card shows the GMV + the invoice total it would generate)
 *   3. User picks a brand → Create button enables → POST /api/invoices
 *   4. On 409 (already exists), surface a "View existing invoice" action
 *      that bubbles up to the parent
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Loader2, Receipt, Sparkles, ExternalLink, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, buildMonthOptions } from '@/lib/utils/format';
import type { Invoice } from './invoice-detail-sheet';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';

interface BrandOption {
  brand: string;
  brandLabel: string;
  totalGmv: number;
  total: number;
  commission: number;
  retainer: number;
  productRetainer: number;
  launchFee: number;
}

interface ExistingInvoiceConflict {
  id: string;
  invoice_number: string;
  status: string;
}

interface Props {
  open: boolean;
  defaultMonth: string;
  onClose: () => void;
  onCreated: (invoice: Invoice) => void;
  onViewExisting: (id: string) => void;
}

export function NewInvoiceModal({ open, defaultMonth, onClose, onCreated, onViewExisting }: Props) {
  const monthOptions = useMemo(() => buildMonthOptions(13), []);
  const [month, setMonth] = useState(defaultMonth);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ExistingInvoiceConflict | null>(null);

  // Reset state when re-opened
  useEffect(() => {
    if (open) {
      setMonth(defaultMonth);
      setSelectedBrand(null);
      setError(null);
      setConflict(null);
    }
  }, [open, defaultMonth]);

  // Fetch earnings preview when month changes
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingPreview(true);
    setError(null);
    setConflict(null);
    fetch(`/api/earnings?month=${month}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.error) throw new Error(j.error);
        const opts: BrandOption[] = (j.brands ?? [])
          .map((b: BrandOption) => b)
          .filter((b: BrandOption) => b.total > 0)
          .sort((a: BrandOption, b: BrandOption) => b.total - a.total);
        setBrands(opts);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load brands'); })
      .finally(() => { if (!cancelled) setLoadingPreview(false); });
    return () => { cancelled = true; };
  }, [open, month]);

  const handleCreate = useCallback(async () => {
    if (!selectedBrand) return;
    setCreating(true);
    setError(null);
    setConflict(null);
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: selectedBrand, month }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (res.status === 409 && j.existing) {
          setConflict(j.existing);
          return;
        }
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      onCreated(j.invoice);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create invoice');
    } finally {
      setCreating(false);
    }
  }, [selectedBrand, month, onCreated]);

  if (!open) return null;

  const selectedBrandData = brands.find((b) => b.brand === selectedBrand) ?? null;

  return (
    <ModalOverlay onClose={onClose} closeOnBackdropClick={false}>
    <div className="absolute inset-0 flex items-center justify-center p-4">
      <button aria-label="Close" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <Card className="relative w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-pulse-grad flex items-center justify-center flex-shrink-0 shadow-pulse-primary">
              <Receipt className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">New</p>
              <h2 className="text-lg font-extrabold text-foreground">Create Invoice</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Pulls live earnings data and creates an invoice for one brand &amp; month.</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="flex-shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
          {/* Month picker */}
          <div>
            <Label>Period</Label>
            <Select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              disabled={creating}
            >
              {monthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>

          {/* Brand picker */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <Label className="mb-0">Brand</Label>
              <span className="text-[11px] text-muted-foreground">
                {loadingPreview ? 'Loading…' : `${brands.length} brand${brands.length === 1 ? '' : 's'} with earnings`}
              </span>
            </div>

            {loadingPreview ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
              </div>
            ) : brands.length === 0 ? (
              <EmptyState
                icon={<Sparkles className="h-5 w-5" />}
                title="No brands have earnings for this month."
                description="Pick a different period."
              />
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1 -mr-1">
                {brands.map((b) => {
                  const active = selectedBrand === b.brand;
                  return (
                    <button
                      key={b.brand}
                      onClick={() => { setSelectedBrand(b.brand); setConflict(null); setError(null); }}
                      disabled={creating}
                      className={cn(
                        'w-full text-left rounded-xl border-2 px-4 py-3 transition-all',
                        active
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border bg-card hover:border-primary/40',
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[var(--foreground)] truncate">{b.brandLabel}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {formatCurrency(b.totalGmv)} GMV
                            {b.commission > 0 && <> · Comm {formatCurrency(b.commission)}</>}
                            {b.retainer > 0 && <> · Ret {formatCurrency(b.retainer)}</>}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total</p>
                          <p className={cn('text-base font-extrabold tabular-nums', active ? 'text-[var(--primary)]' : 'text-[var(--foreground)]')}>
                            {formatCurrency(b.total)}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected preview */}
          {selectedBrandData && (
            <div className="rounded-xl bg-pulse-grad p-4 text-white">
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/70">Preview</p>
                <p className="text-[11px] text-white/70">{selectedBrandData.brandLabel} · {month}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {selectedBrandData.commission > 0 && <PreviewLine label="Commission" value={formatCurrency(selectedBrandData.commission)} />}
                {selectedBrandData.retainer > 0 && <PreviewLine label="Retainer" value={formatCurrency(selectedBrandData.retainer)} />}
                {selectedBrandData.productRetainer > 0 && <PreviewLine label="Product Retainer" value={formatCurrency(selectedBrandData.productRetainer)} />}
                {selectedBrandData.launchFee > 0 && <PreviewLine label="Launch Fee" value={formatCurrency(selectedBrandData.launchFee)} />}
              </div>
              <div className="border-t border-white/10 mt-3 pt-3 flex items-baseline justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/70">Invoice Total</span>
                <span className="text-2xl font-extrabold text-white tabular-nums">{formatCurrency(selectedBrandData.total)}</span>
              </div>
            </div>
          )}

          {/* Conflict notice */}
          {conflict && (
            <div className="rounded-xl bg-[var(--pulse-warn-bg)] border border-[var(--pulse-warn)]/25 px-4 py-3 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-[var(--pulse-warn)] flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">Invoice already exists</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {conflict.invoice_number} ({conflict.status}) is already on file for this brand and month.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => onViewExisting(conflict.id)} className="flex-shrink-0">
                <ExternalLink className="h-3.5 w-3.5" />
                Open
              </Button>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-[var(--pulse-neg-bg)] border border-[var(--pulse-neg)]/20 px-4 py-3 text-sm text-[var(--pulse-neg)]">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2 bg-muted/40">
          <Button variant="ghost" onClick={onClose} disabled={creating}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCreate}
            disabled={creating || !selectedBrand || !!conflict}
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
            {creating ? 'Generating…' : 'Generate Invoice'}
          </Button>
        </div>
      </Card>
    </div>
    </ModalOverlay>
  );
}

function PreviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-white/70 text-[11px]">{label}</span>
      <span className="text-white font-semibold tabular-nums">{value}</span>
    </div>
  );
}
