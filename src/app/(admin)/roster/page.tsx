'use client';
import { InterfaceIcon } from '@/components/ui/interface-icon';
import RosterLoading from './loading';
import { BrandIdentity } from '@/components/creators/brand-identity';
import { CreatorPortrait } from '@/components/creators/creator-portrait';
import { LatestRequest } from '@/lib/latest-request';

import { useState, useEffect, useCallback, useRef, useMemo, useId, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { RosterSegmentControls } from '@/components/segments/roster-segment-controls';
import rosterLayout from '@/components/roster/roster-layout.module.css';
import { RosterStats } from '@/components/roster/RosterStats';
import { NewVideoGmvCard } from '@/components/dashboard/new-video-gmv';
import type { SegmentFilterCriteria } from '@/lib/data/segments';
import {
  Users, X,
  ChevronDown, ExternalLink, Loader2,
  Pencil, Check, Plus, Trash2, Upload, FileDown, AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { DATE_PRESETS, resolveDateRange, type DatePreset } from '@/lib/data/date-utils';
import { BulkAddModal, type BulkRow } from '@/components/roster/BulkAddModal';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { ChoiceMenu } from '@/components/ui/choice-menu';
import { SearchInput } from '@/components/ui/search-input';
import { ProductTagPicker, ProductFilterSelect } from '@/components/roster/product-tag-picker';
import { downloadCsv } from '@/lib/utils/csv';
import { downloadXlsx } from '@/lib/utils/xlsx';
import { useBrandList } from '@/hooks/use-brand-list';
import { RosterFormDialog, RosterFormClose } from '@/components/roster/roster-form-dialog';
import { changedRosterTerms } from '@/components/roster/editor-values';

import { DropdownMenu, Popover } from 'radix-ui';
import { RefreshCw, SlidersHorizontal } from 'lucide-react';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { CreatorOverviewDrawer } from '@/components/roster/creator-drawer';
import { CreatorRemovalButton } from '@/components/roster/creator-removal-button';
import { StudioRosterTable } from '@/components/roster/studio-roster-table';
import { RosterTagsProvider, RosterTagFilter, RosterTagEditor } from '@/components/roster/studio-tag-controls';
import type { Creator, BrandChild } from '@/components/roster/types';
import type { RosterStudioData } from '@/lib/roster/studio-types';
import { useNavigationPending } from '@/components/layout/navigation-pending';
const PAGE_SIZE = 50;

// Compact chip labels for the period presets (the card header is narrow).
const PERIOD_SHORT: Record<DatePreset, string> = {
  yesterday: 'Yest',
  last7: '7d',
  last14: '14d',
  last30: '30d',
  thisMonth: 'This mo',
  lastMonth: 'Last mo',
  custom: 'Custom',
};
// yyyy-MM-dd → M/D/YY for the custom-range chip + labels.
const fmtShortDate = (s: string) => {
  const [y, m, d] = s.split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}/${y.slice(2)}`;
};

/** Primary handle — first in the canonical list, falls back to legacy account_1. */
function primaryHandle(c: Creator): string | null {
  return c.handles?.[0] ?? c.account_1 ?? null;
}

function RosterMetric({ label, value, trend, detail, featured = false }: {
  label: string; value: string; trend?: number; detail?: string; featured?: boolean;
}) {
  return <div className={`${rosterLayout.metric} ${featured ? rosterLayout.featured : ''}`}>
    <dt>{label}</dt><dd>{value}</dd>
    {(trend !== undefined || detail) && <p>
      {trend !== undefined && <span className={trend >= 0 ? rosterLayout.positive : rosterLayout.negative}><InterfaceIcon name={trend >= 0 ? 'increase' : 'decrease'} className="size-3"/><span className="sr-only">{trend >= 0 ? 'Up ' : 'Down '}</span>{Math.abs(trend) < 1 ? Math.abs(trend).toFixed(1) : Math.round(Math.abs(trend))}%</span>}
      {detail && <span>{detail}</span>}
    </p>}
  </div>;
}

function StatusBadge({ status }: { status: string | null }) {
  // Null/empty status → neutral dash (not green "Active")
  if (!status) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const STYLE: Record<string, string> = {
    Active:   'bg-green-500/10 text-green-600',
    Inactive: 'bg-muted text-muted-foreground',
    Churned:  'bg-red-500/10 text-red-600',
    'On Hold': 'bg-yellow-500/10 text-yellow-500',
    Paused:   'bg-yellow-500/10 text-yellow-500',
  };
  const cls = STYLE[status] ?? 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-md ${cls}`}>
      {status}
    </span>
  );
}

