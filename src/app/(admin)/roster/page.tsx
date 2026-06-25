'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  UserPlus, Search, Users, UserCheck, X,
  ChevronLeft, ChevronRight, ExternalLink, Loader2,
  UserX, Globe, Pencil, Check, Plus, Trash2, ArrowUp, ArrowDown, ArrowUpDown, Upload, FileDown, Calendar,
} from 'lucide-react';
import Link from 'next/link';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { DATE_PRESETS, type DatePreset } from '@/lib/data/date-utils';
import { CustomRangePopover } from '@/components/dashboard/custom-range-popover';
import { BulkAddModal, type BulkRow } from '@/components/roster/BulkAddModal';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { TableLoadBar } from '@/components/ui/table-load-bar';
import { ProductTagPicker, ProductFilterSelect } from '@/components/roster/product-tag-picker';
import { downloadCsv } from '@/lib/utils/csv';
import { downloadXlsx } from '@/lib/utils/xlsx';
import { useBrandList } from '@/hooks/use-brand-list';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { ModalOverlay } from '@/components/ui/modal-overlay';

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

type CreatorHealth = 'healthy' | 'behind' | 'silent' | 'churned' | 'no_data';

interface Creator {
  id: string;
  real_name: string | null;
  brand: string | null;
  status: string | null;
  retainer: number | null;
  monthly_post_requirement: number | null;
  discord_name: string | null;
  discord_avatar: string | null;
  notes: string | null;
  created_at: string | null;
  // FK to creators_v2. Null for unmanaged universe rows; set for managed.
  creator_id: string | null;
  // Canonical handle list (from tiktok_accounts via the API, primary first,
  // unlimited). account_1..5 stay for back-compat; new code reads `handles`.
  handles: string[];
  account_1: string | null;
  account_2: string | null;
  account_3: string | null;
  account_4: string | null;
  account_5: string | null;
  // ── Perf signals (added by /api/roster) ──
  // Period-driven: changes when the period selector moves.
  gmv_period: number;
  // Per-(data brand slug) GMV split for the same period. Empty object when
  // there's no data. Powers the side-panel "Revenue by store" section, the
  // row's store-mix indicator, and the LeeFar Nutrition/Supplements sub-pill.
  gmv_by_store: Record<string, number>;
  // Distinct posts over the selected period — drives the Posts column.
  posts_period: number;
  // Rolling 7-day distinct video count — legacy, unused by the simple page.
  posts_7d: number;
  last_post_date: string | null;
  // When the creator joined the roster (joined_at ?? created_at). Null for unmanaged.
  joined: string | null;
  health: CreatorHealth;
  // Period-driven: gmv_period ÷ retainer, null when retainer is 0.
  roi_period: number | null;
  // ── Messaging signals ──
  last_message_at: string | null;
  unread_count: number;
  // True for managed_creators rows; false for unmanaged universe candidates
  // (returned only when ?include=all). Drives the row's action cell + cell-by-cell
  // dimming for fields that don't apply to unmanaged creators.
  is_managed: boolean;
  // Resolved product tags (key + display name). Empty = no specific product.
  product_tags: { key: string; name: string }[];
}

/** Primary handle — first in the canonical list, falls back to legacy account_1. */
function primaryHandle(c: Creator): string | null {
  return c.handles?.[0] ?? c.account_1 ?? null;
}

/** Handles beyond the primary, for the "+N" badge. */
function extraHandles(c: Creator): string[] {
  if (c.handles && c.handles.length > 1) return c.handles.slice(1);
  return [c.account_2, c.account_3, c.account_4, c.account_5].filter(Boolean) as string[];
}

