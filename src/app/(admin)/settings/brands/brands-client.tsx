'use client';

/**
 * Brand-level settings management.
 *
 * Active brands list at top with rates/retainer/launch fee at-a-glance.
 * Archived brands collapse into a "Show archived" toggle. Each row has a
 * kebab menu for editing settings (opens BrandEditSheet) and archiving or
 * restoring. Archive is soft — historical data is preserved; the brand is
 * hidden from active lists across the app.
 *
 * "New Client" opens the three-step NewClientWizard which creates the
 * brands_v2 row, fills in financial terms, and invites brand contacts in
 * one flow.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, AlertCircle, Archive, ArchiveRestore, Settings2, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/format';
import { BrandEditSheet, type CompensationModel } from '@/app/(admin)/earnings/components/brand-edit-sheet';
import { NewClientWizard } from '@/components/brands/new-client-wizard';
import { invalidateBrandList } from '@/hooks/use-brand-list';

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
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const setArchived = useCallback(async (brand: BrandRow, archived: boolean) => {
    if (archived) {
      if (!confirm(`Archive ${brand.name}? Historical data is preserved; the brand will be hidden from active lists across the app.`)) return;
    }
    setBusyId(brand.id);
    setMenuOpenId(null);
    try {
      const res = await fetch(`/api/brands/${brand.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_archived: archived }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setBrands((prev) => prev.map((b) => (b.id === brand.id ? { ...b, is_archived: archived } : b)));
      invalidateBrandList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Archive failed');
    } finally {
      setBusyId(null);
    }
  }, []);

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

  const { active, archived, stats } = useMemo(() => {
    const a = brands.filter((b) => !b.is_archived);
    const ar = brands.filter((b) => b.is_archived);
    const monthlyCommit = a.reduce((s, b) => s + Number(b.settings?.retainer ?? 0) + Number(b.settings?.product_retainer_amount ?? 0), 0);
    return { active: a, archived: ar, stats: { active: a.length, archived: ar.length, monthlyCommit } };
  }, [brands]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--foreground)]">Brand Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage compensation models, rates, retainers, fees, and invoice defaults across all brands.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchBrands}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-border hover:bg-muted text-muted-foreground disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--primary)] text-white text-sm font-bold hover:bg-[#E91E8C] transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            New Client
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
        <div className="rounded-2xl bg-card border border-border shadow-sm p-12 text-center">
          <div className="inline-block h-8 w-8 rounded-full border-2 border-border border-t-[var(--primary)] animate-spin" />
        </div>
      ) : brands.length === 0 ? (
        <div className="rounded-2xl bg-card border border-border shadow-sm p-12 text-center">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
            <Settings2 className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-bold text-[var(--foreground)]">No clients yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">Onboard your first client to get started.</p>
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-xl text-sm font-bold hover:bg-[#E91E8C] transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Client
          </button>
        </div>
      ) : (
        <>
          <BrandTable
            brands={active}
            heading="Active"
            busyId={busyId}
            menuOpenId={menuOpenId}
            onRowClick={(b) => setEditing(b)}
            onMenuToggle={(id) => setMenuOpenId((prev) => (prev === id ? null : id))}
            onArchive={(b) => setArchived(b, true)}
            onUnarchive={(b) => setArchived(b, false)}
          />

          {archived.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowArchived((v) => !v)}
                className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
              >
                <Archive className="h-3 w-3" />
                {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
              </button>
              {showArchived && (
                <div className="mt-2">
                  <BrandTable
                    brands={archived}
                    heading="Archived"
                    archived
                    busyId={busyId}
                    menuOpenId={menuOpenId}
                    onRowClick={(b) => setEditing(b)}
                    onMenuToggle={(id) => setMenuOpenId((prev) => (prev === id ? null : id))}
                    onArchive={(b) => setArchived(b, true)}
                    onUnarchive={(b) => setArchived(b, false)}
                  />
                </div>
              )}
            </div>
          )}
        </>
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

      {/* New Client wizard */}
      <NewClientWizard
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={() => { setAdding(false); fetchBrands(); }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg font-extrabold text-[var(--foreground)] mt-0.5 tabular-nums">{value}</p>
    </div>
  );
}

// ── Brand table ─────────────────────────────────────────────────────

