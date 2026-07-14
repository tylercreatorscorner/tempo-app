'use client';

/**
 * Per-creator commission rate overrides for a brand.
 *
 * These let you set a different rate for a specific creator on a specific
 * brand (e.g. give @nicole 6% on Toplux while everyone else stays at 5%).
 * The override wins over the brand default in the earnings calculation.
 *
 * Used as a section inside BrandEditSheet. Self-contained — fetches its
 * own data, has its own save/delete actions, persists immediately on
 * each change (no batched save).
 */

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Save, Loader2, AlertCircle, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Override {
  id: number;
  creator_name: string;
  brand: string;
  rate: number | string;
}

interface ManagedCreator {
  handle: string;
  real_name: string | null;
}

interface Props {
  brand: string;
  /** Brand default rate (percent) — shown for comparison. */
  brandRate: number;
}

export function CreatorOverridesSection({ brand, brandRate }: Props) {
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [managed, setManaged] = useState<ManagedCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draftCreator, setDraftCreator] = useState('');
  const [draftRate, setDraftRate] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/creator-rates?brand=${encodeURIComponent(brand)}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setOverrides(j.overrides ?? []);
      setManaged(j.managed ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load overrides');
    } finally {
      setLoading(false);
    }
  }, [brand]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build "available" creators for the dropdown — managed for this brand,
  // minus those who already have an override.
  const overrideHandles = new Set(overrides.map((o) => o.creator_name));
  const available = managed.filter((m) => !overrideHandles.has(m.handle));

  async function handleAdd() {
    if (!draftCreator) {
      setError('Pick a creator first');
      return;
    }
    const rate = parseFloat(draftRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setError('Rate must be a number between 0 and 100');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const res = await fetch('/api/creator-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, creator_name: draftCreator, rate }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setOverrides((prev) => [j.override, ...prev]);
      setDraftCreator('');
      setDraftRate('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add failed');
    } finally {
      setAdding(false);
    }
  }

  async function handleUpdate(creator: string) {
    const newRate = parseFloat(drafts[creator] ?? '');
    if (!Number.isFinite(newRate) || newRate < 0 || newRate > 100) {
      setError('Rate must be a number between 0 and 100');
      return;
    }
    setSavingId(creator);
    setError(null);
    try {
      const res = await fetch('/api/creator-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, creator_name: creator, rate: newRate }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setOverrides((prev) => prev.map((o) => o.creator_name === creator ? j.override : o));
      setDrafts((d) => { const n = { ...d }; delete n[creator]; return n; });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(creator: string) {
    if (!confirm(`Remove rate override for @${creator}? They'll fall back to the brand default of ${brandRate.toFixed(2)}%.`)) return;
    setSavingId(creator);
    setError(null);
    try {
      const res = await fetch('/api/creator-rates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, creator_name: creator }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setOverrides((prev) => prev.filter((o) => o.creator_name !== creator));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div>
      <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500 mb-1.5">
        Per-Creator Rate Overrides
      </h3>
      <p className="text-[11px] text-gray-400 mb-3">
        Override the brand default of {brandRate.toFixed(2)}% for specific creators. Saves immediately.
      </p>

      {/* Existing overrides */}
      {loading ? (
        <div className="rounded-xl border border-gray-100 px-3 py-4 text-center text-xs text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin mx-auto" />
        </div>
      ) : overrides.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-center">
          <Users className="h-4 w-4 text-gray-300 mx-auto mb-1.5" />
          <p className="text-xs text-gray-400">No overrides yet · add one below</p>
        </div>
      ) : (
        <div className="space-y-1.5 mb-3">
          {overrides.map((o) => {
            const dirtyVal = drafts[o.creator_name];
            const isDirty = dirtyVal !== undefined && parseFloat(dirtyVal) !== Number(o.rate);
            const isSaving = savingId === o.creator_name;
            return (
              <div
                key={o.id}
                className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2"
              >
                <span className="flex-1 min-w-0 text-sm font-semibold text-[#1A1B3A] truncate">
                  @{o.creator_name}
                </span>
                <div className="relative">
                  <input
                    type="number"
                    step={0.25}
                    min={0}
                    max={100}
                    value={dirtyVal ?? String(o.rate)}
                    onChange={(e) => setDrafts((d) => ({ ...d, [o.creator_name]: e.target.value }))}
                    disabled={isSaving}
                    className="w-20 px-2 py-1 pr-6 rounded-lg border border-gray-200 text-xs text-right tabular-nums text-[#1A1B3A] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] disabled:opacity-50"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">%</span>
                </div>
                {isDirty && !isSaving && (
                  <button
                    onClick={() => handleUpdate(o.creator_name)}
                    className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-[var(--primary)] text-white hover:bg-[#E91E8C] transition-colors"
                    title="Save"
                  >
                    <Save className="h-3.5 w-3.5" />
                  </button>
                )}
                {isSaving && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                <button
                  onClick={() => handleDelete(o.creator_name)}
                  disabled={isSaving}
                  className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                  title="Remove override"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add new */}
      <div className="rounded-xl bg-[#FFF0F5]/40 border border-primary/10 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <select
            value={draftCreator}
            onChange={(e) => setDraftCreator(e.target.value)}
            disabled={adding || available.length === 0}
            className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white text-[#1A1B3A] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] disabled:opacity-50"
          >
            <option value="">{available.length === 0 ? 'No creators left to override' : 'Pick a creator…'}</option>
            {available.map((m) => (
              <option key={m.handle} value={m.handle}>
                @{m.handle}{m.real_name ? ` (${m.real_name})` : ''}
              </option>
            ))}
          </select>
          <div className="relative">
            <input
              type="number"
              step={0.25}
              min={0}
              max={100}
              value={draftRate}
              onChange={(e) => setDraftRate(e.target.value)}
              placeholder="Rate"
              disabled={adding}
              className="w-20 px-2 py-1.5 pr-6 rounded-lg border border-gray-200 text-xs text-right tabular-nums text-[#1A1B3A] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] disabled:opacity-50"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">%</span>
          </div>
          <button
            onClick={handleAdd}
            disabled={adding || !draftCreator || !draftRate}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--primary)] text-white text-xs font-bold hover:bg-[#E91E8C] disabled:opacity-50 transition-colors"
          >
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add
          </button>
        </div>
      </div>

      {error && (
        <div className={cn('mt-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700 flex items-center gap-1.5')}>
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
