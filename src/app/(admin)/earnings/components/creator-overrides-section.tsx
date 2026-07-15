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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';

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
      <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1.5">
        Per-Creator Rate Overrides
      </h3>
      <p className="text-[11px] text-muted-foreground mb-3">
        Override the brand default of {brandRate.toFixed(2)}% for specific creators. Saves immediately.
      </p>

      {/* Existing overrides */}
      {loading ? (
        <div className="rounded-xl border border-border px-3 py-4 text-center text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mx-auto" />
        </div>
      ) : overrides.length === 0 ? (
        <EmptyState
          className="mb-3"
          icon={<Users className="h-5 w-5" />}
          title="No overrides yet"
          description="Add one below to give a creator a custom rate."
        />
      ) : (
        <div className="space-y-1.5 mb-3">
          {overrides.map((o) => {
            const dirtyVal = drafts[o.creator_name];
            const isDirty = dirtyVal !== undefined && parseFloat(dirtyVal) !== Number(o.rate);
            const isSaving = savingId === o.creator_name;
            return (
              <div
                key={o.id}
                className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2"
              >
                <span className="flex-1 min-w-0 text-sm font-semibold text-foreground truncate">
                  @{o.creator_name}
                </span>
                <div className="relative">
                  <Input
                    type="number"
                    step={0.25}
                    min={0}
                    max={100}
                    value={dirtyVal ?? String(o.rate)}
                    onChange={(e) => setDrafts((d) => ({ ...d, [o.creator_name]: e.target.value }))}
                    disabled={isSaving}
                    className="w-20 px-2 py-1 pr-6 text-xs text-right tabular-nums"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">%</span>
                </div>
                {isDirty && !isSaving && (
                  <Button
                    variant="primary"
                    size="icon"
                    onClick={() => handleUpdate(o.creator_name)}
                    className="h-7 w-7"
                    title="Save"
                  >
                    <Save className="h-3.5 w-3.5" />
                  </Button>
                )}
                {isSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(o.creator_name)}
                  disabled={isSaving}
                  className="h-7 w-7 hover:text-[var(--pulse-neg)] hover:bg-[var(--pulse-neg-bg)]"
                  title="Remove override"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add new */}
      <div className="rounded-xl bg-secondary/50 border border-border p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <Select
              value={draftCreator}
              onChange={(e) => setDraftCreator(e.target.value)}
              disabled={adding || available.length === 0}
              className="py-1.5 text-xs"
            >
              <option value="">{available.length === 0 ? 'No creators left to override' : 'Pick a creator…'}</option>
              {available.map((m) => (
                <option key={m.handle} value={m.handle}>
                  @{m.handle}{m.real_name ? ` (${m.real_name})` : ''}
                </option>
              ))}
            </Select>
          </div>
          <div className="relative">
            <Input
              type="number"
              step={0.25}
              min={0}
              max={100}
              value={draftRate}
              onChange={(e) => setDraftRate(e.target.value)}
              placeholder="Rate"
              disabled={adding}
              className="w-20 px-2 py-1.5 pr-6 text-xs text-right tabular-nums"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">%</span>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={handleAdd}
            disabled={adding || !draftCreator || !draftRate}
          >
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-2 rounded-md bg-[var(--pulse-neg-bg)] border border-[var(--pulse-neg)]/20 px-3 py-2 text-xs text-[var(--pulse-neg)] flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