function BrandTable({
  brands, heading, archived = false, busyId, menuOpenId,
  onRowClick, onMenuToggle, onArchive, onUnarchive,
}: {
  brands: BrandRow[];
  heading: string;
  archived?: boolean;
  busyId: string | null;
  menuOpenId: string | null;
  onRowClick: (b: BrandRow) => void;
  onMenuToggle: (id: string) => void;
  onArchive: (b: BrandRow) => void;
  onUnarchive: (b: BrandRow) => void;
}) {
  if (brands.length === 0) return null;
  return (
    <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 bg-muted/60 border-b border-border flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{heading}</p>
        <p className="text-[10px] font-bold text-muted-foreground tabular-nums">{brands.length}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-card border-b border-border">
              <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Brand</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Rate</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Retainer</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Launch Fee</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Goal</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-10"></th>
            </tr>
          </thead>
          <tbody>
            {brands.map((b) => {
              const s = b.settings;
              const model = (s?.compensation_model ?? 'standard') as CompensationModel;
              const modelBadge = model !== 'standard' ? MODEL_BADGE[model] : null;
              const menuOpen = menuOpenId === b.id;
              const isBusy = busyId === b.id;
              return (
                <tr
                  key={b.id}
                  onClick={() => !isBusy && onRowClick(b)}
                  className={cn(
                    'border-b border-border hover:bg-[#FFF0F5]/40 cursor-pointer transition-colors',
                    archived && 'opacity-60',
                    isBusy && 'opacity-40 pointer-events-none',
                  )}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-3 w-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: b.color || 'var(--border)' }}
                      />
                      <div className="min-w-0">
                        <p className="font-bold text-[var(--foreground)]">{b.name}</p>
                        <p className="text-[10px] font-mono text-muted-foreground">{b.slug}</p>
                      </div>
                      {modelBadge && (
                        <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider', modelBadge.bg, modelBadge.text)}>
                          {modelBadge.label}
                        </span>
                      )}
                      {b.is_umbrella && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-border bg-muted text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                          Umbrella
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {s?.commission_rate ? `${Number(s.commission_rate).toFixed(2)}%` : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Number(s?.retainer ?? 0) > 0 ? formatCurrency(Number(s?.retainer)) : <span className="text-muted-foreground">—</span>}
                    {Number(s?.product_retainer_amount ?? 0) > 0 && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">+{formatCurrency(Number(s?.product_retainer_amount))} {s?.product_retainer_name ?? 'product'}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Number(s?.launch_fee ?? 0) > 0 ? (
                      <>
                        <div className="text-amber-600 font-medium">{formatCurrency(Number(s?.launch_fee))}</div>
                        {s?.launch_fee_name && <div className="text-[10px] text-muted-foreground mt-0.5">{s.launch_fee_name}</div>}
                      </>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Number(s?.monthly_gmv_goal ?? 0) > 0 ? formatCurrency(Number(s?.monthly_gmv_goal)) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-2 py-3 text-right relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); onMenuToggle(b.id); }}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Actions"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {menuOpen && (
                      <RowMenu
                        archived={archived}
                        onArchive={(e) => { e.stopPropagation(); onArchive(b); }}
                        onUnarchive={(e) => { e.stopPropagation(); onUnarchive(b); }}
                        onEdit={(e) => { e.stopPropagation(); onMenuToggle(b.id); onRowClick(b); }}
                        onDismiss={() => onMenuToggle(b.id)}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowMenu({
  archived, onArchive, onUnarchive, onEdit, onDismiss,
}: {
  archived: boolean;
  onArchive: (e: React.MouseEvent) => void;
  onUnarchive: (e: React.MouseEvent) => void;
  onEdit: (e: React.MouseEvent) => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const handler = () => onDismiss();
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [onDismiss]);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute right-2 top-9 z-20 w-48 rounded-xl border border-border bg-card shadow-lg overflow-hidden"
    >
      <button
        onClick={onEdit}
        className="w-full px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted flex items-center gap-2"
      >
        <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
        Edit settings
      </button>
      {archived ? (
        <button
          onClick={onUnarchive}
          className="w-full px-3 py-2 text-left text-xs font-medium text-emerald-700 hover:bg-emerald-50 flex items-center gap-2 border-t border-border"
        >
          <ArchiveRestore className="h-3.5 w-3.5" />
          Restore client
        </button>
      ) : (
        <button
          onClick={onArchive}
          className="w-full px-3 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-2 border-t border-border"
        >
          <Archive className="h-3.5 w-3.5" />
          Archive client
        </button>
      )}
    </div>
  );
}