function CreatorPanel({
  creator,
  onClose,
  onSaved,
  onRemoved,
}: {
  creator: Creator;
  onClose: () => void;
  onSaved: (updated: Creator) => void;
  onRemoved: (id: string) => void;
}) {
  const formId = useId();
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

  const { brands: brandOptions } = useBrandList();
  const brandMeta = useBrandMeta();
  const [editing, setEditing] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saveError, setSaveError] = useState('');
  const [removing, setRemoving] = useState(false);
  const writePending = useRef(false);

  // Initial handle list: prefer canonical `handles`, fall back to legacy cols.
  const initialHandles = (() => {
    if (creator.handles && creator.handles.length > 0) return [...creator.handles];
    const legacy = [creator.account_1, creator.account_2, creator.account_3, creator.account_4, creator.account_5]
      .filter((v): v is string => !!v && v.trim() !== '');
    return legacy.length > 0 ? legacy : [''];
  })();

  // Edit form state. Handles live in their own array so they can grow unbounded.
  const [form, setForm] = useState({
    real_name:               creator.real_name || '',
    brand:                   creator.brand || '',
    status:                  creator.status || '',
    retainer:                String(creator.retainer ?? ''),
    monthly_post_requirement: String(creator.monthly_post_requirement ?? ''),
    discord_name:            creator.discord_name || '',
    notes:                   creator.notes || '',
  });
  const [handles, setHandles] = useState<string[]>(initialHandles);
  const [productTags, setProductTags] = useState<string[]>((creator.product_tags ?? []).map((t) => t.key));

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const setHandleAt = (i: number, v: string) =>
    setHandles((h) => h.map((x, idx) => (idx === i ? v.trim().replace(/^@/, '') : x)));
  const addHandle = () => setHandles((h) => [...h, '']);
  const removeHandle = (i: number) =>
    setHandles((h) => (h.length === 1 ? [''] : h.filter((_, idx) => idx !== i)));

  const handleSave = async () => {
    if (writePending.current) return;
    writePending.current = true;
    setSaving(true);
    setSaveError('');
    try {
      const cleanHandles = Array.from(new Set(
        handles.map((h) => h.trim().replace(/^@/, '')).filter(Boolean),
      ));
      const payload: Record<string, unknown> = { ...form, status: form.status || null, handles: cleanHandles, product_assignments: productTags };
      delete payload.retainer;
      delete payload.monthly_post_requirement;
      Object.assign(payload, changedRosterTerms(form, creator));
      const res = await fetch(`/api/roster/${creator.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      onSaved(json.data as Creator);
      setEditing(false);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      writePending.current = false;
      setSaving(false);
    }
  };

  const displayName = creator.real_name || primaryHandle(creator) || 'Creator';

  const dirty = editing && (JSON.stringify(form) !== JSON.stringify({
    real_name: creator.real_name || '', brand: creator.brand || '', status: creator.status || '',
    retainer: String(creator.retainer ?? ''), monthly_post_requirement: String(creator.monthly_post_requirement ?? ''),
    discord_name: creator.discord_name || '', notes: creator.notes || '',
  }) || JSON.stringify(handles) !== JSON.stringify(initialHandles)
    || JSON.stringify(productTags) !== JSON.stringify((creator.product_tags ?? []).map(tag => tag.key)));

  return <RosterFormDialog title="Edit creator details" description={`${displayName}. Changes are only saved when you choose Save.`} busy={saving || removing} dirty={dirty} onClose={onClose} sheet
    returnFocus={() => document.querySelector<HTMLButtonElement>(`[data-creator-overview="${CSS.escape(creator.id)}"]`)?.focus({ preventScroll: true })}>
      <div
        className={rosterLayout.panel}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex flex-wrap gap-3 items-center justify-between z-10">
          <div>
            <div className={rosterLayout.panelHeader}><CreatorAvatar creator={creator} /><h2>{displayName}</h2></div>
            {creator.brand && !editing && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {brandOptions.find(b => b.slug === creator.brand)?.name || brandMeta.label(creator.brand)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {creator.brand && <CreatorRemovalButton managedId={creator.id} name={displayName} brand={creator.brand} brandLabel={brandMeta.label(creator.brand) ?? creator.brand} disabled={saving} dirty={dirty} onRemoved={() => onRemoved(creator.id)} onBusyChange={busy => { writePending.current = busy; setRemoving(busy); }} />}
            {!editing ? (
              <>
                <button
                  onClick={() => setEditing(true)}
                  disabled={removing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-muted-foreground hover:bg-muted transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <RosterFormClose  aria-label="Close creator editor" className="p-1.5 rounded-lg hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40">
                  <X className="h-5 w-5 text-muted-foreground" />
                </RosterFormClose>
              </>
            ) : (
              <>
                <RosterFormClose

                  disabled={saving || removing}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
                >
                  Cancel
                </RosterFormClose>
                <button
                  onClick={handleSave}
                  disabled={saving || removing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--primary)] text-primary-foreground hover:brightness-[1.07] disabled:opacity-60 transition-colors"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Body */}
        <fieldset disabled={saving || removing} className="m-0 min-w-0 border-0 p-6 space-y-5 flex-1">
          {saveError && (
            <p role="alert" className="text-xs text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{saveError}</p>
          )}

          {editing ? (
            /* ── EDIT MODE ── */
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${formId}-real_name`} className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Real Name</label>
                  <input
                    type="text"
                    id={`${formId}-real_name`} value={form.real_name}
                    onChange={e => set('real_name', e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full px-3 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
                  />
                </div>
                <div>
                  <label htmlFor={`${formId}-brand`} className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Brand</label>
                  <ChoiceMenu id={`${formId}-brand`} label="Creator brand" value={form.brand} onChange={value => set('brand', value)} triggerClassName="w-full" options={[{ value: '', label: 'No brand' }, ...brandOptions.map(b => ({ value: b.slug, label: b.name }))]} />
                </div>
              </div>

              {form.brand && (
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Products</label>
                  <ProductTagPicker brand={form.brand} value={productTags} onChange={setProductTags} />
                </div>
              )}

              <div>
                <label htmlFor={`${formId}-handle-0`} className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">TikTok Accounts</label>
                <div className="space-y-2">
                  {handles.map((h, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-4 shrink-0">{idx + 1}</span>
                      <input
                        type="text"
                        id={`${formId}-handle-${idx}`} aria-label={`TikTok handle ${idx + 1}`} value={h}
                        onChange={(e) => setHandleAt(idx, e.target.value)}
                        placeholder={idx === 0 ? 'primary handle' : 'additional handle'}
                        className="flex-1 px-3 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
                      />
                      {(handles.length > 1 || h !== '') && (
                        <button
                          type="button"
                          onClick={() => removeHandle(idx)}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                          title="Remove handle"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {/* Unlimited — handles[] persists to tiktok_accounts on save. */}
                  <button
                    type="button"
                    onClick={addHandle}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline mt-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add another handle
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${formId}-retainer`} className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Monthly Retainer ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    id={`${formId}-retainer`} value={form.retainer}
                    onChange={e => set('retainer', e.target.value)}
                    placeholder="Not recorded"
                    className="w-full px-3 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
                  />
                </div>
                <div>
                  <label htmlFor={`${formId}-monthly_post_requirement`} className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Posts / Month</label>
                  <input
                    type="number"
                    min="0"
                    max="200"
                    id={`${formId}-monthly_post_requirement`} value={form.monthly_post_requirement}
                    onChange={e => set('monthly_post_requirement', e.target.value)}
                    placeholder="Not recorded"
                    className="w-full px-3 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${formId}-status`} className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Status</label>
                  <ChoiceMenu id={`${formId}-status`} label="Creator status" value={form.status} onChange={value => set('status', value)} triggerClassName="w-full" options={[{ value: '', label: 'Not set' }, ...['Active', 'On Hold', 'Churned', 'Inactive'].map(status => ({ value: status, label: status }))]} />
                </div>
                <div>
                  <label htmlFor={`${formId}-discord_name`} className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Discord</label>
                  <input
                    type="text"
                    id={`${formId}-discord_name`} value={form.discord_name}
                    onChange={e => set('discord_name', e.target.value)}
                    placeholder="username"
                    className="w-full px-3 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor={`${formId}-notes`} className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Notes</label>
                <textarea
                  rows={3}
                  id={`${formId}-notes`} value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                  placeholder="Any notes about this creator…"
                  className="w-full px-3 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] resize-none"
                />
              </div>
            </div>
          ) : (
            /* ── VIEW MODE ── */
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Retainer</p>
                  <p className="text-base font-bold text-[var(--foreground)]">
                    {creator.retainer && creator.retainer > 0 ? fmt(creator.retainer) : '—'}
                  </p>
                </div>
                <div className="rounded-xl bg-muted p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Posts/Mo</p>
                  <p className="text-base font-bold text-[var(--foreground)]">{creator.monthly_post_requirement ?? 'Not recorded'}</p>
                </div>
              </div>

              {/* Revenue by store — only shown when the creator's contract brand is
                  an umbrella (e.g. LeeFar) and the breakdown has multiple stores
                  with GMV. Hidden for single-brand creators where there's nothing
                  to break down. */}
              {(() => {
                const breakdown = creator.gmv_by_store ?? {};
                const entries = Object.entries(breakdown)
                  .filter(([, gmv]) => gmv > 0)
                  .sort((a, b) => b[1] - a[1]);
                if (entries.length < 2) return null;
                const total = entries.reduce((s, [, g]) => s + g, 0);
                return (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Revenue by store</p>
                    <div className="space-y-1.5">
                      {entries.map(([slug, gmv]) => {
                        const pct = total > 0 ? Math.round((gmv / total) * 100) : 0;
                        return (
                          <div key={slug} className="flex items-center gap-3 text-sm">
                            <span className="text-foreground flex-1 truncate">
                              <BrandIdentity brand={slug} label={brandMeta.label(slug)} />
                            </span>
                            <span className="text-[var(--foreground)] font-semibold tabular-nums">{fmt(gmv)}</span>
                            <span className="text-xs text-muted-foreground w-9 text-right tabular-nums">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Status</p>
                <StatusBadge status={creator.status} />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">TikTok Accounts</p>
                <div className="space-y-1">
                  {creator.handles && creator.handles.length > 0
                    ? creator.handles.map((h) => (
                      <a
                        key={h}
                        href={`https://tiktok.com/@${h}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-sm text-[var(--primary)] hover:underline"
                      >
                        @{h}
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </a>
                    ))
                    : <span className="text-sm text-muted-foreground">—</span>}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Discord</p>
                <div className="flex items-center gap-2">
                  <CreatorPortrait creatorId={creator.creator_id} name={creator.discord_name || creator.real_name || 'Creator'} source={creator.discord_avatar} className="h-7 w-7 rounded-full" />
                  <span className="text-sm text-foreground">{creator.discord_name || '—'}</span>
                </div>
              </div>

              {creator.notes && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Notes</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{creator.notes}</p>
                </div>
              )}

              {creator.created_at && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Roster record added</p>
                  <span className="text-sm text-muted-foreground">
                    {new Date(creator.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              )}

              {primaryHandle(creator) && (
                <Link
                  href={`/creators/${encodeURIComponent(primaryHandle(creator)!)}${creator.brand ? `?brand=${encodeURIComponent(creator.brand)}` : ''}`}
                  className="flex items-center justify-center gap-2 w-full mt-2 px-4 py-3 rounded-xl bg-[var(--primary)] text-primary-foreground text-sm font-semibold hover:brightness-[1.07] transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  View Full Profile
                </Link>
              )}
            </>
          )}
        </fieldset>
      </div>
  </RosterFormDialog>;
}

interface AddCreatorModalProps {
  prefill?: { account_1?: string; brand?: string };
  onClose: () => void;
  onSuccess: () => void;
}

function AddCreatorModal({ prefill, onClose, onSuccess }: AddCreatorModalProps) {
  const formId = useId();
  const { brands: brandOptions } = useBrandList();
  const [form, setForm] = useState({
    real_name: '', brand: prefill?.brand || '',
    retainer: '', monthly_post_requirement: '30', discord_name: '', notes: '',
    email: '', phone: '', discord_id: '',
  });
  const [handles, setHandles] = useState<string[]>([prefill?.account_1 || '']);
  const [productTags, setProductTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const writePending = useRef(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const setHandleAt = (i: number, v: string) =>
    setHandles((h) => h.map((x, idx) => (idx === i ? v.trim().replace(/^@/, '') : x)));
  const addHandle = () => setHandles((h) => [...h, '']);
  const removeHandle = (i: number) =>
    setHandles((h) => (h.length === 1 ? [''] : h.filter((_, idx) => idx !== i)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (writePending.current) return;
    if (!form.brand || form.brand === 'all') {
      setError('Please select a brand.');
      return;
    }
    const cleanHandles = Array.from(new Set(
      handles.map((h) => h.trim().replace(/^@/, '')).filter(Boolean),
    ));
    if (!form.real_name && cleanHandles.length === 0) {
      setError('Name or at least one TikTok handle is required.');
      return;
    }
    writePending.current = true;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          handles: cleanHandles,
          product_assignments: productTags,
          retainer: form.retainer ? parseFloat(form.retainer) : 0,
          // 0 is a real target (affiliate-only); only a blank box defaults to 30.
          monthly_post_requirement: Number.isFinite(parseInt(form.monthly_post_requirement))
            ? parseInt(form.monthly_post_requirement)
            : 30,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to add creator');
      // ⚠️ Already on this brand's roster: the route keeps their existing row
      // and IGNORES the retainer and posts sent here (terms change through
      // Edit, which is change-logged). This used to close as if it had saved,
      // so new terms entered here silently never landed.
      if (json.deduped === 'active') {
        setError(
          `${form.real_name || cleanHandles[0] || 'This creator'} is already on this brand's roster, so nothing was changed. Open them on the roster and use Edit to change their retainer or posts.`,
        );
        return;
      }
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      writePending.current = false;
      setSaving(false);
    }
  };

  return (
    <RosterFormDialog title="Add creator" description="Add a creator to one assigned brand. Nothing is saved until you choose Add creator." busy={saving} dirty={JSON.stringify(form) !== JSON.stringify({ real_name: '', brand: prefill?.brand || '', retainer: '', monthly_post_requirement: '30', discord_name: '', notes: '', email: '', phone: '', discord_id: '' }) || JSON.stringify(handles) !== JSON.stringify([prefill?.account_1 || '']) || productTags.length > 0} onClose={onClose}>
      <div
        className="w-full bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="text-base font-bold text-[var(--foreground)]">Add Creator</h2>
          <RosterFormClose  disabled={saving} aria-label="Close add creator" className="p-1.5 rounded-lg hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40">
            <X className="h-5 w-5 text-muted-foreground" />
          </RosterFormClose>
        </div>

        <form onSubmit={handleSubmit} className="p-6"><fieldset disabled={saving} className="m-0 min-w-0 border-0 p-0 space-y-4">
          <div>
            <label htmlFor={`${formId}-real_name`} className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Real Name</label>
            <input
              type="text"
              placeholder="e.g. Jane Smith"
              id={`${formId}-real_name`} value={form.real_name}
              onChange={(e) => set('real_name', e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
            />
          </div>

          {/* Unlimited TikTok handles — persists to tiktok_accounts on save. */}
          <div>
            <label htmlFor={`${formId}-handle-0`} className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">TikTok Handles</label>
            <div className="space-y-2">
              {handles.map((h, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-4 shrink-0">{idx + 1}</span>
                  <input
                    type="text"
                    placeholder={idx === 0 ? '@primary_handle' : '@additional_handle'}
                    id={`${formId}-handle-${idx}`} aria-label={`TikTok handle ${idx + 1}`} value={h}
                    onChange={(e) => setHandleAt(idx, e.target.value)}
                    className="flex-1 px-3 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
                  />
                  {(handles.length > 1 || h !== '') && (
                    <button
                      type="button"
                      onClick={() => removeHandle(idx)}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                      title="Remove handle"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addHandle}
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline mt-1"
              >
                <Plus className="h-3.5 w-3.5" /> Add another handle
              </button>
            </div>
          </div>

          <div>
            <label htmlFor={`${formId}-brand`} className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Brand</label>
            <ChoiceMenu id={`${formId}-brand`} label="Brand" value={form.brand} onChange={value => set('brand', value)} triggerClassName="w-full" options={[{ value: '', label: 'Select brand…' }, ...brandOptions.map(b => ({ value: b.slug, label: b.name }))]} />
          </div>

          {form.brand && (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Products <span className="font-normal text-muted-foreground normal-case">(optional)</span>
              </label>
              <ProductTagPicker brand={form.brand} value={productTags} onChange={setProductTags} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${formId}-retainer`} className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Monthly Retainer ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                id={`${formId}-retainer`} value={form.retainer}
                onChange={(e) => set('retainer', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
              />
            </div>
            <div>
              <label htmlFor={`${formId}-monthly_post_requirement`} className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Posts / Month</label>
              <input
                type="number"
                min="0"
                max="200"
                placeholder="30"
                id={`${formId}-monthly_post_requirement`} value={form.monthly_post_requirement}
                onChange={(e) => set('monthly_post_requirement', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
              />
            </div>
          </div>

          <div>
            <label htmlFor={`${formId}-discord_name`} className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Discord Username</label>
            <input
              type="text"
              placeholder="e.g. janedoe#1234"
              id={`${formId}-discord_name`} value={form.discord_name}
              onChange={(e) => set('discord_name', e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${formId}-email`} className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Email</label>
              <input
                type="email"
                placeholder="creator@email.com"
                id={`${formId}-email`} value={form.email}
                onChange={(e) => set('email', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
              />
            </div>
            <div>
              <label htmlFor={`${formId}-phone`} className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Phone</label>
              <input
                type="tel"
                placeholder="+1 555 123 4567"
                id={`${formId}-phone`} value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
              />
            </div>
          </div>

          <div>
            <label htmlFor={`${formId}-discord_id`} className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Discord ID <span className="font-normal text-muted-foreground normal-case">(optional)</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="e.g. 1275246569070792704"
              id={`${formId}-discord_id`} value={form.discord_id}
              onChange={(e) => set('discord_id', e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
            />
          </div>

          <p className="text-[11px] text-muted-foreground -mt-1">
            Email, phone, and Discord ID help recognize a returning creator and prevent duplicate entries.
          </p>

          <div>
            <label htmlFor={`${formId}-notes`} className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Notes</label>
            <textarea
              rows={2}
              placeholder="Any notes about this creator..."
              id={`${formId}-notes`} value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] resize-none"
            />
          </div>

          {error && <p role="alert" className="text-xs text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <RosterFormClose type="button"  className="px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              Cancel
            </RosterFormClose>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--primary)] text-primary-foreground text-sm font-semibold hover:brightness-[1.07] disabled:opacity-60 transition-colors"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Adding...' : 'Add Creator'}
            </button>
          </div>
        </fieldset></form>
      </div>
    </RosterFormDialog>
  );
}

// ─── (Removed) AllCreatorsTab ─────────────────────────────────────────────
// Merged into the Managed Roster tab. Unmanaged candidates now surface inline
// via the ?include=all toggle on /api/roster (see get_unmanaged_top_perf RPC).
// The action cell renders "+ Add to roster" for unmanaged rows.

// Prior-period % change badge (green up / red down). Hidden when unknown.
function CreatorAvatar({ creator }: { creator: Creator }) {
  return <CreatorPortrait creatorId={creator.creator_id} source={creator.discord_avatar} name={creator.real_name || creator.handles?.[0] || creator.account_1 || '?'} className={rosterLayout.avatar} />;
}
function RosterContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { startNav } = useNavigationPending();
  const brand = searchParams.get('brand') || 'all';
  const { brands: brandOptions, loading: brandsLoading } = useBrandList();
  const brandMeta = useBrandMeta();

  const committedQuery = searchParams.toString();
  const latestQuery = useRef(committedQuery);
  const pendingQueries = useRef<string[]>([]);
  useEffect(() => {
    // Retain newer requested changes when an earlier navigation commits. A
    // browser-history URL outside this queue becomes the new editing base.
    const committedIndex = pendingQueries.current.lastIndexOf(committedQuery);
    pendingQueries.current = committedIndex < 0 ? [] : pendingQueries.current.slice(committedIndex + 1);
    latestQuery.current = pendingQueries.current.at(-1) ?? committedQuery;
  }, [committedQuery]);
  const navigateScope = (update: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(latestQuery.current);
    update(params);
    const qs = params.toString();
    if (qs === latestQuery.current) return;
    latestQuery.current = qs;
    pendingQueries.current.push(qs);
    startNav(() => router.push(qs ? `/roster?${qs}` : '/roster', { scroll: false }));
  };
  const setBrand = (next: string) => {
    navigateScope(params => {
      if (next === 'all') params.delete('brand');
      else params.set('brand', next);
    });
  };

  // All / Managed / Unmanaged view. Managed is the default; the page doubles
  // as a full reference when switched to All or Unmanaged.
  type View = 'managed' | 'all' | 'unmanaged';
  const [view, setView] = useState<View>('managed');
  const segmentBrandReset = useRef<string | null>(null);
  const [creatorView,setCreatorView]=useState<'creators'|'top'|'elite'>('creators');
  const [productFilter, setProductFilter] = useState('');
  const [groupFilter,setGroupFilter]=useState<{brand:string;tags:string[];mode:'any'|'all'}>({brand:'',tags:[],mode:'any'});
  // Health triage filter (drill-in, NOT a default): 'all' shows the full roster;
  // a health value narrows to that bucket. Counts come back on every response
  // (computed over the full managed set, brand-scoped), so the chips always show
  // totals even while a filter is active. See deriveHealth in /api/roster.
  const [health, setHealth] = useState<string>('all');
  const [healthCounts, setHealthCounts] = useState({ healthy: 0, behind: 0, silent: 0, low_roi: 0, affiliate: 0 });

  const [roster, setRoster] = useState<Creator[]>([]);
  const [segFilters, setSegFilters] = useState<{ name: string; min_gmv: number | null; max_gmv: number | null; min_posts: number | null } | null>(null);
  const [total, setTotal] = useState(0);
  const [totalGmvPeriod, setTotalGmvPeriod] = useState<number | null>(null);
  const [summary, setSummary] = useState<{ affiliate_gmv: number | null; total_retainer: number | null; retainer_complete: boolean; retainer_missing_count: number | null; videos_published: number | null; gmv_complete: boolean; videos_complete: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  // A failed roster load must NOT read as "0 creators / $0". Track it and render
  // an error surface (or keep the last-good rows), never a confident fake-empty.
  const [loadError, setLoadError] = useState(false);
  // Distinguishes a COLD failure (never loaded → KPIs show "—", not $0) from a
  // warm refetch failure (keep last-good numbers + a stale banner).
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  // Gate the load bar behind a short delay so it doesn't flash on the now-fast
  // (~0.3s) loads — it only appears when a fetch genuinely drags.
  const showLoadBar = useDelayedFlag(loading);

  // Period selector drives the GMV column, ROI, Posts, and the top Total GMV.
  // The Total Retainers figure is the fixed monthly commitment (not period-driven).
  const urlRange = searchParams.get('range');
  const urlStart = searchParams.get('start');
  const urlEnd = searchParams.get('end');
  const [preset, setPreset] = useState<DatePreset>(() => resolveDateRange(urlRange, urlStart, urlEnd).preset);
  const [customStart, setCustomStart] = useState<string | null>(preset === 'custom' ? urlStart : null);
  const [customEnd, setCustomEnd] = useState<string | null>(preset === 'custom' ? urlEnd : null);
  // Browser history can change the URL without remounting this client page.
  useEffect(() => {
    if (pendingQueries.current.length) return;
    const next = resolveDateRange(urlRange, urlStart, urlEnd).preset;
    setPreset(next);
    setCustomStart(next === 'custom' ? urlStart : null);
    setCustomEnd(next === 'custom' ? urlEnd : null);
  }, [committedQuery, urlRange, urlStart, urlEnd]);
  const changePeriod = (next: DatePreset, start: string | null = null, end: string | null = null, nextBrand?: string) => {
    const resolved = resolveDateRange(next, start, end).preset;
    setPreset(resolved);
    setCustomStart(resolved === 'custom' ? start : null);
    setCustomEnd(resolved === 'custom' ? end : null);
    navigateScope(params => {
      if (nextBrand === 'all') params.delete('brand');
      else if (nextBrand !== undefined) params.set('brand', nextBrand);
      params.set('range', resolved);
      if (resolved === 'custom' && start && end) {
        params.set('start', start);
        params.set('end', end);
      } else {
        params.delete('start');
        params.delete('end');
      }
    });
  };
  const isCustomPeriod = preset === 'custom' && !!customStart && !!customEnd;
  // The API resolves the actual [start, end] window from these (shared engine);
  // the client just needs the preset + raw custom dates for the request + labels.
  const periodLabel = isCustomPeriod
    ? `${fmtShortDate(customStart!)} – ${fmtShortDate(customEnd!)}`
    : (DATE_PRESETS.find(p => p.value === preset)?.label ?? 'Last 7 Days');
  const periodShort = isCustomPeriod ? 'Custom' : PERIOD_SHORT[preset];

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null);
  const [editingCreator, setEditingCreator] = useState<Creator | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [managedSelection, setManagedSelection] = useState<Set<string>>(new Set());
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exportError, setExportError] = useState('');
  const [resolvedPeriod, setResolvedPeriod] = useState<{start:string;end:string} | null>(null);
  const [loadedCoreScope, setLoadedCoreScope] = useState('');
  const coreScope = JSON.stringify([brand,preset,customStart,customEnd]);
  const [studioRows, setStudioRows] = useState<Record<string,RosterStudioData>>({});
  const [studioLoading, setStudioLoading] = useState(false);
  const [studioError, setStudioError] = useState(false);
  const studioCache = useRef(new Map<string,{at:number;rows:Record<string,RosterStudioData>}>());
  const workspaceGeneration = useRef(0);
  // Expanded creator groups (All-Brands collapse). Keyed by the parent row id.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  // Open the detail drawer for a single brand-child (its own managed contract).
  const openChild = (parent: Creator, child: BrandChild) => setSelectedCreator({
    ...parent,
    id: child.row_id,
    brand: child.brand,
    retainer: child.retainer,
    monthly_post_requirement: child.studio?.agreement.requiredPosts ?? null,
    gmv_delta: null,
    posts_delta: null,
    creator_tags: [],
    joined: null,
    gmv_period: child.gmv_period,
    posts_period: child.posts_period,
    roi_period: child.roi_period,
    last_post_date: child.last_post_date,
    health: child.health,
    grouped: false,
    brands: undefined,
    studio: child.studio,
  });
  const [addModalPrefill, setAddModalPrefill] = useState<{ account_1?: string; brand?: string } | null>(null);

  // Bulk add — the unified modal (paste / CSV / pre-selected) + multi-select.
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkInitialRows, setBulkInitialRows] = useState<BulkRow[] | null>(null);
  // Selected unmanaged candidates, keyed by row id so the choice survives
  // pagination (we keep the handle + name we need to add them).
  const [selected, setSelected] = useState<Map<string, { handle: string; name: string | null }>>(new Map());

  // Sort
  type SortCol = 'real_name' | 'retainer' | 'posts_period' | 'last_post_date' | 'joined' | 'gmv_period' | 'roi_period';
  const [sortBy, setSortBy] = useState<SortCol>('gmv_period');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const toggleSort = (col: SortCol) => {
    if(creatorView==='top')setCreatorView('creators');
    if (sortBy === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir(col === 'real_name' ? 'asc' : 'desc'); }
  };
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

  // Debounce search.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadedSummaryKey = useRef('');
  const loadedSummaryAt = useRef(0);
  const summaryContext = JSON.stringify([brand,preset,customStart,customEnd,searchParams.toString()]);
  const rosterRequest = useRef<LatestRequest | null>(null);
  if (!rosterRequest.current) rosterRequest.current = new LatestRequest();

  const fetchRoster = useCallback(async (reuseSummary = false) => {
    setLoading(true);
    await rosterRequest.current!.run(async (signal) => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        sort: sortBy,
        dir: sortDir,
        range: preset,
      });
      if (isCustomPeriod && customStart && customEnd) { params.set('start', customStart); params.set('end', customEnd); }
      if (brand && brand !== 'all') params.set('brand', brand);
      if (reuseSummary && loadedSummaryKey.current === summaryContext && Date.now() - loadedSummaryAt.current < 60_000) params.set('summary', '0');
      if (search) params.set('search', search);
      if (productFilter) params.set('product', productFilter);
      if(creatorView==='elite'&&brand!=='all')params.append('tag','elite');
      if(groupFilter.brand===brand){for(const tag of groupFilter.tags)params.append('tag',tag);params.set('tag_mode',groupFilter.mode);}
      if (view !== 'managed') params.set('include', 'all');
      if (view === 'unmanaged') params.set('managed', 'unmanaged');
      if (health !== 'all') params.set('health', health);
      if (segFilters?.min_gmv != null) params.set('min_gmv', String(segFilters.min_gmv));
      if (segFilters?.max_gmv != null) params.set('max_gmv', String(segFilters.max_gmv));
      if (segFilters?.min_posts != null) params.set('min_posts', String(segFilters.min_posts));

      const res = await fetch(`/api/roster?${params}`, { signal });
      // res.json() succeeds on a 500/401/403 too (the body is {error}), so
      // WITHOUT this guard json.data is undefined → setRoster([]) → a confident
      // "No creators found" over $0 KPIs. Guard, then let catch handle it.
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Roster load failed (${res.status})`);
      }
      return await res.json();
    }, {
      success: (json) => {
        setLoadError(false);
        setHasLoadedOnce(true);
        setRoster(json.data || []);
        setResolvedPeriod(json.period ?? null);
        setLoadedCoreScope(coreScope);
        setTotal(json.total || 0);
        // An omitted summary is reused for pagination. An explicit null is an
        // unavailable result and must replace the previous successful number.
        if ('total_gmv_period' in json) setTotalGmvPeriod(json.total_gmv_period ?? null);
        // Health counts are over the FULL managed set (unaffected by the active
        // health filter), so the triage chips always show totals.
        setHealthCounts({
          healthy: json.healthy_count ?? 0,
          behind: json.behind_count ?? 0,
          silent: json.silent_count ?? 0,
          low_roi: json.low_roi_count ?? 0,
          affiliate: json.affiliate_count ?? 0,
        });
        if ('summary' in json) { setSummary(json.summary ?? null); loadedSummaryKey.current = summaryContext; loadedSummaryAt.current = Date.now(); }
      },
      error: (err) => {
        console.error('Failed to fetch roster:', err);
        // Flag the error; leave the last-good rows/KPIs in place rather than
        // zeroing them. The render shows an error banner (or an error state on a
        // cold failure with no rows) — never a fake-empty roster.
        setLoadError(true);
      },
      settled: () => setLoading(false),
    });
  }, [brand, view, search, productFilter, groupFilter, creatorView, health, page, sortBy, sortDir, preset, customStart, customEnd, isCustomPeriod, segFilters, summaryContext, coreScope]);

  useEffect(() => {
    void fetchRoster(true);
    return () => rosterRequest.current?.cancel();
  }, [fetchRoster]);

  useEffect(() => {
    const reloadScope = () => {
      workspaceGeneration.current += 1;
      rosterRequest.current?.cancel();
      studioCache.current.clear();
      loadedSummaryKey.current = '';
      setStudioRows({}); setResolvedPeriod(null); setLoadedCoreScope('');
      setRoster([]); setSummary(null); setHasLoadedOnce(false); setLoadError(false);
      setTotal(0); setTotalGmvPeriod(null);
      setSelectedCreator(null); setEditingCreator(null); setTagIds([]);
      setManagedSelection(new Set()); setSelected(new Map());
      // Summary is fetched on page one. A new workspace must not retain a
      // later-page closure that can return fresh rows without any totals.
      setPage(1);
      if (page === 1) void fetchRoster();
    };
    window.addEventListener('workspace-context-changed', reloadScope);
    return () => window.removeEventListener('workspace-context-changed', reloadScope);
  }, [fetchRoster, page]);

  // Export the current view (all matching rows, not just the page) to CSV/Excel.
  const [exporting, setExporting] = useState(false);
  const handleExport = useCallback(async (format: 'csv' | 'xlsx') => {
    setExporting(true);
    setExportError('');
    try {
      const params = new URLSearchParams({ sort: sortBy, dir: sortDir, range: preset, all: '1' });
      if (isCustomPeriod && customStart && customEnd) { params.set('start', customStart); params.set('end', customEnd); }
      if (brand && brand !== 'all') params.set('brand', brand);
      if (search) params.set('search', search);
      if (productFilter) params.set('product', productFilter);
      if(creatorView==='elite'&&brand!=='all')params.append('tag','elite');
      if(groupFilter.brand===brand){for(const tag of groupFilter.tags)params.append('tag',tag);params.set('tag_mode',groupFilter.mode);}
      if (view !== 'managed') params.set('include', 'all');
      if (view === 'unmanaged') params.set('managed', 'unmanaged');
      if (health !== 'all') params.set('health', health);
      if (segFilters?.min_gmv != null) params.set('min_gmv', String(segFilters.min_gmv));
      if (segFilters?.max_gmv != null) params.set('max_gmv', String(segFilters.max_gmv));
      if (segFilters?.min_posts != null) params.set('min_posts', String(segFilters.min_posts));
      const res = await fetch(`/api/roster?${params}`);
      if (!res.ok) throw new Error('Export could not be prepared.');
      const json = await res.json();
      // Keep exports self-describing: a custom window labels the columns with the
      // actual dates rather than the literal "Custom".
      const exportPeriodTag = isCustomPeriod && customStart && customEnd
        ? `${fmtShortDate(customStart)}–${fmtShortDate(customEnd)}`
        : periodShort;
      const rows = ((json.data as Creator[]) ?? []).map((c) => ({
        Name: c.real_name ?? '',
        Handles: (c.handles ?? []).join(', '),
        Brand: brandOptions.find((b) => b.slug === c.brand)?.name ?? brandMeta.label(c.brand) ?? c.brand ?? '',
        Products: (c.product_tags ?? []).map((t) => t.name).join(', '),
        Status: c.status ?? '',
        // Blank (not 0) when withheld/unset — an exported $0 would be fabricated.
        'Current retainer': c.retainer ?? '',
        'Current posts/mo target': c.monthly_post_requirement ?? '',
        [`Posts (${exportPeriodTag})`]: c.posts_period ?? 0,
        'Last post': c.last_post_date ?? '',
        Joined: c.joined ?? '',
        [`GMV (${exportPeriodTag})`]: Math.round(c.gmv_period ?? 0),
        ROI: c.roi_period != null ? Number(c.roi_period.toFixed(1)) : '',
      }));
      if (rows.length === 0) return;
      const stamp = new Date().toISOString().split('T')[0];
      const fname = `creators${brand && brand !== 'all' ? `_${brand}` : ''}_${stamp}`;
      if (format === 'csv') downloadCsv(`${fname}.csv`, rows);
      else await downloadXlsx(`${fname}.xlsx`, [{ name: 'Creators', rows }]);
    } catch (err) {
      console.error('Export failed:', err);
      setExportError('Could not export the roster. Please try again.');
    } finally {
      setExporting(false);
    }
  }, [brand, view, search, productFilter, groupFilter, creatorView, sortBy, sortDir, preset, customStart, customEnd, isCustomPeriod, periodShort, brandOptions, brandMeta, health, segFilters]);

  // Reset to page 1 when scope/sort/period change.
  useEffect(() => { setPage(1); }, [brand, view, sortBy, sortDir, preset, customStart, customEnd, productFilter]);
  // Clear search + product filter + reset view scope when the brand changes.
  useEffect(() => {
    if (segmentBrandReset.current === brand) { segmentBrandReset.current = null; return; }
    setSearchInput(''); setView('managed'); setProductFilter('');
  }, [brand]);
  // Drop any multi-select when the scope changes (selection only applies to the
  // unmanaged candidates currently in view).
  useEffect(() => { setSelected(new Map()); }, [brand, view]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Multi-select over unmanaged candidates (All / Unmanaged views) ──
  const toggleSelect = (c: Creator) => {
    if (c.is_managed) {
      if (brand === 'all' || c.grouped) return;
      setManagedSelection(prev => { const next=new Set(prev); if(next.has(c.id)) next.delete(c.id); else next.add(c.id); return next; });
    } else setSelected(prev => { const next=new Map(prev); if(next.has(c.id)) next.delete(c.id); else next.set(c.id,{handle:primaryHandle(c) ?? '',name:c.real_name}); return next; });
  };
  const toggleSelectAllPage = () => {
    const selectable=roster.filter(c=>!c.grouped && (!c.is_managed || brand!=='all'));
    const all=selectable.length>0 && selectable.every(c=>c.is_managed?managedSelection.has(c.id):selected.has(c.id));
    setManagedSelection(prev=>{const next=new Set(prev); for(const c of selectable.filter(c=>c.is_managed)) {if(all)next.delete(c.id);else next.add(c.id);}return next;});
    setSelected(prev=>{const next=new Map(prev);for(const c of selectable.filter(c=>!c.is_managed)){if(all)next.delete(c.id);else next.set(c.id,{handle:primaryHandle(c)??'',name:c.real_name});}return next;});
  };
  const openBulkFromSelection = () => {
    const rows: BulkRow[] = Array.from(selected.values())
      .filter((s) => s.handle)
      .map((s) => ({ handle: s.handle, name: s.name ?? undefined }));
    setBulkInitialRows(rows);
    setBulkOpen(true);
  };

  // Segments: apply a picked segment's filters to the roster, and snapshot the
  // current filters for saving. Threshold filters (min/max GMV, min posts) live
  // in segFilters (there's no visible control for them) and surface as a chip.
  const applySegment = (c: SegmentFilterCriteria, name: string) => {
    const nextBrand = c.brand && c.brand !== 'all' ? c.brand : 'all';
    if (nextBrand !== brand) segmentBrandReset.current = nextBrand;
    if (c.range) changePeriod(c.range, c.start ?? null, c.end ?? null, nextBrand);
    else setBrand(nextBrand);
    setHealth(c.health ?? 'all');
    if (c.view) setView(c.view);
    setProductFilter(c.product ?? '');
    setSearchInput(c.search ?? '');
    setSearch(c.search ?? '');
    setPage(1);
    setSegFilters({ name, min_gmv: c.min_gmv ?? null, max_gmv: c.max_gmv ?? null, min_posts: c.min_posts ?? null });
  };
  const currentCriteria: SegmentFilterCriteria = {
    brand, view, product: productFilter || null, search: search || null, health,
    range: preset, start: customStart, end: customEnd,
    min_gmv: segFilters?.min_gmv ?? null,
    max_gmv: segFilters?.max_gmv ?? null,
    min_posts: segFilters?.min_posts ?? null,
  };

  // Full brand totals remain independent of the table's search and filters.
  const affiliateGmv = summary?.affiliate_gmv ?? null;
  const totalRetainer = summary?.total_retainer ?? null;

  const coreMatches = loadedCoreScope === coreScope;
  const summaryMatches = coreMatches && loadedSummaryKey.current === summaryContext;
  const summaryLoading = !summaryMatches && !loadError;
  const selectedBrandLabel = brand === 'all' ? 'All brands' : brandOptions.find(option => option.slug === brand)?.name ?? brandMeta.label(brand) ?? brand;
  const summaryPeriodLabel = summaryMatches && resolvedPeriod ? `${fmtShortDate(resolvedPeriod.start)} – ${fmtShortDate(resolvedPeriod.end)}` : periodLabel;
  const studioIds = useMemo(() => roster.flatMap(c => c.grouped ? (c.brands ?? []).map(b=>b.row_id) : c.is_managed ? [c.id] : []).filter(id=>/^\d+$/.test(id)).sort(), [roster]);
  const studioKey = coreMatches && resolvedPeriod ? JSON.stringify([studioIds,resolvedPeriod.end,brand]) : '';
  useEffect(() => {
    if (!studioKey || !resolvedPeriod || !studioIds.length) { setStudioLoading(false); return; }
    const cached=studioCache.current.get(studioKey);
    if(cached && Date.now()-cached.at<60_000){setStudioRows(cached.rows);setStudioLoading(false);setStudioError(false);return;}
    const controller=new AbortController();
    const generation=workspaceGeneration.current;
    setStudioRows({});setStudioLoading(true);setStudioError(false);
    void (async()=>{
      try {
        const result:Record<string,RosterStudioData>={};
        for(let index=0;index<studioIds.length;index+=100){
          const params=new URLSearchParams({ids:studioIds.slice(index,index+100).join(','),asOf:resolvedPeriod.end});
          const response=await fetch(`/api/roster/studio?${params}`,{signal:controller.signal});
          if(!response.ok)throw new Error('Creator details unavailable');
          const data=await response.json();
          for(const row of data.rows ?? [])result[row.id]=row.studio;
        }
        if(controller.signal.aborted || generation!==workspaceGeneration.current)return;
        if(studioCache.current.size>=8)studioCache.current.delete(studioCache.current.keys().next().value!);
        studioCache.current.set(studioKey,{at:Date.now(),rows:result});setStudioRows(result);
      }catch(error){if(!controller.signal.aborted){console.error('Roster details:',error);setStudioError(true);}}
      finally{if(!controller.signal.aborted)setStudioLoading(false);}
    })();
    return()=>controller.abort();
  },[studioKey,studioIds,resolvedPeriod]);
  useEffect(()=>{setSelectedCreator(null);setEditingCreator(null);setManagedSelection(new Set());setTagIds([]);},[brand,preset,customStart,customEnd]);
  const displayRoster=useMemo(()=>coreMatches?roster.map(c=>({...c,studio:studioRows[c.id],brands:c.brands?.map(b=>({...b,studio:studioRows[b.row_id]}))})):[],[roster,studioRows,coreMatches]);
  const overviewCreator=selectedCreator?{...selectedCreator,studio:studioRows[selectedCreator.id]??selectedCreator.studio}:null;
  const tableLoading=loading || (!coreMatches && !loadError);
  const monthLabel=coreMatches && resolvedPeriod ? new Date(`${resolvedPeriod.end}T12:00:00Z`).toLocaleDateString('en-US',{month:'short',timeZone:'UTC'}):'Monthly';
  const clearFilters=()=>{setSearchInput('');setSearch('');setHealth('all');setProductFilter('');setSegFilters(null);setView('managed');setCreatorView('creators');setGroupFilter({brand,tags:[],mode:'any'});setPage(1);};
  const activeFilters=Boolean(searchInput || health!=='all' || productFilter || segFilters || view!=='managed' || (groupFilter.brand===brand && groupFilter.tags.length));
  const invalidateDetails=()=>{studioCache.current.clear();void fetchRoster();};
  const sortOptions=[{value:'gmv_period:desc',label:'GMV: highest first'},{value:'gmv_period:asc',label:'GMV: lowest first'},{value:'real_name:asc',label:'Name: A to Z'},{value:'real_name:desc',label:'Name: Z to A'},{value:'posts_period:desc',label:'Published: most first'},{value:'posts_period:asc',label:'Published: fewest first'},{value:'retainer:desc',label:'Retainer: highest first'},{value:'retainer:asc',label:'Retainer: lowest first'},{value:'last_post_date:desc',label:'Last post: newest first'},{value:'last_post_date:asc',label:'Last post: oldest first'},{value:'joined:desc',label:'Joined: newest first'},{value:'joined:asc',label:'Joined: oldest first'},{value:'roi_period:desc',label:'GMV / retainer: highest first'},{value:'roi_period:asc',label:'GMV / retainer: lowest first'}];
  const changeView=(next:'creators'|'top'|'elite')=>{setCreatorView(next);setPage(1);setSearchInput('');setSearch('');setHealth('all');setProductFilter('');setSegFilters(null);setView('managed');setGroupFilter({brand,tags:[],mode:'any'});setSortBy(next==='creators'?'real_name':'gmv_period');setSortDir(next==='creators'?'asc':'desc');};

  return <RosterTagsProvider brand={brand}>
    <div className={rosterLayout.page}>
      <header className={rosterLayout.header}>
        <div><h1>Creators</h1><p>A clear view of every creator, their work, and the next conversation.</p></div>
        <div className={rosterLayout.headerActions}>
          <DropdownMenu.Root><DropdownMenu.Trigger className={rosterLayout.button} disabled={exporting || tableLoading || !displayRoster.length}>{exporting?<Loader2 size={15} className="animate-spin"/>:<FileDown size={15}/>}Export roster<ChevronDown size={14}/></DropdownMenu.Trigger>
            <DropdownMenu.Portal><DropdownMenu.Content className={rosterLayout.filterPanel} align="end" sideOffset={7} collisionPadding={12}>
              <DropdownMenu.Item onSelect={()=>void handleExport('csv')}>Download CSV</DropdownMenu.Item><DropdownMenu.Item onSelect={()=>void handleExport('xlsx')}>Download Excel</DropdownMenu.Item>
            </DropdownMenu.Content></DropdownMenu.Portal>
          </DropdownMenu.Root>
          <button type="button" className={rosterLayout.primaryButton} onClick={()=>setAddModalPrefill({brand:brand!=='all'?brand:''})}><Plus size={15}/>Add creator</button>
        </div>
      </header>
      <div className={rosterLayout.scopeToolbar} aria-label="Roster scope">
        <div className={rosterLayout.scopeField}>
          <label htmlFor="roster-brand">Brand</label>
          <ChoiceMenu id="roster-brand" label="Brand" value={brand} disabled={brandsLoading} placeholder={brandsLoading ? 'Loading brands…' : 'Choose a brand'} triggerClassName={rosterLayout.brandTrigger} options={[{value:'all',label:'All brands'},...brandOptions.map(b=>({value:b.slug,label:b.name})),...(brand!=='all'&&!brandOptions.some(b=>b.slug===brand)?[{value:brand,label:brandsLoading?'Loading brand…':'Selected brand unavailable',disabled:true}]:[])]} onChange={setBrand}/>
        </div>
        <div className={rosterLayout.scopeField}>
          <span className={rosterLayout.scopeLabel}>Period</span>
          <DateRangePicker appearance="studio" label="Roster period" value={preset} customRange={{start:customStart,end:customEnd}} displayRange={coreMatches&&resolvedPeriod?resolvedPeriod:undefined} onPresetChange={p=>{if(p!=='custom')changePeriod(p);}} onCustomChange={(start,end)=>changePeriod('custom',start,end)}/>
        </div>
      </div>
      <RosterStats retainerBudget={summaryMatches?totalRetainer:null} managedGmv={summaryMatches?totalGmvPeriod:null} videosPublished={summaryMatches?summary?.videos_published??null:null} retainerComplete={summary?.retainer_complete===true} retainerMissingCount={summaryMatches?summary?.retainer_missing_count??null:null} gmvComplete={summary?.gmv_complete===true} videosComplete={summary?.videos_complete===true} brandLabel={selectedBrandLabel} periodLabel={summaryPeriodLabel} loading={summaryLoading} refreshing={summaryMatches&&loading} stale={summaryMatches&&loadError}/>
      <div className={rosterLayout.tabsRow}>
        <div className={rosterLayout.tabs} role="tablist" aria-label="Creator views" onKeyDown={event=>{
          if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
          event.preventDefault();
          const values=['creators','top','elite'] as const;
          const current=values.indexOf(creatorView);
          const next=event.key==='Home'?0:event.key==='End'?2:(current+(event.key==='ArrowRight'?1:2))%3;
          changeView(values[next]);
          (event.currentTarget.querySelectorAll('[role=tab]')[next] as HTMLButtonElement)?.focus();
        }}>{([{value:'creators',label:'Creators'},{value:'top',label:'Top creators'},{value:'elite',label:'Elites'}] as const).map(tab=><button key={tab.value} type="button" id={`roster-tab-${tab.value}`} role="tab" aria-controls="roster-results" tabIndex={creatorView===tab.value?0:-1} aria-selected={creatorView===tab.value} className={creatorView===tab.value?rosterLayout.activeTab:undefined} onClick={()=>changeView(tab.value)}>{tab.label}</button>)}</div>
        <div className={rosterLayout.freshness}><span>{tableLoading?'Updating creators…':coreMatches&&resolvedPeriod?`Selected dates through ${fmtShortDate(resolvedPeriod.end)}`:'Creator directory'}</span><button type="button" aria-label="Refresh creators" disabled={loading} onClick={invalidateDetails}><RefreshCw size={14} className={loading?'animate-spin':undefined}/></button></div>
      </div>
      <section id="roster-results" role="tabpanel" aria-labelledby={`roster-tab-${creatorView}`}>
        <div className={rosterLayout.toolbar}>
          <SearchInput className={rosterLayout.search} aria-label="Search creators" placeholder="Search creators or handles" value={searchInput} onChange={e=>setSearchInput(e.target.value)} onClear={()=>setSearchInput('')}/>
          <RosterTagFilter key={brand} selected={creatorView==='elite'?['elite']:groupFilter.brand===brand?groupFilter.tags:[]} mode={groupFilter.mode} onChange={(tags,mode)=>{setCreatorView('creators');setGroupFilter({brand,tags,mode});setPage(1);}}/>
          <Popover.Root open={filtersOpen} onOpenChange={setFiltersOpen}><Popover.Trigger className={rosterLayout.moreTrigger}><SlidersHorizontal size={14}/><span>More filters</span>{health!=='all'||productFilter||view!=='managed'||segFilters?<i aria-label="Additional filters active"/>:null}</Popover.Trigger>
            <Popover.Portal><Popover.Content className={rosterLayout.filterPanel} align="end" sideOffset={7} collisionPadding={12} data-lenis-prevent>
              <div className={rosterLayout.filterHeading}><strong>Creator filters</strong><Popover.Close aria-label="Close filters"><X size={15}/></Popover.Close></div>
              <div className={rosterLayout.filterGroup}><span>Roster membership</span><ChoiceMenu compact label="Roster membership" value={view} options={[{value:'managed',label:'Managed creators'},{value:'all',label:'All creators'},{value:'unmanaged',label:'Unmanaged creators'}]} onChange={next=>{setView(next as View);setCreatorView('creators');setPage(1);if(next!=='managed')setHealth('all');}}/></div>
              {view==='managed'&&<div className={rosterLayout.filterGroup}><span>Activity health</span><ChoiceMenu compact label="Activity health" value={health} options={[{value:'all',label:'All activity'},{value:'healthy',label:`Healthy (${healthCounts.healthy})`},{value:'behind',label:`Behind (${healthCounts.behind})`},{value:'silent',label:`Silent (${healthCounts.silent})`},{value:'low_roi',label:`Low GMV / retainer (${healthCounts.low_roi})`},{value:'affiliate',label:`Affiliate (${healthCounts.affiliate})`}]} onChange={next=>{setHealth(next);setPage(1);}}/></div>}
              <div className={rosterLayout.filterGroup}><span>Product</span><ProductFilterSelect brand={brand} value={productFilter} onChange={next=>{setProductFilter(next);setPage(1);}}/></div>
              <div className={rosterLayout.filterGroup}><span>Saved segments</span><RosterSegmentControls currentCriteria={currentCriteria} onApply={applySegment}/></div>
              <div className={rosterLayout.filterFooter}><button type="button" onClick={()=>{setBulkInitialRows(null);setBulkOpen(true);setFiltersOpen(false);}}><Upload size={14}/>Bulk add creators</button><button type="button" onClick={clearFilters}>Reset filters</button></div>
            </Popover.Content></Popover.Portal>
          </Popover.Root>
          {activeFilters&&<button type="button" className={rosterLayout.textButton} onClick={clearFilters}>Clear filters</button>}
        </div>
        {segFilters&&<div className={rosterLayout.activeFilters}><span>Segment: {segFilters.name}</span><button type="button" onClick={()=>setSegFilters(null)} aria-label="Clear segment"><X size={13}/></button></div>}
        <div className={rosterLayout.resultBar}><p role="status">{tableLoading?'Loading creator results…':!coreMatches||loadError&&!hasLoadedOnce?'Creator results unavailable':`${total.toLocaleString()} ${view==='managed'?'managed ':''}${total===1?'creator':'creators'}`}{creatorView==='top'?' · Ranked by GMV':creatorView==='elite'?' · Tagged Elite':''}</p><ChoiceMenu compact triggerClassName={rosterLayout.sortControl} label="Sort creators" value={`${sortBy}:${sortDir}`} options={sortOptions} onChange={value=>{const [key,dir]=value.split(':');setSortBy(key as SortCol);setSortDir(dir as 'asc'|'desc');if(creatorView==='top')setCreatorView('creators');}}/></div>
        {(selected.size>0||managedSelection.size>0)&&<div className={rosterLayout.selectionBar}><span>{selected.size+managedSelection.size} selected</span><div><button type="button" onClick={()=>{setSelected(new Map());setManagedSelection(new Set());}}>Clear selection</button>{managedSelection.size>0&&<button type="button" onClick={()=>setTagIds([...managedSelection])}>Edit tags ({managedSelection.size})</button>}{selected.size>0&&<button type="button" onClick={openBulkFromSelection}>Add to roster ({selected.size})</button>}</div></div>}
        {loadError&&<div role="alert" className={rosterLayout.notice}><AlertTriangle size={16}/><span>{coreMatches&&roster.length?'Could not refresh. Showing the last loaded results.':'Could not load creators. Please try again.'}</span><button type="button" onClick={invalidateDetails}>Retry</button></div>}
        {exportError&&<div role="alert" className={rosterLayout.notice}>{exportError}<button type="button" onClick={()=>setExportError('')} aria-label="Dismiss export error"><X size={14}/></button></div>}
        {creatorView==='elite'&&brand==='all'?<div className={rosterLayout.empty}><Users size={28}/><h2>Choose a brand</h2><p>Elite membership is specific to each brand. Select a brand to see its Elite creators.</p></div>:!tableLoading&&!displayRoster.length?<div className={rosterLayout.empty}><Users size={28}/><h2>{loadError?'Creators are unavailable':'No creators found'}</h2><p>{loadError?'Retry to load the roster.':activeFilters?'Try a different search or clear the filters.':'Add a creator to get started.'}</p>{activeFilters&&<button type="button" className={rosterLayout.button} onClick={clearFilters}>Clear filters</button>}</div>:<StudioRosterTable rows={displayRoster} brand={brand} loading={tableLoading} showLoadBar={showLoadBar} studioLoading={studioLoading} sort={sortBy} direction={sortDir} onSort={toggleSort} selected={new Set([...selected.keys(),...managedSelection])} onSelect={toggleSelect} onSelectPage={toggleSelectAllPage} expanded={expanded} onActivate={c=>{if(c.grouped)toggleExpand(c.id);else if(!c.is_managed)setAddModalPrefill({account_1:primaryHandle(c)??'',brand:c.brand??(brand!=='all'?brand:'')});else setSelectedCreator(c);}} onOpenChild={openChild} onEditTags={id=>setTagIds([id])} label={slug=>brandMeta.label(slug)??slug} page={page} total={total} pages={totalPages} onPage={setPage} monthLabel={monthLabel}/>}
        {coreMatches&&displayRoster.length>0&&<p className={rosterLayout.caption}>Published counts cover the selected dates. {monthLabel} delivery shows recorded month publications; qualifying delivery is unverified.{studioError?' Agreement history and owner details could not be loaded.':''}</p>}
      </section>
      <details className={rosterLayout.summary} open={summaryOpen} onToggle={e=>setSummaryOpen(e.currentTarget.open)}><summary>Performance summary<ChevronDown size={15}/></summary>{summaryOpen&&<div className={rosterLayout.overview}>
        <dl className={rosterLayout.metrics} aria-label="Roster performance">
          <RosterMetric label="Affiliate GMV" value={summaryLoading?'Loading…':!summaryMatches||affiliateGmv==null?'Unavailable':fmt(affiliateGmv)} detail={summaryMatches&&summary?.gmv_complete===false?'Partial recorded data':summaryPeriodLabel}/>
          <RosterMetric label="Managed share" value={summaryLoading?'Loading…':summaryMatches&&summary?.gmv_complete===true&&affiliateGmv!=null&&affiliateGmv>0&&totalGmvPeriod!=null?`${((totalGmvPeriod/affiliateGmv)*100).toFixed(0)}%`:'Unavailable'}/>
        </dl><div className={rosterLayout.videoSummary}><NewVideoGmvCard compact brand={brand} range={preset} start={customStart} end={customEnd} showCreators/></div>
      </div>}</details>
      {overviewCreator&&<CreatorOverviewDrawer key={overviewCreator.id} creator={overviewCreator} periodLabel={periodLabel} start={coreMatches?resolvedPeriod?.start:null} end={coreMatches?resolvedPeriod?.end:null} range={preset} onClose={()=>setSelectedCreator(null)} onRemoved={()=>{setSelectedCreator(null);invalidateDetails();}} onEdit={roster.some(c=>!c.grouped&&c.id===overviewCreator.id)?()=>{setEditingCreator(overviewCreator);setSelectedCreator(null);}:undefined} onEditTags={brand!=='all'&&overviewCreator.brand===brand?()=>{setTagIds([overviewCreator.id]);setSelectedCreator(null);}:undefined}/>}
      {editingCreator&&<CreatorPanel key={editingCreator.id} creator={editingCreator} onClose={()=>setEditingCreator(null)} onSaved={updated=>{setEditingCreator(updated);invalidateDetails();}} onRemoved={()=>{setEditingCreator(null);invalidateDetails();}}/>}
      <RosterTagEditor ids={tagIds} open={tagIds.length>0} onOpenChange={open=>{if(!open)setTagIds([]);}} onChanged={invalidateDetails} onSaved={()=>{setTagIds([]);setManagedSelection(new Set());}}/>

      {/* Add Creator modal */}
      {addModalPrefill !== null && (
        <AddCreatorModal
          prefill={addModalPrefill}
          onClose={() => setAddModalPrefill(null)}
          onSuccess={() => { setAddModalPrefill(null); fetchRoster(); }}
        />
      )}

      {/* Bulk add modal — paste / CSV (header button) or pre-selected creators
          (multi-select bar). One brand per batch, shared endpoint. */}
      {bulkOpen && (
        <BulkAddModal
          defaultBrand={brand}
          initialRows={bulkInitialRows ?? undefined}
          onClose={() => { setBulkOpen(false); setBulkInitialRows(null); }}
          onSuccess={() => { setSelected(new Map()); fetchRoster(); }}
        />
      )}

      <style jsx global>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </div>
  </RosterTagsProvider>;
}

export default function RosterPage() {
  return (
    <Suspense fallback={<RosterLoading />}>
      <RosterContent />
    </Suspense>
  );
}
