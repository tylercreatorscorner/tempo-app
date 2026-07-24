'use client';

/**
 * Inline-editable Marketing GMV figure inside the brand row's GMV cell. Click to
 * edit, Enter / blur to save, Esc to cancel. Sends the roster brand + amount to
 * /api/earnings/marketing-gmv (which expands umbrella → per-store writes
 * server-side), then asks the parent to refetch.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import type { BrandRow } from './types';

export function MarketingGmvEditor({ row, month, onSaved, onError }: {
  row: BrandRow;
  month: string;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.marketingGmv ? String(row.marketingGmv) : '');
  const [saving, setSaving] = useState(false);
  // Set just before an Escape-triggered blur so onBlur cancels instead of saves.
  const cancelledRef = useRef(false);

  useEffect(() => {
    setDraft(row.marketingGmv ? String(row.marketingGmv) : '');
  }, [row.marketingGmv]);

  const cancel = () => {
    setDraft(row.marketingGmv ? String(row.marketingGmv) : '');
    setEditing(false);
  };

  async function commit() {
    const amount = draft.trim() === '' ? 0 : parseFloat(draft);
    if (!Number.isFinite(amount) || amount < 0) { cancel(); return; }
    if (amount === row.marketingGmv) { setEditing(false); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/earnings/marketing-gmv', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: row.brand, month, amount }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setEditing(false);
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to save marketing GMV');
      cancel();
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <span className="text-muted-foreground">$</span>
        <input
          autoFocus
          type="number"
          min={0}
          step={100}
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancelledRef.current = true; e.currentTarget.blur(); }
          }}
          onBlur={() => {
            if (cancelledRef.current) { cancelledRef.current = false; cancel(); return; }
            commit();
          }}
          className="w-24 px-1.5 py-0.5 text-[11px] tabular-nums rounded-md border border-[var(--primary)]/50 bg-card focus:outline-none focus:ring-1 focus:ring-[var(--primary)]/40"
        />
        {saving && <Loader2 className="h-3 w-3 animate-spin text-[var(--primary)]" />}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className="group/mkt inline-flex items-center gap-1 hover:text-[var(--primary)] transition-colors"
      title="Edit marketing GMV for this month"
    >
      {row.marketingGmv > 0 ? (
        <span className="tabular-nums">{formatCurrency(row.marketingGmv)} mkt</span>
      ) : (
        <span className="inline-flex items-center gap-0.5 text-muted-foreground group-hover/mkt:text-[var(--primary)]">
          <Plus className="h-2.5 w-2.5" /> marketing
        </span>
      )}
      <Pencil className="h-2.5 w-2.5 opacity-0 group-hover/mkt:opacity-100 transition-opacity" />
    </button>
  );
}
