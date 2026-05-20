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
import { X, Loader2, Receipt, ChevronDown, Sparkles, ExternalLink, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, buildMonthOptions } from '@/lib/utils/format';
import type { Invoice } from './invoice-detail-sheet';
import { ModalOverlay } from '@/components/ui/modal-overlay';

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

      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#FF4D8D] to-[#E91E8C] flex items-center justify-center flex-shrink-0 shadow-sm">
              <Receipt className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400">New</p>
              <h2 className="text-lg font-extrabold text-[#1A1B3A]">Create Invoice</h2>
              <p className="text-xs text-gray-500 mt-0.5">Pulls live earnings data and creates an invoice for one brand &amp; month.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg hover:bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Month picker */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Period</label>
            <div className="relative">
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                disabled={creating}
                className="w-full appearance-none bg-white border border-gray-200 rounded-xl pl-4 pr-10 py-2.5 text-sm font-semibold text-[#1A1B3A] focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D] cursor-pointer disabled:opacity-50"
              >
                {monthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <ChevronDown className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Brand picker */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="block text-xs font-semibold text-gray-700">Brand</label>
              <span className="text-[11px] text-gray-400">
                {loadingPreview ? 'Loading…' : `${brands.length} brand${brands.length === 1 ? '' : 's'} with earnings`}
              </span>
            </div>

            {loadingPreview ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />)}
              </div>
            ) : brands.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center">
                <Sparkles className="h-5 w-5 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No brands have earnings for this month.</p>
                <p className="text-xs text-gray-400 mt-1">Pick a different period.</p>
              </div>
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
                          ? 'border-[#FF4D8D] bg-[#FFF0F5] shadow-sm'
                          : 'border-gray-200 bg-white hover:border-gray-300',
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[#1A1B3A] truncate">{b.brandLabel}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            {formatCurrency(b.totalGmv)} GMV
                            {b.commission > 0 && <> · Comm {formatCurrency(b.commission)}</>}
                            {b.retainer > 0 && <> · Ret {formatCurrency(b.retainer)}</>}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total</p>
                          <p className={cn('text-base font-extrabold tabular-nums', active ? 'text-[#FF4D8D]' : 'text-[#1A1B3A]')}>
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
            <div className="rounded-xl bg-gradient-to-br from-[#1A1B3A] to-[#2D2E5C] p-4 text-white">
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-pink-200">Preview</p>
                <p className="text-[11px] text-pink-200/80">{selectedBrandData.brandLabel} · {month}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {selectedBrandData.commission > 0 && <PreviewLine label="Commission" value={formatCurrency(selectedBrandData.commission)} />}
                {selectedBrandData.retainer > 0 && <PreviewLine label="Retainer" value={formatCurrency(selectedBrandData.retainer)} />}
                {selectedBrandData.productRetainer > 0 && <PreviewLine label="Product Retainer" value={formatCurrency(selectedBrandData.productRetainer)} />}
                {selectedBrandData.launchFee > 0 && <PreviewLine label="Launch Fee" value={formatCurrency(selectedBrandData.launchFee)} />}
              </div>
              <div className="border-t border-white/10 mt-3 pt-3 flex items-baseline justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-pink-200">Invoice Total</span>
                <span className="text-2xl font-extrabold text-white tabular-nums">{formatCurrency(selectedBrandData.total)}</span>
              </div>
            </div>
          )}

          {/* Conflict notice */}
          {conflict && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-amber-900">Invoice already exists</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {conflict.invoice_number} ({conflict.status}) is already on file for this brand and month.
                </p>
              </div>
              <button
                onClick={() => onViewExisting(conflict.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors flex-shrink-0"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50/40">
          <button onClick={onClose} disabled={creating} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-40">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !selectedBrand || !!conflict}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-[#FF4D8D] rounded-xl hover:bg-[#E91E8C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
            {creating ? 'Generating…' : 'Generate Invoice'}
          </button>
        </div>
      </div>
    </div>
    </ModalOverlay>
  );
}

function PreviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-pink-200/80 text-[11px]">{label}</span>
      <span className="text-white font-semibold tabular-nums">{value}</span>
    </div>
  );
}
