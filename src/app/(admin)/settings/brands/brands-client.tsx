'use client';

/**
 * Brand-level settings management.
 *
 * Lists every brand (active + archived) with their current financial
 * configuration. Click a row to edit via BrandEditSheet (the same drawer
 * used on /earnings, but in context-free mode — no marketing GMV input).
 *
 * "Add Brand" creates a new brands_v2 row. Settings are filled in lazily
 * on first edit (the existing upsert path handles row creation).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Loader2, X, AlertCircle, Archive, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/format';
import { BrandEditSheet, type CompensationModel } from '@/app/(admin)/earnings/components/brand-edit-sheet';

interface BrandRow {
  id: string;
  slug: string;
  name: string;
  color: string | null;
  is_archived: boolean;
  is_umbrella: boolean;
  created_at: string;
  settings: {
    commission_rate?: number | string | null;
    retainer?: number | string | null;
    launch_fee?: number | string | null;
    launch_fee_name?: string | null;
    launch_fee_ends?: string | null;
    product_retainer_amount?: number | string | null;
    product_retainer_name?: string | null;
    monthly_gmv_goal?: number | string | null;
    marketing_commission_rate?: number | string | null;
    compensation_model?: CompensationModel | null;
    bill_to_name?: string | null;
    bill_to_email?: string | null;
    bill_to_address?: string | null;
    payment_instructions?: string | null;
  } | null;
}

const MODEL_BADGE: Record<Exclude<CompensationModel, 'standard'>, { label: string; bg: string; text: string }> = {
  revshare_max:    { label: 'MAX',           bg: 'bg-purple-50 border-purple-200',   text: 'text-purple-700' },
  commission_only: { label: 'Comm only',     bg: 'bg-blue-50 border-blue-200',       text: 'text-blue-700' },
  retainer_only:  { label: 'Retainer only', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
};

export function BrandsSettingsClient() {
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BrandRow | null>(null);
  const [adding, setAdding] = useState(false);

  const fetchBrands = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/brands');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setBrands(j.brands ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load brands');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBrands(); }, [fetchBrands]);

  const stats = useMemo(() => {
    const active = brands.filter((b) => !b.is_archived);
    const archived = brands.filter((b) => b.is_archived);
    const monthlyCommit = active.reduce((s, b) => s + Number(b.settings?.retainer ?? 0) + Number(b.settings?.product_retainer_amount ?? 0), 0);
    return { active: active.length, archived: archived.length, monthlyCommit };
  }, [brands]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1A1B3A]">Brand Settings</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Manage compensation models, rates, retainers, fees, and invoice defaults across all brands.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchBrands}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FF4D8D] text-white text-sm font-bold hover:bg-[#E91E8C] transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Brand
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 max-w-2xl">
        <Stat label="Active" value={String(stats.active)} />
        <Stat label="Archived" value={String(stats.archived)} />
        <Stat label="Monthly Retainer Commit" value={formatCurrency(stats.monthlyCommit)} />
      </div>

      {/* Brand list */}
      {loading && brands.length === 0 ? (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-12 text-center">
          <div className="inline-block h-8 w-8 rounded-full border-2 border-gray-200 border-t-[#FF4D8D] animate-spin" />
        </div>
      ) : brands.length === 0 ? (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-12 text-center">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
            <Settings2 className="h-5 w-5 text-gray-300" />
          </div>
          <p className="text-sm font-bold text-[#1A1B3A]">No brands yet</p>
          <p className="text-xs text-gray-400 mt-1 mb-4">Add your first brand to get started.</p>
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#FF4D8D] text-white rounded-xl text-sm font-bold hover:bg-[#E91E8C] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Brand
          </button>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/60 border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">Brand</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-500">Rate</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-500">Retainer</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-500">Launch Fee</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-500">Goal</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-gray-500">State</th>
                </tr>
              </thead>
              <tbody>
                {brands.map((b) => {
                  const s = b.settings;
                  const model = (s?.compensation_model ?? 'standard') as CompensationModel;
                  const modelBadge = model !== 'standard' ? MODEL_BADGE[model] : null;
                  return (
                    <tr
                      key={b.id}
                      onClick={() => setEditing(b)}
                      className={cn(
                        'border-b border-gray-50 hover:bg-[#FFF0F5]/40 cursor-pointer transition-colors',
                        b.is_archived && 'opacity-60',
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="h-3 w-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: b.color || '#E5E7EB' }}
                          />
                          <div className="min-w-0">
                            <p className="font-bold text-[#1A1B3A]">{b.name}</p>
                            <p className="text-[10px] font-mono text-gray-400">{b.slug}</p>
                          </div>
                          {modelBadge && (
                            <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider', modelBadge.bg, modelBadge.text)}>
                              {modelBadge.label}
                            </span>
                          )}
                          {b.is_umbrella && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-gray-200 bg-gray-50 text-gray-500 text-[10px] font-bold uppercase tracking-wider">
                              Umbrella
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {s?.commission_rate ? `${Number(s.commission_rate).toFixed(2)}%` : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {Number(s?.retainer ?? 0) > 0 ? formatCurrency(Number(s?.retainer)) : <span className="text-gray-300">—</span>}
                        {Number(s?.product_retainer_amount ?? 0) > 0 && (
                          <div className="text-[10px] text-gray-400 mt-0.5">+{formatCurrency(Number(s?.product_retainer_amount))} {s?.product_retainer_name ?? 'product'}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {Number(s?.launch_fee ?? 0) > 0 ? (
                          <>
                            <div className="text-amber-600 font-medium">{formatCurrency(Number(s?.launch_fee))}</div>
                            {s?.launch_fee_name && <div className="text-[10px] text-gray-400 mt-0.5">{s.launch_fee_name}</div>}
                          </>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {Number(s?.monthly_gmv_goal ?? 0) > 0 ? formatCurrency(Number(s?.monthly_gmv_goal)) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {b.is_archived ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-500 border border-gray-200">
                            <Archive className="h-3 w-3" />
                            Archived
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Active
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit drawer — context-free (no month) */}
      {editing && (
        <BrandEditSheet
          open
          brand={editing.slug}
          brandLabel={editing.name}
          marketingGmv={null}
          activeMonth={null}
          initialValues={{
            commission_rate: Number(editing.settings?.commission_rate ?? 0),
            retainer: Number(editing.settings?.retainer ?? 0),
            launch_fee: Number(editing.settings?.launch_fee ?? 0),
            launch_fee_name: editing.settings?.launch_fee_name ?? null,
            launch_fee_ends: editing.settings?.launch_fee_ends ?? null,
            product_retainer_amount: Number(editing.settings?.product_retainer_amount ?? 0),
            product_retainer_name: editing.settings?.product_retainer_name ?? null,
            monthly_gmv_goal: Number(editing.settings?.monthly_gmv_goal ?? 0),
            marketing_commission_rate: Number(editing.settings?.marketing_commission_rate ?? 0.02),
            compensation_model: (editing.settings?.compensation_model ?? 'standard') as CompensationModel,
            bill_to_name: editing.settings?.bill_to_name ?? null,
            bill_to_email: editing.settings?.bill_to_email ?? null,
            bill_to_address: editing.settings?.bill_to_address ?? null,
            payment_instructions: editing.settings?.payment_instructions ?? null,
          }}
          onClose={() => setEditing(null)}
          onSaved={() => fetchBrands()}
        />
      )}

      {/* Add brand modal */}
      <AddBrandModal
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={() => { setAdding(false); fetchBrands(); }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-lg font-extrabold text-[#1A1B3A] mt-0.5 tabular-nums">{value}</p>
    </div>
  );
}

// ── Add brand modal ────────────────────────────────────────────────────

function AddBrandModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState('#FF4D8D');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setSlug(''); setName(''); setColor('#FF4D8D'); setErr(null); }
  }, [open]);

  if (!open) return null;

  // Auto-derive slug from name on first type
  function handleNameChange(v: string) {
    setName(v);
    if (!slug) {
      setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''));
    }
  }

  async function handleCreate() {
    setCreating(true);
    setErr(null);
    try {
      const res = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, name, color }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  }

  const slugValid = /^[a-z0-9_]+$/.test(slug);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button aria-label="Close" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400">New</p>
            <h2 className="text-lg font-extrabold text-[#1A1B3A]">Add Brand</h2>
            <p className="text-xs text-gray-500 mt-0.5">Settings can be filled in after creation.</p>
          </div>
          <button onClick={onClose} disabled={creating} className="h-8 w-8 rounded-lg hover:bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <Field label="Display Name" hint="Shown across the app">
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Cata-Kor"
              disabled={creating}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-[#1A1B3A] focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D] disabled:opacity-50"
            />
          </Field>

          <Field
            label="Slug"
            hint="lowercase_with_underscores · used in URLs and uploads"
            tone={slug && !slugValid ? 'error' : 'default'}
          >
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              placeholder="catakor"
              disabled={creating}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm font-mono text-[#1A1B3A] focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D] disabled:opacity-50"
            />
          </Field>

          <Field label="Brand Color" hint="Used in charts and badges">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                disabled={creating}
                className="h-10 w-14 rounded-lg cursor-pointer border border-gray-200"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                disabled={creating}
                className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm font-mono text-[#1A1B3A] focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D] disabled:opacity-50"
              />
            </div>
          </Field>

          {err && <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">{err}</div>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50/40">
          <button onClick={onClose} disabled={creating} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-40">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !name || !slug || !slugValid}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-[#FF4D8D] rounded-xl hover:bg-[#E91E8C] disabled:opacity-50 transition-colors shadow-sm"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {creating ? 'Creating…' : 'Create Brand'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, tone = 'default', children }: { label: string; hint?: string; tone?: 'default' | 'error'; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-semibold text-gray-700">{label}</span>
        {hint && <span className={cn('text-[11px]', tone === 'error' ? 'text-red-600 font-medium' : 'text-gray-400')}>{hint}</span>}
      </div>
      {children}
    </label>
  );
}