function StatusBadge({ status }: { status: string | null }) {
  // Null/empty status → neutral dash (not green "Active")
  if (!status) {
    return <span className="text-xs text-gray-300">—</span>;
  }
  const STYLE: Record<string, string> = {
    Active:   'bg-green-50 text-green-600',
    Inactive: 'bg-gray-100 text-gray-500',
    Churned:  'bg-red-50 text-red-600',
    'On Hold': 'bg-yellow-50 text-yellow-700',
    Paused:   'bg-yellow-50 text-yellow-700',
  };
  const cls = STYLE[status] ?? 'bg-gray-100 text-gray-500';
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${cls}`}>
      {status}
    </span>
  );
}

// ─── Perf-cell presentational helpers ─────────────────────────────────────
//
// These render the new performance columns on the Managed Roster table.
// Health drives the row-level color story; the other helpers are about
// fast scanning ("at a glance, is this creator on track?").


function LastPostCell({ date }: { date: string | null }) {
  if (!date) return <span className="text-gray-300">—</span>;
  const ms = Date.now() - new Date(date + 'T00:00:00Z').getTime();
  const days = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  const cls =
    days >= 30 ? 'text-red-600 font-semibold'
    : days >= 14 ? 'text-orange-600 font-semibold'
    : days >= 7 ? 'text-gray-600'
    : 'text-gray-400';
  const label = days === 0 ? 'today' : days === 1 ? '1d ago' : `${days}d ago`;
  return <span className={`text-xs ${cls}`}>{label}</span>;
}

/**
 * Posts/7D badge — color-coded thresholds matching the old Netlify dashboard.
 * 0 = red (silent), 1-3 = orange, 4-5 = yellow, 6-9 = green, 10+ = blue.
 */

/**
 * Join Date cell — shows the managed_creators.created_at as a short date.
 * Returns em-dash for unmanaged or missing values.
 */
function JoinDateCell({ date }: { date: string | null }) {
  if (!date) return <span className="text-gray-300">—</span>;
  const d = new Date(date);
  if (isNaN(d.getTime())) return <span className="text-gray-300">—</span>;
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  return <span className="text-xs text-gray-600 tabular-nums">{label}</span>;
}

/**
 * StoreMixIndicator — small letter badge next to the brand pill showing
 * which store(s) generated this creator's GMV in the current period.
 *
 * Today this is LeeFar-specific (two stores: Nutrition / Supplements). It's
 * shaped to extend — any future umbrella brand with multiple stores can drop
 * its store slugs into MULTI_STORE_BRANDS below and the component picks it up.
 */


// Searchable brand selector — replaces the wall-of-pills pattern. Renders
// a single button showing the current selection; click opens a popover
// with a search box + scrollable brand list. Designed for rosters with
// 20+ brands where pills would wrap to multiple rows.
function BrandSelect({
  value, options, onChange,
}: {
  value: string; // 'all' or a brand slug
  options: { slug: string; name: string; color?: string }[];
  onChange: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [portalReady, setPortalReady] = useState(false);
  const [anchorRect, setAnchorRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setPortalReady(true); }, []);

  // Recompute popover position when it opens, on resize, and when the page
  // scrolls — keeps the popover anchored under the button at all times.
  useEffect(() => {
    if (!open) return;
    const updateRect = () => {
      const r = buttonRef.current?.getBoundingClientRect();
      if (r) setAnchorRect({ left: r.left, top: r.bottom + 4, width: r.width });
    };
    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true); // capture scrolls in any container
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        wrapperRef.current && !wrapperRef.current.contains(t)
        && popoverRef.current && !popoverRef.current.contains(t)
      ) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Document-level wheel listener in CAPTURE phase. This is the only
  // approach we've found that reliably blocks page scroll under all
  // browser quirks: the capture-phase listener fires before the event
  // reaches any element, preventDefault is honored (non-passive), and
  // it doesn't depend on refs being attached at the right tick. When
  // the wheel target is inside the popover, we scroll the list manually
  // and consume the event; otherwise we let it through.
  useEffect(() => {
    if (!open) return;
    const onWheel = (e: WheelEvent) => {
      const popover = popoverRef.current;
      const list = listScrollRef.current;
      if (!popover || !list) return;
      if (!popover.contains(e.target as Node)) return;
      e.preventDefault();
      e.stopPropagation();
      list.scrollTop += e.deltaY;
    };
    document.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => document.removeEventListener('wheel', onWheel, { capture: true });
  }, [open]);

  const current = value === 'all'
    ? { slug: 'all', name: 'All brands', color: undefined as string | undefined }
    : options.find(o => o.slug === value) ?? { slug: value, name: value, color: undefined };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(o => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q))
    : options;

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-[#1A1B3A] hover:bg-gray-50 hover:border-gray-300 transition-colors min-w-[180px]"
      >
        {current.slug !== 'all' && (
          <span
            className="h-2.5 w-2.5 rounded-full inline-block flex-shrink-0"
            style={{ backgroundColor: current.color ?? '#6B7280' }}
          />
        )}
        <span className="flex-1 text-left truncate">{current.name}</span>
        <span className="text-[10px] font-normal text-gray-400">
          {value === 'all' ? `${options.length}` : ''}
        </span>
        <svg className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && portalReady && anchorRect && createPortal(
        // Portal to <body> so the popover escapes <main class="animate-fade-in">
        // (which creates a stacking context that traps z-30 inside the page
        // subtree and causes wheel events to chain to the page scroll
        // container). With fixed positioning + body parent, wheel events
        // fire against the popover whose nearest scrollable ancestor IS
        // itself — no chaining possible.
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            left: anchorRect.left,
            top: anchorRect.top,
            minWidth: Math.max(288, anchorRect.width),
          }}
          className="z-[60] rounded-xl border border-gray-200 bg-white shadow-lg flex flex-col max-h-96"
        >
          <div className="p-2 border-b border-gray-100 bg-white">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search brands…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/20 focus:border-[#E91E8C]"
              />
            </div>
          </div>
          <div ref={listScrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-1">
            <button
              type="button"
              onClick={() => { onChange('all'); setOpen(false); setQuery(''); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors text-left ${
                value === 'all' ? 'bg-pink-50/40 text-[#E91E8C] font-semibold' : 'text-gray-700'
              }`}
            >
              <Globe className="h-3.5 w-3.5 text-gray-400" />
              <span className="flex-1">All brands</span>
              <span className="text-[10px] text-gray-400">{options.length}</span>
              {value === 'all' && <Check className="h-3.5 w-3.5" />}
            </button>
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-xs text-gray-400 text-center">No brands match &quot;{query}&quot;</p>
            ) : filtered.map((b) => (
              <button
                type="button"
                key={b.slug}
                onClick={() => { onChange(b.slug); setOpen(false); setQuery(''); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors text-left ${
                  value === b.slug ? 'bg-pink-50/40 text-[#E91E8C] font-semibold' : 'text-gray-700'
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full inline-block flex-shrink-0"
                  style={{ backgroundColor: b.color ?? '#6B7280' }}
                />
                <span className="flex-1 truncate">{b.name}</span>
                {value === b.slug && <Check className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// Period selector — preset chips + a custom date-range popover. Presets come
// from the shared resolveDateRange engine (same set as the Dashboard + brand
// portal), so every surface speaks the same [start, end] windows. The Custom
// chip opens the two-month calendar popover reused from the Dashboard.
function PeriodSelector({
  preset, customStart, customEnd, onPreset, onCustom,
}: {
  preset: DatePreset;
  customStart: string | null;
  customEnd: string | null;
  onPreset: (p: DatePreset) => void;
  onCustom: (start: string, end: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const isCustom = preset === 'custom' && !!customStart && !!customEnd;
  const customLabel = isCustom && customStart && customEnd
    ? `${fmtShortDate(customStart)} – ${fmtShortDate(customEnd)}`
    : 'Custom';

  return (
    <div className="relative flex flex-wrap gap-1 p-1 bg-white/10 rounded-xl">
      {DATE_PRESETS.map((p) => {
        const active = !isCustom && preset === p.value;
        return (
          <button
            key={p.value}
            onClick={() => onPreset(p.value)}
            title={p.label}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              active
                ? 'bg-white text-[#1A1B3A] shadow'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            }`}
          >
            {PERIOD_SHORT[p.value]}
          </button>
        );
      })}
      <button
        onClick={() => setOpen(o => !o)}
        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1 ${
          isCustom
            ? 'bg-white text-[#1A1B3A] shadow'
            : 'text-white/70 hover:text-white hover:bg-white/10'
        }`}
      >
        <Calendar className="h-3 w-3" />
        {customLabel}
      </button>
      {open && (
        <CustomRangePopover
          initialStart={customStart}
          initialEnd={customEnd}
          onApply={(s, e) => { onCustom(s, e); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}


function RoiCell({ roi }: { roi: number | null }) {
  if (roi === null) return <span className="text-xs text-gray-300">—</span>;
  const cls =
    roi >= 2 ? 'text-green-700 font-semibold'
    : roi >= 1 ? 'text-green-600'
    : roi >= 0.5 ? 'text-orange-600'
    : 'text-red-600 font-semibold';
  return <span className={`text-xs tabular-nums ${cls}`}>{roi.toFixed(1)}×</span>;
}

function ExtraAccountsBadge({ creator }: { creator: Creator }) {
  const extras = extraHandles(creator);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (extras.length === 0) return null;
  return (
    <div className="relative inline-block ml-1.5" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-pink-50 text-[#E91E8C] hover:bg-pink-100 transition-colors"
      >
        +{extras.length}
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-2 min-w-[160px]">
          {extras.map((h) => (
            <a
              key={h}
              href={`https://tiktok.com/@${h}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-2 py-1.5 text-xs text-[#E91E8C] hover:bg-pink-50 rounded-lg transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              @{h}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// (ACCOUNT_KEYS removed — handle storage moved to tiktok_accounts; the
// account_1..5 columns are only a backward-compat fallback now.)


function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-5 py-3.5">
          <div className="h-3.5 rounded bg-gray-100 animate-pulse" style={{ width: `${40 + ((i * 13) % 40)}%` }} />
        </td>
      ))}
    </tr>
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
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

  const { brands: brandOptions } = useBrandList();
  const brandMeta = useBrandMeta();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [saveError, setSaveError] = useState('');
  const [removing, setRemoving] = useState(false);
  // Inline confirm — replaces native confirm() which Chrome silently blocks
  // after a couple of dialogs from the same origin.
  const [confirmRemove, setConfirmRemove] = useState(false);

  const doRemove = async () => {
    setConfirmRemove(false);
    setRemoving(true);
    setSaveError('');
    try {
      const res = await fetch(`/api/roster/${creator.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Remove failed (${res.status})`);
      onRemoved(creator.id);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong');
      setRemoving(false);
    }
  };

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
    status:                  creator.status || 'Active',
    retainer:                String(creator.retainer ?? ''),
    monthly_post_requirement: String(creator.monthly_post_requirement ?? 30),
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
    setSaving(true);
    setSaveError('');
    try {
      const cleanHandles = Array.from(new Set(
        handles.map((h) => h.trim().replace(/^@/, '')).filter(Boolean),
      ));
      const res = await fetch(`/api/roster/${creator.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          handles: cleanHandles,
          product_assignments: productTags,
          retainer: form.retainer !== '' ? parseFloat(form.retainer) : 0,
          monthly_post_requirement: parseInt(form.monthly_post_requirement) || 30,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      onSaved(json.data as Creator);
      setEditing(false);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm({
      real_name:               creator.real_name || '',
      brand:                   creator.brand || '',
      status:                  creator.status || 'Active',
      retainer:                String(creator.retainer ?? ''),
      monthly_post_requirement: String(creator.monthly_post_requirement ?? 30),
      discord_name:            creator.discord_name || '',
      notes:                   creator.notes || '',
    });
    setHandles(initialHandles);
    setSaveError('');
    setEditing(false);
  };

  const displayName = creator.real_name || primaryHandle(creator) || 'Creator';

  // ── Portal target + body-scroll lock ──
  // The panel was previously rendered inline inside the page tree, which lives
  // under <main class="animate-fade-in">. The CSS `animation` on <main> creates
  // a stacking context, trapping the panel's z-50 inside that subtree. The top
  // app bar (a sibling of <main>, z-30) then paints OVER the panel header — so
  // managers couldn't see the Remove/Edit/X buttons and couldn't enter edit
  // mode. Portaling to <body> escapes the trap.
  //
  // Same fix solves the secondary report ("page scrolls behind the panel"):
  // a fixed overlay rendered inline doesn't cleanly lock body scroll because
  // wheel events bubble through to the (now-portaled-out-of) ancestor scroll
  // container. The reference-counted lock keeps the body frozen for the panel's
  // lifetime and composes safely with any modal opened on top of it.
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => { setPortalReady(true); }, []);
  useBodyScrollLock();

  if (!portalReady) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" onClick={editing ? undefined : onClose}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={editing ? undefined : onClose} />
      <div
        className="relative w-full max-w-md bg-white shadow-2xl h-full overflow-y-auto flex flex-col"
        style={{ animation: 'slideInRight 0.22s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-bold text-[#1A1B3A]">{displayName}</h2>
            {creator.brand && !editing && (
              <p className="text-xs text-gray-400 mt-0.5">
                {brandOptions.find(b => b.slug === creator.brand)?.name || brandMeta.label(creator.brand)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!editing ? (
              <>
                <button
                  onClick={() => { setSaveError(''); setConfirmRemove(true); }}
                  disabled={removing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-100 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                  title="Remove from managed roster (reversible)"
                >
                  {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  {removing ? 'Removing…' : 'Remove'}
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  <X className="h-5 w-5 text-gray-400" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E91E8C] text-white hover:bg-[#d1177d] disabled:opacity-60 transition-colors"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 flex-1">
          {saveError && (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{saveError}</p>
          )}

          {confirmRemove && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-red-900">
                  Remove {creator.real_name || primaryHandle(creator) || 'this creator'}?
                </p>
                <p className="text-xs text-red-700 mt-1 leading-relaxed">
                  They&apos;ll stop appearing in the roster, rev share, and renewals.
                  Their GMV history and audit trail stay intact — this is reversible.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={doRemove}
                  disabled={removing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
                >
                  {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  {removing ? 'Removing…' : 'Yes, remove'}
                </button>
                <button
                  onClick={() => setConfirmRemove(false)}
                  disabled={removing}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-60 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {editing ? (
            /* ── EDIT MODE ── */
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Real Name</label>
                  <input
                    type="text"
                    value={form.real_name}
                    onChange={e => set('real_name', e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Brand</label>
                  <select
                    value={form.brand}
                    onChange={e => set('brand', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
                  >
                    <option value="">— none —</option>
                    {brandOptions.map(b => (
                      <option key={b.slug} value={b.slug}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {form.brand && (
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Products</label>
                  <ProductTagPicker brand={form.brand} value={productTags} onChange={setProductTags} />
                </div>
              )}

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">TikTok Accounts</label>
                <div className="space-y-2">
                  {handles.map((h, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-4 shrink-0">{idx + 1}</span>
                      <input
                        type="text"
                        value={h}
                        onChange={(e) => setHandleAt(idx, e.target.value)}
                        placeholder={idx === 0 ? 'primary handle' : 'additional handle'}
                        className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
                      />
                      {(handles.length > 1 || h !== '') && (
                        <button
                          type="button"
                          onClick={() => removeHandle(idx)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
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
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#E91E8C] hover:underline mt-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add another handle
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Monthly Retainer ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={form.retainer}
                    onChange={e => set('retainer', e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Posts / Month</label>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    value={form.monthly_post_requirement}
                    onChange={e => set('monthly_post_requirement', e.target.value)}
                    placeholder="30"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={e => set('status', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
                  >
                    <option value="Active">Active</option>
                    <option value="On Hold">On Hold</option>
                    <option value="Churned">Churned</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Discord</label>
                  <input
                    type="text"
                    value={form.discord_name}
                    onChange={e => set('discord_name', e.target.value)}
                    placeholder="username"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Notes</label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                  placeholder="Any notes about this creator…"
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C] resize-none"
                />
              </div>
            </div>
          ) : (
            /* ── VIEW MODE ── */
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Retainer</p>
                  <p className="text-base font-bold text-[#1A1B3A]">
                    {creator.retainer && creator.retainer > 0 ? fmt(creator.retainer) : '—'}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Posts/Mo</p>
                  <p className="text-base font-bold text-[#1A1B3A]">{creator.monthly_post_requirement || 30}</p>
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
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Revenue by store</p>
                    <div className="space-y-1.5">
                      {entries.map(([slug, gmv]) => {
                        const pct = total > 0 ? Math.round((gmv / total) * 100) : 0;
                        const color = brandMeta.color(slug);
                        return (
                          <div key={slug} className="flex items-center gap-3 text-sm">
                            <span
                              className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <span className="text-gray-700 flex-1 truncate">
                              {brandMeta.label(slug)}
                            </span>
                            <span className="text-[#1A1B3A] font-semibold tabular-nums">{fmt(gmv)}</span>
                            <span className="text-xs text-gray-400 w-9 text-right tabular-nums">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Status</p>
                <StatusBadge status={creator.status} />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">TikTok Accounts</p>
                <div className="space-y-1">
                  {creator.handles && creator.handles.length > 0
                    ? creator.handles.map((h) => (
                      <a
                        key={h}
                        href={`https://tiktok.com/@${h}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-sm text-[#E91E8C] hover:underline"
                      >
                        @{h}
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </a>
                    ))
                    : <span className="text-sm text-gray-400">—</span>}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Discord</p>
                <div className="flex items-center gap-2">
                  {creator.discord_avatar && (
                    <img
                      src={creator.discord_avatar}
                      alt=""
                      className="h-7 w-7 rounded-full ring-2 ring-gray-100"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  <span className="text-sm text-gray-700">{creator.discord_name || '—'}</span>
                </div>
              </div>

              {creator.notes && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Notes</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{creator.notes}</p>
                </div>
              )}

              {creator.created_at && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Joined</p>
                  <span className="text-sm text-gray-500">
                    {new Date(creator.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              )}

              {primaryHandle(creator) && (
                <Link
                  href={`/creators/${encodeURIComponent(primaryHandle(creator)!)}`}
                  className="flex items-center justify-center gap-2 w-full mt-2 px-4 py-3 rounded-xl bg-[#E91E8C] text-white text-sm font-semibold hover:bg-[#d1177d] transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  View Full Profile
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface AddCreatorModalProps {
  prefill?: { account_1?: string; brand?: string };
  onClose: () => void;
  onSuccess: () => void;
}

function AddCreatorModal({ prefill, onClose, onSuccess }: AddCreatorModalProps) {
  const { brands: brandOptions } = useBrandList();
  const [form, setForm] = useState({
    real_name: '', brand: prefill?.brand || '',
    retainer: '', monthly_post_requirement: '30', discord_name: '', notes: '',
  });
  const [handles, setHandles] = useState<string[]>([prefill?.account_1 || '']);
  const [productTags, setProductTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const setHandleAt = (i: number, v: string) =>
    setHandles((h) => h.map((x, idx) => (idx === i ? v.trim().replace(/^@/, '') : x)));
  const addHandle = () => setHandles((h) => [...h, '']);
  const removeHandle = (i: number) =>
    setHandles((h) => (h.length === 1 ? [''] : h.filter((_, idx) => idx !== i)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanHandles = Array.from(new Set(
      handles.map((h) => h.trim().replace(/^@/, '')).filter(Boolean),
    ));
    if (!form.real_name && cleanHandles.length === 0) {
      setError('Name or at least one TikTok handle is required.');
      return;
    }
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
          monthly_post_requirement: parseInt(form.monthly_post_requirement) || 30,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to add creator');
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
      <div
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl mx-4 max-h-[90vh] overflow-y-auto pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-base font-bold text-[#1A1B3A]">Add Creator</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Real Name</label>
            <input
              type="text"
              placeholder="e.g. Jane Smith"
              value={form.real_name}
              onChange={(e) => set('real_name', e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
            />
          </div>

          {/* Unlimited TikTok handles — persists to tiktok_accounts on save. */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">TikTok Handles</label>
            <div className="space-y-2">
              {handles.map((h, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-4 shrink-0">{idx + 1}</span>
                  <input
                    type="text"
                    placeholder={idx === 0 ? '@primary_handle' : '@additional_handle'}
                    value={h}
                    onChange={(e) => setHandleAt(idx, e.target.value)}
                    className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
                  />
                  {(handles.length > 1 || h !== '') && (
                    <button
                      type="button"
                      onClick={() => removeHandle(idx)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
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
                className="inline-flex items-center gap-1 text-xs font-medium text-[#E91E8C] hover:underline mt-1"
              >
                <Plus className="h-3.5 w-3.5" /> Add another handle
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Brand</label>
            <select
              value={form.brand}
              onChange={(e) => set('brand', e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
            >
              <option value="">Select brand...</option>
              {brandOptions.map(b => (
                <option key={b.slug} value={b.slug}>{b.name}</option>
              ))}
            </select>
          </div>

          {form.brand && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Products <span className="font-normal text-gray-400 normal-case">(optional)</span>
              </label>
              <ProductTagPicker brand={form.brand} value={productTags} onChange={setProductTags} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Monthly Retainer ($)</label>
              <input
                type="number"
                min="0"
                step="50"
                placeholder="0"
                value={form.retainer}
                onChange={(e) => set('retainer', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Posts / Month</label>
              <input
                type="number"
                min="1"
                max="200"
                placeholder="30"
                value={form.monthly_post_requirement}
                onChange={(e) => set('monthly_post_requirement', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Discord Username</label>
            <input
              type="text"
              placeholder="e.g. janedoe#1234"
              value={form.discord_name}
              onChange={(e) => set('discord_name', e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Notes</label>
            <textarea
              rows={2}
              placeholder="Any notes about this creator..."
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C] resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#E91E8C] text-white text-sm font-semibold hover:bg-[#d1177d] disabled:opacity-60 transition-colors"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Adding...' : 'Add Creator'}
            </button>
          </div>
        </form>
      </div>
      </div>
    </ModalOverlay>
  );
}

// ─── (Removed) AllCreatorsTab ─────────────────────────────────────────────
// Merged into the Managed Roster tab. Unmanaged candidates now surface inline
// via the ?include=all toggle on /api/roster (see get_unmanaged_top_perf RPC).
// The action cell renders "+ Add to roster" for unmanaged rows.

function RosterContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const brand = searchParams.get('brand') || 'all';
  const showBrandColumn = brand === 'all';
  const { brands: brandOptions } = useBrandList();
  const brandMeta = useBrandMeta();

  const setBrand = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'all') params.delete('brand');
    else params.set('brand', next);
    const qs = params.toString();
    router.push(qs ? `?${qs}` : '?');
  };

  // All / Managed / Unmanaged view. Managed is the default; the page doubles
  // as a full reference when switched to All or Unmanaged.
  type View = 'managed' | 'all' | 'unmanaged';
  const [view, setView] = useState<View>('managed');
  const [productFilter, setProductFilter] = useState('');
  const showManagedTag = view !== 'managed';
  const showAddAction = view !== 'managed';

  const [roster, setRoster] = useState<Creator[]>([]);
  const [total, setTotal] = useState(0);
  const [totalGmvPeriod, setTotalGmvPeriod] = useState(0);
  const [totalRetainer, setTotalRetainer] = useState(0);
  const [loading, setLoading] = useState(true);
  // Gate the load bar behind a short delay so it doesn't flash on the now-fast
  // (~0.3s) loads — it only appears when a fetch genuinely drags.
  const showLoadBar = useDelayedFlag(loading);

  // Period selector drives the GMV column, ROI, Posts, and the top Total GMV.
  // The Total Retainers figure is the fixed monthly commitment (not period-driven).
  const [preset, setPreset] = useState<DatePreset>('last7');
  const [customStart, setCustomStart] = useState<string | null>(null);
  const [customEnd, setCustomEnd] = useState<string | null>(null);
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
    if (sortBy === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir(col === 'real_name' ? 'asc' : 'desc'); }
  };
  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sortBy !== col) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

  // Debounce search.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchRoster = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        sort: sortBy,
        dir: sortDir,
        range: preset,
      });
      if (isCustomPeriod && customStart && customEnd) { params.set('start', customStart); params.set('end', customEnd); }
      if (brand && brand !== 'all') params.set('brand', brand);
      if (search) params.set('search', search);
      if (productFilter) params.set('product', productFilter);
      if (view !== 'managed') params.set('include', 'all');
      if (view === 'unmanaged') params.set('managed', 'unmanaged');

      const res = await fetch(`/api/roster?${params}`);
      const json = await res.json();
      setRoster(json.data || []);
      setTotal(json.total || 0);
      setTotalGmvPeriod(json.total_gmv_period ?? 0);
      setTotalRetainer(json.total_retainer ?? 0);
    } catch (err) {
      console.error('Failed to fetch roster:', err);
    } finally {
      setLoading(false);
    }
  }, [brand, view, search, productFilter, page, sortBy, sortDir, preset, customStart, customEnd, isCustomPeriod]);

  useEffect(() => { fetchRoster(); }, [fetchRoster]);

  // Export the current view (all matching rows, not just the page) to CSV/Excel.
  const [exporting, setExporting] = useState(false);
  const handleExport = useCallback(async (format: 'csv' | 'xlsx') => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ sort: sortBy, dir: sortDir, range: preset, all: '1' });
      if (isCustomPeriod && customStart && customEnd) { params.set('start', customStart); params.set('end', customEnd); }
      if (brand && brand !== 'all') params.set('brand', brand);
      if (search) params.set('search', search);
      if (productFilter) params.set('product', productFilter);
      if (view !== 'managed') params.set('include', 'all');
      if (view === 'unmanaged') params.set('managed', 'unmanaged');
      const res = await fetch(`/api/roster?${params}`);
      const json = await res.json();
      const rows = ((json.data as Creator[]) ?? []).map((c) => ({
        Name: c.real_name ?? '',
        Handles: (c.handles ?? []).join(', '),
        Brand: brandOptions.find((b) => b.slug === c.brand)?.name ?? brandMeta.label(c.brand) ?? c.brand ?? '',
        Products: (c.product_tags ?? []).map((t) => t.name).join(', '),
        Status: c.status ?? '',
        Retainer: c.retainer ?? 0,
        'Posts/mo target': c.monthly_post_requirement ?? '',
        [`Posts (${periodShort})`]: c.posts_period ?? 0,
        'Last post': c.last_post_date ?? '',
        Joined: c.joined ?? '',
        [`GMV (${periodShort})`]: Math.round(c.gmv_period ?? 0),
        ROI: c.roi_period != null ? Number(c.roi_period.toFixed(1)) : '',
      }));
      if (rows.length === 0) return;
      const stamp = new Date().toISOString().split('T')[0];
      const fname = `creators${brand && brand !== 'all' ? `_${brand}` : ''}_${stamp}`;
      if (format === 'csv') downloadCsv(`${fname}.csv`, rows);
      else void downloadXlsx(`${fname}.xlsx`, [{ name: 'Creators', rows }]);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [brand, view, search, productFilter, sortBy, sortDir, preset, customStart, customEnd, isCustomPeriod, periodShort, brandOptions, brandMeta]);

  // Reset to page 1 when scope/sort/period change.
  useEffect(() => { setPage(1); }, [brand, view, sortBy, sortDir, preset, customStart, customEnd, productFilter]);
  // Clear search + product filter + reset view scope when the brand changes.
  useEffect(() => { setSearchInput(''); setView('managed'); setProductFilter(''); }, [brand]);
  // Drop any multi-select when the scope changes (selection only applies to the
  // unmanaged candidates currently in view).
  useEffect(() => { setSelected(new Map()); }, [brand, view]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Multi-select over unmanaged candidates (All / Unmanaged views) ──
  const selectableOnPage = roster.filter((c) => !c.is_managed && primaryHandle(c));
  const allOnPageSelected = selectableOnPage.length > 0 && selectableOnPage.every((c) => selected.has(c.id));
  const someOnPageSelected = selectableOnPage.some((c) => selected.has(c.id));
  const toggleSelect = (c: Creator) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(c.id)) next.delete(c.id);
      else next.set(c.id, { handle: primaryHandle(c) ?? '', name: c.real_name });
      return next;
    });
  };
  const toggleSelectAllPage = () => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (allOnPageSelected) selectableOnPage.forEach((c) => next.delete(c.id));
      else selectableOnPage.forEach((c) => next.set(c.id, { handle: primaryHandle(c) ?? '', name: c.real_name }));
      return next;
    });
  };
  const openBulkFromSelection = () => {
    const rows: BulkRow[] = Array.from(selected.values())
      .filter((s) => s.handle)
      .map((s) => ({ handle: s.handle, name: s.name ?? undefined }));
    setBulkInitialRows(rows);
    setBulkOpen(true);
  };

  // Total column count for skeleton rows. The select + action columns both
  // appear only in the non-managed views (showAddAction).
  const cols = 2 + (showBrandColumn ? 1 : 0) + (showManagedTag ? 1 : 0) + 6 + (showAddAction ? 2 : 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1B3A]">Creators</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            A reference for who&apos;s posting and whether they&apos;re worth the cost.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => { setBulkInitialRows(null); setBulkOpen(true); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:text-[#1A1B3A] transition-colors shadow-sm"
          >
            <Upload className="h-4 w-4" />
            Bulk add
          </button>
          <button
            onClick={() => setAddModalPrefill({})}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#E91E8C] text-sm font-semibold text-white hover:bg-[#d1177d] transition-colors shadow-sm"
          >
            <UserPlus className="h-4 w-4" />
            Add Creator
          </button>
        </div>
      </div>

      {/* Summary banner: brand + period selectors, total GMV, total retainers */}
      <div className="rounded-2xl bg-gradient-to-br from-[#1A1B3A] to-[#2A2D5A] text-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BrandSelect value={brand} options={brandOptions} onChange={setBrand} />
          <PeriodSelector
            preset={preset}
            customStart={customStart}
            customEnd={customEnd}
            onPreset={(p) => { setPreset(p); setCustomStart(null); setCustomEnd(null); }}
            onCustom={(s, e) => { setPreset('custom'); setCustomStart(s); setCustomEnd(e); }}
          />
        </div>
        <div className="flex flex-wrap items-end gap-x-12 gap-y-4 mt-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/55">
              Total GMV · {periodLabel}
            </p>
            <p className="text-3xl font-extrabold mt-1 tabular-nums">
              {loading ? '…' : fmt(totalGmvPeriod)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/55">
              Total retainers · this month
            </p>
            <p className="text-2xl font-bold mt-1 tabular-nums text-white/90">
              {loading ? '…' : fmt(totalRetainer)}
            </p>
          </div>
        </div>
      </div>

      {/* Filter row: All / Managed / Unmanaged + search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex rounded-xl border border-gray-200 overflow-hidden text-sm font-semibold self-start">
          {([
            { key: 'all' as const,       label: 'All Creators' },
            { key: 'managed' as const,   label: 'Managed' },
            { key: 'unmanaged' as const, label: 'Unmanaged' },
          ]).map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`px-4 py-2 transition-colors ${
                view === v.key ? 'bg-[#E91E8C] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or handle…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
          />
        </div>
        <ProductFilterSelect brand={brand} value={productFilter} onChange={setProductFilter} />
        <div className="flex items-center gap-2 self-start">
          <button
            onClick={() => handleExport('csv')}
            disabled={exporting || roster.length === 0}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 disabled:opacity-40 transition-colors"
            title="Export the current view to CSV"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} CSV
          </button>
          <button
            onClick={() => handleExport('xlsx')}
            disabled={exporting || roster.length === 0}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 disabled:opacity-40 transition-colors"
            title="Export the current view to Excel"
          >
            <FileDown className="h-4 w-4" /> Excel
          </button>
        </div>
      </div>

      {/* Multi-select action bar — appears once candidates are checked */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-pink-200 bg-pink-50 px-4 py-2.5">
          <span className="text-sm font-semibold text-[#1A1B3A]">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(new Map())}
              className="text-xs font-semibold text-gray-500 hover:text-gray-700 px-2.5 py-1.5"
            >
              Clear
            </button>
            <button
              onClick={openBulkFromSelection}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#E91E8C] text-sm font-semibold text-white hover:bg-[#d1177d] transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add {selected.size} to roster
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {!loading && roster.length === 0 ? (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-16 text-center">
          <Users className="h-8 w-8 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm font-medium">No creators found</p>
          {search && <p className="text-gray-400 text-xs mt-1">Try a different search.</p>}
        </div>
      ) : (
        <div className="relative rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          {/* Indeterminate load bar — shows on first load AND every refetch
              (brand / period / sort / page change), even with rows on screen.
              Gated by showLoadBar (150ms delay) so fast loads don't flash it. */}
          <TableLoadBar active={showLoadBar} />
          <div className={`overflow-x-auto transition-opacity duration-200 ${showLoadBar && roster.length > 0 ? 'opacity-60' : 'opacity-100'}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  {showAddAction && (
                    <th className="w-10 px-5 py-3.5">
                      <input
                        type="checkbox"
                        aria-label="Select all unmanaged on this page"
                        className="h-4 w-4 rounded border-gray-300 text-[#E91E8C] focus:ring-[#E91E8C]/40 cursor-pointer accent-[#E91E8C]"
                        checked={allOnPageSelected}
                        ref={(el) => { if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected; }}
                        disabled={selectableOnPage.length === 0}
                        onChange={toggleSelectAllPage}
                      />
                    </th>
                  )}
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                    <button onClick={() => toggleSort('real_name')} className="inline-flex items-center gap-1.5 hover:text-gray-700 transition-colors">
                      Name <SortIcon col="real_name" />
                    </button>
                  </th>
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Handle</th>
                  {showBrandColumn && <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Brand</th>}
                  {showManagedTag && <th className="text-center px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Managed</th>}
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                    <button onClick={() => toggleSort('retainer')} className="inline-flex items-center gap-1.5 hover:text-gray-700 transition-colors">
                      Retainer <SortIcon col="retainer" />
                    </button>
                  </th>
                  <th className="text-center px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                    <button onClick={() => toggleSort('posts_period')} className="inline-flex items-center gap-1.5 hover:text-gray-700 transition-colors mx-auto">
                      Posts ({periodShort}) <SortIcon col="posts_period" />
                    </button>
                  </th>
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                    <button onClick={() => toggleSort('last_post_date')} className="inline-flex items-center gap-1.5 hover:text-gray-700 transition-colors">
                      Last post <SortIcon col="last_post_date" />
                    </button>
                  </th>
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                    <button onClick={() => toggleSort('joined')} className="inline-flex items-center gap-1.5 hover:text-gray-700 transition-colors">
                      Joined <SortIcon col="joined" />
                    </button>
                  </th>
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                    <button onClick={() => toggleSort('gmv_period')} className="inline-flex items-center gap-1.5 hover:text-gray-700 transition-colors">
                      GMV ({periodShort}) <SortIcon col="gmv_period" />
                    </button>
                  </th>
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                    <button onClick={() => toggleSort('roi_period')} className="inline-flex items-center gap-1.5 hover:text-gray-700 transition-colors">
                      ROI <SortIcon col="roi_period" />
                    </button>
                  </th>
                  {showAddAction && <th className="px-5 py-3.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading && roster.length === 0 && Array.from({ length: 8 }).map((_, i) => (
                  <SkeletonRow key={i} cols={cols} />
                ))}
                {!loading && roster.map((c) => {
                  const primary = primaryHandle(c);
                  return (
                    <tr
                      key={c.id}
                      className={`transition-colors cursor-pointer ${c.is_managed ? 'hover:bg-pink-50/20' : 'bg-slate-50/40 hover:bg-slate-100/50'}`}
                      onClick={() => {
                        if (c.is_managed) setSelectedCreator(c);
                        else setAddModalPrefill({ account_1: primary ?? '', brand: c.brand ?? '' });
                      }}
                    >
                      {showAddAction && (
                        <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                          {!c.is_managed && primary && (
                            <input
                              type="checkbox"
                              aria-label={`Select @${primary}`}
                              className="h-4 w-4 rounded border-gray-300 text-[#E91E8C] focus:ring-[#E91E8C]/40 cursor-pointer accent-[#E91E8C]"
                              checked={selected.has(c.id)}
                              onChange={() => toggleSelect(c)}
                            />
                          )}
                        </td>
                      )}
                      <td className="px-5 py-3.5 font-medium text-[#1A1B3A]">
                        {c.real_name || (c.is_managed
                          ? <span className="text-gray-400">—</span>
                          : <span className="text-gray-500 italic">@{primary}</span>)}
                        {(c.product_tags ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(c.product_tags ?? []).slice(0, 3).map((t) => (
                              <span key={t.key} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-pink-50 text-[#E91E8C]">
                                {t.name}
                              </span>
                            ))}
                            {(c.product_tags ?? []).length > 3 && (
                              <span className="text-[10px] text-gray-400 self-center">+{(c.product_tags ?? []).length - 3}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {primary ? (
                          <span className="flex items-center">
                            <a
                              href={`https://tiktok.com/@${primary}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#E91E8C] hover:underline font-medium"
                              onClick={(e) => e.stopPropagation()}
                            >
                              @{primary}
                            </a>
                            <ExtraAccountsBadge creator={c} />
                          </span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      {showBrandColumn && (
                        <td className="px-5 py-3.5">
                          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                            {brandOptions.find(b => b.slug === c.brand)?.name || brandMeta.label(c.brand) || c.brand?.replace(/_/g, ' ') || '—'}
                          </span>
                        </td>
                      )}
                      {showManagedTag && (
                        <td className="px-5 py-3.5 text-center">
                          {c.is_managed ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-600">
                              <UserCheck className="h-3 w-3" /> Managed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
                              <UserX className="h-3 w-3" /> Unmanaged
                            </span>
                          )}
                        </td>
                      )}
                      <td className="px-5 py-3.5 text-right font-semibold text-[#1A1B3A]">
                        {(c.retainer || 0) > 0 ? fmt(c.retainer!) : <span className="text-gray-300 font-normal">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-center tabular-nums text-gray-700">
                        {c.posts_period || 0}
                      </td>
                      <td className="px-5 py-3.5"><LastPostCell date={c.last_post_date} /></td>
                      <td className="px-5 py-3.5"><JoinDateCell date={c.joined} /></td>
                      <td className="px-5 py-3.5 text-right tabular-nums">
                        {(c.gmv_period || 0) > 0
                          ? <span className="text-[#1A1B3A] font-semibold">{fmt(c.gmv_period)}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right"><RoiCell roi={c.roi_period} /></td>
                      {showAddAction && (
                        <td className="px-5 py-3.5 text-right">
                          {!c.is_managed && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setAddModalPrefill({ account_1: primary ?? '', brand: c.brand ?? '' }); }}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-pink-200 bg-pink-50 text-[#E91E8C] hover:bg-pink-100 transition-colors whitespace-nowrap"
                            >
                              <Plus className="h-3 w-3" /> Add to roster
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 bg-gray-50/40">
            <p className="text-xs text-gray-400">{total.toLocaleString()} total · page {page} of {totalPages}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Creator detail / edit panel */}
      {selectedCreator && (
        <CreatorPanel
          key={selectedCreator.id}
          creator={selectedCreator}
          onClose={() => setSelectedCreator(null)}
          onSaved={(updated) => {
            setRoster(prev => prev.map(c => (c.id === updated.id ? updated : c)));
            setSelectedCreator(updated);
            fetchRoster();
          }}
          onRemoved={(removedId) => {
            setRoster(prev => prev.filter(c => c.id !== removedId));
            setSelectedCreator(null);
            fetchRoster();
          }}
        />
      )}

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
  );
}

export default function RosterPage() {
  return (
    <Suspense fallback={
      <div className="p-16 flex items-center justify-center">
        <Loader2 className="h-6 w-6 text-gray-300 animate-spin" />
      </div>
    }>
      <RosterContent />
    </Suspense>
  );
}
