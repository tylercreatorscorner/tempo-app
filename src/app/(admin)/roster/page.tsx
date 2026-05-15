'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  UserPlus, Search, Users, UserCheck, X,
  ChevronLeft, ChevronRight, ExternalLink, Loader2,
  UserX, Globe, Pencil, Check, Plus, Trash2, ArrowUp, ArrowDown, ArrowUpDown,
  RefreshCcw, AlertTriangle, MoonStar, TrendingDown, Download,
} from 'lucide-react';
import Link from 'next/link';
import { BRAND_DISPLAY_NAMES, BRAND_COLORS } from '@/lib/utils/constants';
import { useBrandList } from '@/hooks/use-brand-list';
import { RenewalsTab } from '@/components/roster/renewals-tab';

const PAGE_SIZE = 50;

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
  // Calendar-month — independent of the period selector.
  posts_this_month: number;
  last_post_date: string | null;
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
}

function getExtraAccounts(c: Creator): string[] {
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

function HealthBadge({ health }: { health: CreatorHealth }) {
  const STYLE: Record<CreatorHealth, { label: string; cls: string }> = {
    healthy: { label: 'Healthy', cls: 'bg-green-50 text-green-700 border-green-100' },
    behind:  { label: 'Behind',  cls: 'bg-orange-50 text-orange-700 border-orange-100' },
    silent:  { label: 'Silent',  cls: 'bg-red-50 text-red-700 border-red-100' },
    churned: { label: 'Churned', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
    no_data: { label: '—',       cls: 'text-gray-300 border-transparent' },
  };
  const { label, cls } = STYLE[health];
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}

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

function PostsProgressCell({ posts, target }: { posts: number; target: number }) {
  if (!target) return <span className="text-xs text-gray-400">{posts || 0}</span>;
  const pct = Math.min(1, posts / target);
  // Pace expected at this point in the month — 10% slack.
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const expected = now.getDate() / lastDay;
  const behind = pct < expected - 0.1;
  const colorClass = behind ? 'text-orange-600 font-semibold' : posts >= target ? 'text-green-600 font-semibold' : 'text-gray-700';
  const barColor = behind ? 'bg-orange-400' : posts >= target ? 'bg-green-400' : 'bg-gray-300';
  return (
    <div className="inline-flex flex-col items-center gap-0.5 min-w-[56px]">
      <span className={`text-xs tabular-nums ${colorClass}`}>{posts}<span className="text-gray-300"> / {target}</span></span>
      <div className="w-12 h-1 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: `${Math.round(pct * 100)}%` }} />
      </div>
    </div>
  );
}

/**
 * StoreMixIndicator — small letter badge next to the brand pill showing
 * which store(s) generated this creator's GMV in the current period.
 *
 * Today this is LeeFar-specific (two stores: Nutrition / Supplements). It's
 * shaped to extend — any future umbrella brand with multiple stores can drop
 * its store slugs into MULTI_STORE_BRANDS below and the component picks it up.
 */
const MULTI_STORE_BRANDS: Record<string, { slug: string; letter: string }[]> = {
  leefar: [
    { slug: 'leefar_nutrition',   letter: 'N' },
    { slug: 'leefar_supplements', letter: 'S' },
  ],
};

function StoreMixIndicator({ creator }: { creator: Creator }) {
  if (!creator.brand) return null;
  const stores = MULTI_STORE_BRANDS[creator.brand];
  if (!stores) return null;
  const active = stores.filter((s) => (creator.gmv_by_store?.[s.slug] ?? 0) > 0);
  if (active.length === 0) return null;
  const label = active.map((s) => s.letter).join('+');
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-500"
      title={`Revenue from: ${active.map((s) => BRAND_DISPLAY_NAMES[s.slug] ?? s.slug).join(', ')}`}
    >
      {label}
    </span>
  );
}

// Brand pill. Solid-fill in the brand color when active, soft chip when not.
// All Brands ("all") gets a neutral treatment.
function BrandPill({
  slug, label, color, active, onClick,
}: {
  slug: string;
  label: string;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  const isAll = slug === 'all';
  if (active) {
    return (
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white shadow-sm"
        style={{ backgroundColor: isAll ? '#1A1B3A' : (color ?? '#6B7280') }}
      >
        {label}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
    >
      {!isAll && (
        <span
          className="h-2 w-2 rounded-full inline-block"
          style={{ backgroundColor: color ?? '#6B7280' }}
        />
      )}
      {label}
    </button>
  );
}

// Action-oriented stat card. Clickable cards toggle a health filter on the
// table; the active card gets a colored ring so the user always knows what
// the table is filtered to.
function StatCard({
  icon, label, value, hint, tone = 'gray', active = false, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: 'gray' | 'orange' | 'red' | 'purple';
  active?: boolean;
  onClick?: () => void;
}) {
  const TONE_RING: Record<string, string> = {
    gray:   'ring-gray-200',
    orange: 'ring-orange-300',
    red:    'ring-red-300',
    purple: 'ring-purple-300',
  };
  const TONE_VALUE: Record<string, string> = {
    gray:   'text-[#1A1B3A]',
    orange: 'text-orange-600',
    red:    'text-red-600',
    purple: 'text-purple-600',
  };
  const ringCls = active ? `ring-2 ${TONE_RING[tone]}` : 'ring-0';
  const interactive = !!onClick;
  const Wrapper = interactive ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={`text-left rounded-2xl bg-white border border-gray-100 shadow-sm p-5 transition-all ${ringCls} ${interactive ? 'cursor-pointer hover:border-gray-200 hover:shadow' : ''}`}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      </div>
      <p className={`text-2xl font-extrabold ${TONE_VALUE[tone]}`}>{value}</p>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </Wrapper>
  );
}

// "Last DM" cell. Shows relative time + a red unread badge when there are
// unanswered inbound messages. Renders an em-dash when the creator has no
// linked discord identity yet OR has never been contacted.
function LastDmCell({ at, unread }: { at: string | null; unread: number }) {
  if (!at) {
    if (unread > 0) {
      // Edge case: unread without timestamp — still surface the unread badge.
      return (
        <span className="inline-flex items-center gap-1.5 text-xs">
          <span className="text-gray-300">—</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white">
            {unread}
          </span>
        </span>
      );
    }
    return <span className="text-gray-300">—</span>;
  }
  const ms = Date.now() - new Date(at).getTime();
  const days = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const label =
    hours < 1 ? 'just now'
    : hours < 24 ? `${hours}h ago`
    : days === 1 ? '1d ago'
    : days < 30 ? `${days}d ago`
    : days < 365 ? `${Math.floor(days / 30)}mo ago`
    : `${Math.floor(days / 365)}y ago`;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 tabular-nums">
      {label}
      {unread > 0 && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white" title={`${unread} unread inbound`}>
          {unread}
        </span>
      )}
    </span>
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
  const extras = getExtraAccounts(creator);
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

const ACCOUNT_KEYS = ['account_1', 'account_2', 'account_3', 'account_4', 'account_5'] as const;

// ─── Skeleton loaders ─────────────────────────────────────────────────────────
function SkeletonStatCard() {
  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-4 w-4 rounded bg-gray-200 animate-pulse" />
        <div className="h-3 w-24 rounded bg-gray-200 animate-pulse" />
      </div>
      <div className="h-7 w-20 rounded bg-gray-200 animate-pulse" />
    </div>
  );
}

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

  // Edit form state — mirrors the Creator interface fields we allow editing
  const [form, setForm] = useState({
    real_name:               creator.real_name || '',
    brand:                   creator.brand || '',
    status:                  creator.status || 'Active',
    retainer:                String(creator.retainer ?? ''),
    monthly_post_requirement: String(creator.monthly_post_requirement ?? 30),
    discord_name:            creator.discord_name || '',
    notes:                   creator.notes || '',
    account_1:               creator.account_1 || '',
    account_2:               creator.account_2 || '',
    account_3:               creator.account_3 || '',
    account_4:               creator.account_4 || '',
    account_5:               creator.account_5 || '',
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`/api/roster/${creator.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
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
    // Reset form to original values
    setForm({
      real_name:               creator.real_name || '',
      brand:                   creator.brand || '',
      status:                  creator.status || 'Active',
      retainer:                String(creator.retainer ?? ''),
      monthly_post_requirement: String(creator.monthly_post_requirement ?? 30),
      discord_name:            creator.discord_name || '',
      notes:                   creator.notes || '',
      account_1:               creator.account_1 || '',
      account_2:               creator.account_2 || '',
      account_3:               creator.account_3 || '',
      account_4:               creator.account_4 || '',
      account_5:               creator.account_5 || '',
    });
    setSaveError('');
    setEditing(false);
    setVisibleSlots(initialSlots);
  };

  // Track how many handle slots are visible — starts at however many are already populated
  const initialSlots = Math.max(1, ACCOUNT_KEYS.filter(k => !!creator[k as keyof Creator]).length);
  const [visibleSlots, setVisibleSlots] = useState(initialSlots);

  const displayName = creator.real_name || creator.account_1 || 'Creator';

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
  // container. The useEffect adds an explicit body overflow lock for the
  // panel's lifetime.
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => { setPortalReady(true); }, []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

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
                {brandOptions.find(b => b.slug === creator.brand)?.name || BRAND_DISPLAY_NAMES[creator.brand] || creator.brand}
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
                  Remove {creator.real_name || creator.account_1 || 'this creator'}?
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

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">TikTok Accounts</label>
                <div className="space-y-2">
                  {ACCOUNT_KEYS.slice(0, visibleSlots).map((key, idx) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-4 shrink-0">{idx + 1}</span>
                      <input
                        type="text"
                        value={form[key]}
                        onChange={e => set(key, e.target.value)}
                        placeholder={idx === 0 ? 'primary handle' : 'additional handle'}
                        className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
                      />
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() => { set(key, ''); setVisibleSlots(s => s - 1); }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
                          title="Remove handle"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {idx === visibleSlots - 1 && visibleSlots < 5 && (
                        <button
                          type="button"
                          onClick={() => setVisibleSlots(s => s + 1)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
                          title="Add another handle"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
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
                        const color = BRAND_COLORS[slug] ?? '#94a3b8';
                        return (
                          <div key={slug} className="flex items-center gap-3 text-sm">
                            <span
                              className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <span className="text-gray-700 flex-1 truncate">
                              {BRAND_DISPLAY_NAMES[slug] ?? slug}
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
                  {[creator.account_1, ...getExtraAccounts(creator)].filter(Boolean).length > 0
                    ? [creator.account_1, ...getExtraAccounts(creator)].filter(Boolean).map((h) => (
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

              {creator.account_1 && (
                <Link
                  href={`/creators/${encodeURIComponent(creator.account_1)}`}
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
    real_name: '', account_1: prefill?.account_1 || '', brand: prefill?.brand || '',
    retainer: '', monthly_post_requirement: '30', discord_name: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.real_name && !form.account_1) {
      setError('Name or TikTok handle is required.');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <div
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-[#1A1B3A]">Add Creator</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
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
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">TikTok Handle</label>
              <input
                type="text"
                placeholder="@handle"
                value={form.account_1}
                onChange={(e) => set('account_1', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
              />
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
  );
}

// ─── (Removed) AllCreatorsTab ─────────────────────────────────────────────
// Merged into the Managed Roster tab. Unmanaged candidates now surface inline
// via the ?include=all toggle on /api/roster (see get_unmanaged_top_perf RPC).
// The action cell renders "+ Add to roster" for unmanaged rows.

// ─── Managed Roster Tab ───────────────────────────────────────────────────────

function RosterContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const brand = searchParams.get('brand') || 'all';
  const showBrandColumn = brand === 'all';
  const { brands: brandOptions } = useBrandList();

  // Update the ?brand= URL param. Pills below + the global sidebar selector
  // both write through this so they stay in sync.
  const setBrand = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'all') params.delete('brand');
    else params.set('brand', next);
    const qs = params.toString();
    router.push(qs ? `?${qs}` : '?');
  };

  const [activeTab, setActiveTab] = useState<'roster' | 'renewals'>('roster');
  // ?include=all toggle — when on, the Roster table also surfaces unmanaged
  // creators (top-N by 30d GMV, deduped against managed handles), so you can
  // sort them alongside your managed roster and identify recruitment targets
  // without leaving the page.
  const [includeUnmanaged, setIncludeUnmanaged] = useState(false);
  const [roster, setRoster] = useState<Creator[]>([]);
  const [total, setTotal] = useState(0);
  // Action-oriented aggregates (drive the new stat cards)
  const [behindCount, setBehindCount]   = useState(0);
  const [silentCount, setSilentCount]   = useState(0);
  const [healthyCount, setHealthyCount] = useState(0);
  const [lowRoiCount, setLowRoiCount]   = useState(0);
  const [unreadDms, setUnreadDms]       = useState(0);
  const [totalGmvPeriod, setTotalGmvPeriod] = useState(0);

  // ── Period selector ──
  // Days back for GMV / ROI / total. Health and posts-this-month are NOT
  // driven by this (those are calendar-month / contract-based).
  // YTD is computed at fetch time so it tracks the calendar year.
  type PeriodKey = '1d' | '7d' | '30d' | '90d' | 'ytd';
  const [periodKey, setPeriodKey] = useState<PeriodKey>('30d');
  const periodDays = (() => {
    if (periodKey === '1d')  return 1;
    if (periodKey === '7d')  return 7;
    if (periodKey === '30d') return 30;
    if (periodKey === '90d') return 90;
    // YTD: number of days from Jan 1 of current year (inclusive of today).
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    return Math.max(1, Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  })();
  const periodLabel = (() => {
    switch (periodKey) {
      case '1d':  return 'Yesterday';
      case '7d':  return 'Last 7 days';
      case '30d': return 'Last 30 days';
      case '90d': return 'Last 90 days';
      case 'ytd': return 'Year to date';
    }
  })();

  // ── Store sub-filter (only meaningful when brand=leefar) ──
  type StoreFilter = null | 'leefar_nutrition' | 'leefar_supplements';
  const [storeFilter, setStoreFilter] = useState<StoreFilter>(null);
  // Bulk-action selection. Holds managed_creators.id values across pages.
  // Cleared on filter/brand changes since the visible set has changed.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  // Total managed (count of all matching rows, regardless of health filter).
  // The /api/roster `total` field reflects the *filtered* set, so we keep a
  // separate count of the unfiltered roster for the "Total managed" card.
  const [unfilteredTotal, setUnfilteredTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  type HealthFilter = 'all' | 'behind' | 'silent' | 'low_roi' | 'healthy';
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all');
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null);
  const [page, setPage] = useState(1);
  const [addModalPrefill, setAddModalPrefill] = useState<{ account_1?: string; brand?: string } | null>(null);

  // Sort state for the Managed Roster table
  type RosterSortCol =
    | 'retainer' | 'real_name' | 'monthly_post_requirement' | 'created_at' | 'status'
    | 'gmv_period' | 'posts_this_month' | 'last_post_date' | 'health' | 'roi_period'
    | 'last_message_at' | 'unread_count';
  const [sortBy, setSortBy] = useState<RosterSortCol>('retainer');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const toggleSort = (col: RosterSortCol) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir(col === 'real_name' ? 'asc' : 'desc'); }
  };
  const SortIcon = ({ col }: { col: RosterSortCol }) => {
    if (sortBy !== col) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  // Debounce search: only fire API after 300ms of no typing
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
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
      });
      if (brand && brand !== 'all') params.set('brand', brand);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (healthFilter !== 'all') params.set('health', healthFilter);
      if (search) params.set('search', search);
      if (includeUnmanaged) params.set('include', 'all');
      params.set('period', String(periodDays));
      if (storeFilter) params.set('store', storeFilter);

      const res = await fetch(`/api/roster?${params}`);
      const json = await res.json();
      setRoster(json.data || []);
      setTotal(json.total || 0);
      setBehindCount(json.behind_count ?? 0);
      setSilentCount(json.silent_count ?? 0);
      setHealthyCount(json.healthy_count ?? 0);
      setLowRoiCount(json.low_roi_count ?? 0);
      setUnreadDms(json.unread_dms_total ?? 0);
      setTotalGmvPeriod(json.total_gmv_period ?? 0);
      // The "Total managed" card should always reflect the unfiltered managed
      // count. The API now returns `total_managed` directly (count of managed
      // rows in the unfiltered set, regardless of include=all or health filter),
      // so we just consume that.
      if (typeof json.total_managed === 'number') setUnfilteredTotal(json.total_managed);
    } catch (err) {
      console.error('Failed to fetch roster:', err);
    } finally {
      setLoading(false);
    }
  }, [brand, statusFilter, healthFilter, search, page, sortBy, sortDir, includeUnmanaged, periodDays, storeFilter]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  // Reset page + status/health filters when brand changes
  useEffect(() => {
    setPage(1);
    setStatusFilter('all');
    setHealthFilter('all');
    setIncludeUnmanaged(false);
    setSearchInput('');
    setSelectedIds(new Set());
    // Drop the store sub-filter — only meaningful for the brand we just left.
    setStoreFilter(null);
  }, [brand]);
  // Reset page when status/health/include/period/store filter or sort changes
  useEffect(() => { setPage(1); }, [statusFilter, healthFilter, sortBy, sortDir, includeUnmanaged, periodDays, storeFilter]);
  // Drop selections that have left the visible set (e.g. after a filter change).
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visibleIds = new Set(roster.map((c) => c.id));
      const next = new Set<string>();
      for (const id of prev) if (visibleIds.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [roster]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

  // ── Bulk-action helpers ───────────────────────────────────────────────
  // Both operate on `selectedIds`. CSV export is client-side only; status
  // change fires N parallel PATCH calls and refreshes the roster on
  // completion.

  const csvEscape = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const exportSelectedCsv = () => {
    const rows = roster.filter((c) => selectedIds.has(c.id));
    if (rows.length === 0) return;
    const header = [
      'Name', 'Handle', 'Brand', 'Status', 'Health',
      'Retainer', 'Posts (this month)', 'Posts target',
      'Last post', 'Last DM', `GMV (${periodLabel})`, `ROI (${periodLabel})`, 'Unread DMs',
    ];
    const body = rows.map((c) => [
      c.real_name ?? '',
      c.account_1 ?? '',
      c.brand ? (brandOptions.find(b => b.slug === c.brand)?.name ?? BRAND_DISPLAY_NAMES[c.brand] ?? c.brand) : '',
      c.status ?? '',
      c.health,
      c.retainer ?? 0,
      c.posts_this_month ?? 0,
      c.monthly_post_requirement ?? 0,
      c.last_post_date ?? '',
      c.last_message_at ?? '',
      Math.round(c.gmv_period ?? 0),
      c.roi_period !== null ? c.roi_period.toFixed(2) : '',
      c.unread_count ?? 0,
    ]);
    const csv = [header, ...body].map((r) => r.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-creators-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const bulkChangeStatus = async (newStatus: string) => {
    if (selectedIds.size === 0) return;
    setBulkUpdating(true);
    setBulkError(null);
    setBulkStatusOpen(false);
    try {
      const ids = Array.from(selectedIds);
      const results = await Promise.allSettled(
        ids.map((id) =>
          fetch(`/api/roster/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus }),
          }),
        ),
      );
      const failed = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !(r.value as Response).ok)).length;
      if (failed > 0) {
        setBulkError(`${failed} of ${ids.length} updates failed. Refresh and retry the failed rows.`);
      }
      setSelectedIds(new Set());
      fetchRoster();
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : 'Bulk update failed');
    } finally {
      setBulkUpdating(false);
    }
  };

  // Header checkbox state — derived, not stored. "Indeterminate" reflects
  // partial selection on the visible page. Bulk actions operate on
  // managed_creators IDs (PATCH /api/roster/[id]), so unmanaged rows are
  // never selectable — their `id` is a synthetic `unmanaged:<handle>` string
  // and there's nothing to PATCH.
  const visibleSelectableIds = roster.filter((c) => c.is_managed).map((c) => c.id);
  const allVisibleSelected = visibleSelectableIds.length > 0
    && visibleSelectableIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = !allVisibleSelected
    && visibleSelectableIds.some((id) => selectedIds.has(id));
  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleSelectableIds) next.delete(id);
      } else {
        for (const id of visibleSelectableIds) next.add(id);
      }
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const brandDisplayName = brand !== 'all'
    ? (brandOptions.find(b => b.slug === brand)?.name || BRAND_DISPLAY_NAMES[brand] || brand.replace(/_/g, ' '))
    : '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1B3A]">My Creators</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {brandDisplayName ? `${brandDisplayName} · ` : ''}Your managed talent roster
          </p>
        </div>
        <button
          onClick={() => setAddModalPrefill({})}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#E91E8C] text-sm font-semibold text-white hover:bg-[#d1177d] transition-colors shadow-sm"
        >
          <UserPlus className="h-4 w-4" />
          Add Creator
        </button>
      </div>

      {/* Brand pill row — quick filter, mirrors the ?brand= URL param.
          Lets the manager scan brand-by-brand health in one click rather
          than going through the global sidebar dropdown each time. */}
      <div className="flex flex-wrap gap-2 items-center">
        <BrandPill
          slug="all"
          label="All brands"
          active={brand === 'all'}
          onClick={() => setBrand('all')}
        />
        {brandOptions.map((b) => (
          <BrandPill
            key={b.slug}
            slug={b.slug}
            label={b.name}
            color={b.color}
            active={brand === b.slug}
            onClick={() => setBrand(b.slug)}
          />
        ))}
      </div>

      {/* LeeFar store sub-filter — only visible when LeeFar is the active brand.
          The umbrella aggregates revenue across both stores; this lets a
          manager drill down to "creators primarily selling Nutrition" or
          "Supplements" specifically. */}
      {brand === 'leefar' && (
        <div className="flex flex-wrap gap-2 items-center text-xs">
          <span className="text-gray-400 font-medium uppercase tracking-wider">Store:</span>
          {([
            { val: null,                   label: 'Both stores' },
            { val: 'leefar_nutrition' as const,  label: 'Nutrition only' },
            { val: 'leefar_supplements' as const, label: 'Supplements only' },
          ]).map((opt) => {
            const active = storeFilter === opt.val;
            return (
              <button
                key={opt.label}
                onClick={() => setStoreFilter(opt.val)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  active
                    ? 'bg-[#1A1B3A] text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Tab toggle — Roster | Renewals (the old "All Creators" tab is now an
          inline toggle on the Roster table itself, so unmanaged candidates can
          be sorted and compared alongside managed creators rather than living
          in their own siloed view). */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('roster')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            activeTab === 'roster' ? 'bg-white text-[#1A1B3A] shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <UserCheck className="h-4 w-4" /> Managed Roster
        </button>
        <button
          onClick={() => setActiveTab('renewals')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            activeTab === 'renewals' ? 'bg-white text-[#1A1B3A] shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <RefreshCcw className="h-4 w-4" /> Renewals
        </button>
      </div>

      {/* Renewals tab */}
      {activeTab === 'renewals' && (
        <RenewalsTab brand={brand && brand !== 'all' ? brand : null} />
      )}

      {/* Managed Roster tab content */}
      {activeTab === 'roster' && (<>
      {/* ── Total GMV banner + period selector ──
          The headline number on the page: how much GMV did this roster
          generate in the selected period? Period selector controls GMV
          column / ROI column / this banner. Health, posts, last-post are
          intentionally NOT period-driven (they're monthly contract signals). */}
      <div className="rounded-2xl bg-gradient-to-br from-[#1A1B3A] to-[#2A2D5A] text-white p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/60">
            GMV · {periodLabel}{brand && brand !== 'all' ? ` · ${brandOptions.find(b => b.slug === brand)?.name || BRAND_DISPLAY_NAMES[brand] || brand}` : ''}
          </p>
          <p className="text-3xl font-extrabold mt-1 tabular-nums">
            {loading ? '…' : fmt(totalGmvPeriod)}
          </p>
        </div>
        {/* Period selector — segmented control */}
        <div className="flex gap-1 p-1 bg-white/10 rounded-xl">
          {([
            { key: '1d' as const,  label: 'Yesterday' },
            { key: '7d' as const,  label: '7d' },
            { key: '30d' as const, label: '30d' },
            { key: '90d' as const, label: '90d' },
            { key: 'ytd' as const, label: 'YTD' },
          ]).map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriodKey(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                periodKey === p.key
                  ? 'bg-white text-[#1A1B3A] shadow'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Action-oriented stat cards ──
          Each card except "Total managed" toggles a health filter on click,
          turning the cards into a triage strip. When a card is active,
          it gets a colored ring + the underlying table is filtered to that
          health cohort. Re-clicking the active card clears the filter. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading && roster.length === 0 ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)
        ) : (
          <>
            <StatCard
              icon={<Users className="h-4 w-4 text-gray-400" />}
              label="Total managed"
              value={(unfilteredTotal || total).toLocaleString()}
              hint="creators on your roster"
            />
            <StatCard
              icon={<TrendingDown className="h-4 w-4 text-orange-500" />}
              label="Behind quota"
              value={behindCount.toLocaleString()}
              hint="below pace this month"
              tone="orange"
              active={healthFilter === 'behind'}
              onClick={() => setHealthFilter(healthFilter === 'behind' ? 'all' : 'behind')}
            />
            <StatCard
              icon={<MoonStar className="h-4 w-4 text-red-500" />}
              label="Silent 14d+"
              value={silentCount.toLocaleString()}
              hint="no post in 2 weeks"
              tone="red"
              active={healthFilter === 'silent'}
              onClick={() => setHealthFilter(healthFilter === 'silent' ? 'all' : 'silent')}
            />
            <StatCard
              icon={<AlertTriangle className="h-4 w-4 text-purple-500" />}
              label="ROI < 1.0×"
              value={lowRoiCount.toLocaleString()}
              hint="GMV(30d) < retainer"
              tone="purple"
              active={healthFilter === 'low_roi'}
              onClick={() => setHealthFilter(healthFilter === 'low_roi' ? 'all' : 'low_roi')}
            />
          </>
        )}
      </div>
      {/* Healthy count is shown as a small status row when no filter active —
          gives the manager a positive baseline without taking up a card slot. */}
      {healthFilter === 'all' && !loading && (unfilteredTotal || total) > 0 && (
        <p className="text-xs text-gray-400 -mt-2">
          <span className="text-green-600 font-semibold">{healthyCount.toLocaleString()}</span>{' '}
          healthy of {(unfilteredTotal || total).toLocaleString()} managed
          {unreadDms > 0 && (
            <>
              {' · '}
              <span className="text-red-600 font-semibold">{unreadDms.toLocaleString()}</span>{' '}
              unread inbound DM{unreadDms === 1 ? '' : 's'}
            </>
          )}
        </p>
      )}
      {healthFilter !== 'all' && (
        <button
          onClick={() => setHealthFilter('all')}
          className="text-xs text-[#E91E8C] hover:underline -mt-2 inline-flex items-center gap-1"
        >
          <X className="h-3 w-3" /> Clear filter
        </button>
      )}

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, handle, or Discord..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30"
        >
          <option value="all">All Status</option>
          <option value="Active">Active</option>
          <option value="On Hold">On Hold</option>
          <option value="Churned">Churned</option>
          <option value="Inactive">Inactive</option>
        </select>
        {/* Include-unmanaged toggle. Replaces the old "All Creators" tab —
            unmanaged candidates with recent GMV are appended into the same
            sortable table so you can see who's worth recruiting alongside
            who's underperforming on contract. */}
        <button
          onClick={() => setIncludeUnmanaged(v => !v)}
          aria-pressed={includeUnmanaged}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors whitespace-nowrap ${
            includeUnmanaged
              ? 'bg-[#1A1B3A] text-white border-[#1A1B3A]'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
          title="Show top unmanaged creators with recent GMV alongside your managed roster"
        >
          <Globe className="h-4 w-4" />
          {includeUnmanaged ? 'Unmanaged shown' : 'Include unmanaged'}
        </button>
      </div>

      {/* Table */}
      {!loading && roster.length === 0 ? (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-16 text-center">
          <Users className="h-8 w-8 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm font-medium">No creators found</p>
          {(search || statusFilter !== 'all') && (
            <p className="text-gray-400 text-xs mt-1">Try adjusting your search or filters</p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="px-3 py-3.5 w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all visible"
                      checked={allVisibleSelected}
                      ref={(el) => { if (el) el.indeterminate = someVisibleSelected; }}
                      onChange={toggleAllVisible}
                      className="h-4 w-4 rounded border-gray-300 text-[#E91E8C] focus:ring-[#E91E8C]/30 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                    <button onClick={() => toggleSort('real_name')} className="inline-flex items-center gap-1.5 hover:text-gray-700 transition-colors">
                      Name <SortIcon col="real_name" />
                    </button>
                  </th>
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Handle</th>
                  {showBrandColumn && <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Brand</th>}
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                    <button onClick={() => toggleSort('retainer')} className="inline-flex items-center gap-1.5 hover:text-gray-700 transition-colors">
                      Retainer <SortIcon col="retainer" />
                    </button>
                  </th>
                  <th className="text-center px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                    <button onClick={() => toggleSort('posts_this_month')} className="inline-flex items-center gap-1.5 hover:text-gray-700 transition-colors mx-auto">
                      Posts <SortIcon col="posts_this_month" />
                    </button>
                  </th>
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                    <button onClick={() => toggleSort('last_post_date')} className="inline-flex items-center gap-1.5 hover:text-gray-700 transition-colors">
                      Last post <SortIcon col="last_post_date" />
                    </button>
                  </th>
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                    <button onClick={() => toggleSort('gmv_period')} className="inline-flex items-center gap-1.5 hover:text-gray-700 transition-colors">
                      GMV ({periodKey === '1d' ? '1d' : periodKey === 'ytd' ? 'YTD' : periodKey})
                      <SortIcon col="gmv_period" />
                    </button>
                  </th>
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                    <button onClick={() => toggleSort('roi_period')} className="inline-flex items-center gap-1.5 hover:text-gray-700 transition-colors">
                      ROI <SortIcon col="roi_period" />
                    </button>
                  </th>
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                    <button onClick={() => toggleSort('last_message_at')} className="inline-flex items-center gap-1.5 hover:text-gray-700 transition-colors">
                      Last DM <SortIcon col="last_message_at" />
                    </button>
                  </th>
                  <th className="text-center px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                    <button onClick={() => toggleSort('health')} className="inline-flex items-center gap-1.5 hover:text-gray-700 transition-colors mx-auto">
                      Health <SortIcon col="health" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading && roster.length === 0 && Array.from({ length: 8 }).map((_, i) => (
                  <SkeletonRow key={i} cols={showBrandColumn ? 11 : 10} />
                ))}
                {!loading && roster.map((c) => (
                  <tr
                    key={c.id}
                    className={`transition-colors cursor-pointer group ${
                      c.is_managed
                        ? 'hover:bg-pink-50/20'
                        // Unmanaged rows: subtle slate background to visually
                        // group them as "candidates" rather than roster members.
                        : 'bg-slate-50/40 hover:bg-slate-100/50'
                    }`}
                    onClick={() => {
                      if (c.is_managed) {
                        setSelectedCreator(c);
                      } else {
                        // Open the Add Creator modal pre-filled with the
                        // candidate's handle + (best-guess) brand.
                        setAddModalPrefill({
                          account_1: c.account_1 ?? '',
                          brand: c.brand ?? '',
                        });
                      }
                    }}
                  >
                    {/* Per-row select checkbox. Disabled for unmanaged rows —
                        bulk actions PATCH /api/roster/[id], and unmanaged rows
                        have synthetic IDs with nothing in managed_creators to
                        update. */}
                    <td className="px-3 py-3.5 w-10" onClick={(e) => e.stopPropagation()}>
                      {c.is_managed ? (
                        <input
                          type="checkbox"
                          aria-label={`Select ${c.real_name || c.account_1 || 'creator'}`}
                          checked={selectedIds.has(c.id)}
                          onChange={() => toggleOne(c.id)}
                          className="h-4 w-4 rounded border-gray-300 text-[#E91E8C] focus:ring-[#E91E8C]/30 cursor-pointer"
                        />
                      ) : (
                        // Visual placeholder so column alignment stays clean.
                        <span className="block h-4 w-4" aria-hidden="true" />
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-[#1A1B3A]">
                      {c.real_name || (c.is_managed
                        ? <span className="text-gray-400">—</span>
                        // Unmanaged often has no creators_v2 link → fall back
                        // to the handle so the row isn't anonymous.
                        : <span className="text-gray-500 italic">@{c.account_1}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {c.account_1 ? (
                        <span className="flex items-center">
                          <a
                            href={`https://tiktok.com/@${c.account_1}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#E91E8C] hover:underline font-medium"
                            onClick={(e) => e.stopPropagation()}
                          >
                            @{c.account_1}
                          </a>
                          <ExtraAccountsBadge creator={c} />
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    {showBrandColumn && (
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                          {brandOptions.find(b => b.slug === c.brand)?.name || BRAND_DISPLAY_NAMES[c.brand || ''] || c.brand?.replace(/_/g, ' ') || '—'}
                          <StoreMixIndicator creator={c} />
                        </span>
                      </td>
                    )}
                    <td className="px-5 py-3.5 text-right font-semibold text-[#1A1B3A]">
                      {(c.retainer || 0) > 0
                        ? fmt(c.retainer!)
                        : <span className="text-gray-300 font-normal">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <PostsProgressCell
                        posts={c.posts_this_month ?? 0}
                        target={c.monthly_post_requirement ?? 0}
                      />
                    </td>
                    <td className="px-5 py-3.5">
                      <LastPostCell date={c.last_post_date} />
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums">
                      {(c.gmv_period || 0) > 0
                        ? <span className="text-[#1A1B3A] font-semibold">{fmt(c.gmv_period)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <RoiCell roi={c.roi_period} />
                    </td>
                    <td className="px-5 py-3.5">
                      <LastDmCell at={c.last_message_at} unread={c.unread_count} />
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {c.is_managed ? (
                        <HealthBadge health={c.health} />
                      ) : (
                        // For unmanaged rows, the "Health" slot becomes an
                        // affordance: clearly signals the row is a candidate
                        // and gives a one-click way to recruit them. The whole
                        // row is also clickable (same handler) so this is just
                        // a visual cue + tap target.
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAddModalPrefill({
                              account_1: c.account_1 ?? '',
                              brand: c.brand ?? '',
                            });
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border border-pink-200 bg-pink-50 text-[#E91E8C] hover:bg-pink-100 transition-colors"
                        >
                          <Plus className="h-3 w-3" /> Add to roster
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 bg-gray-50/40">
            <p className="text-xs text-gray-400">
              {total.toLocaleString()} total · page {page} of {totalPages}
            </p>
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

      {/* ── Floating bulk-action bar ──
          Appears when 1+ creators are selected. Sticky to the bottom
          of the viewport so it's reachable while scrolling the table.
          Click outside the bar still propagates to the table (rows stay
          clickable). Selection persists within the visible page only;
          the load effect drops out-of-view IDs. */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#1A1B3A] text-white shadow-2xl border border-[#1A1B3A]/20 max-w-[calc(100vw-2rem)]">
          <span className="text-sm font-semibold whitespace-nowrap">
            {selectedIds.size} selected
          </span>
          <span className="h-5 w-px bg-white/20" />
          <button
            onClick={exportSelectedCsv}
            disabled={bulkUpdating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 disabled:opacity-50 transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
          <div className="relative">
            <button
              onClick={() => setBulkStatusOpen((o) => !o)}
              disabled={bulkUpdating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 disabled:opacity-50 transition-colors"
            >
              {bulkUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
              {bulkUpdating ? 'Saving…' : 'Set status'}
            </button>
            {bulkStatusOpen && !bulkUpdating && (
              <div className="absolute bottom-full mb-2 right-0 bg-white rounded-xl shadow-xl border border-gray-100 py-1 min-w-[140px] text-[#1A1B3A]">
                {(['Active', 'On Hold', 'Churned', 'Inactive'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => bulkChangeStatus(s)}
                    className="block w-full text-left px-3 py-2 text-xs font-medium hover:bg-gray-50 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          {bulkError && (
            <span className="text-xs text-red-300 max-w-[200px] truncate" title={bulkError}>
              {bulkError}
            </span>
          )}
          <span className="h-5 w-px bg-white/20" />
          <button
            onClick={() => { setSelectedIds(new Set()); setBulkError(null); }}
            disabled={bulkUpdating}
            className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-50 transition-colors"
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Creator detail panel — key forces remount when switching creators so form state is fresh */}
      {selectedCreator && (
        <CreatorPanel
          key={selectedCreator.id}
          creator={selectedCreator}
          onClose={() => setSelectedCreator(null)}
          onSaved={(updated) => {
            // Update the row in-place so the table reflects the save immediately
            setRoster(prev => prev.map(c => c.id === updated.id ? updated : c));
            setSelectedCreator(updated);
            // Re-fetch to keep aggregates accurate
            fetchRoster();
          }}
          onRemoved={(removedId) => {
            // Drop the row, close the panel, re-fetch so aggregates update
            // and the just-removed creator reappears as unmanaged if the
            // "Include unmanaged" toggle is on.
            setRoster(prev => prev.filter(c => c.id !== removedId));
            setSelectedCreator(null);
            fetchRoster();
          }}
        />
      )}
      </>)}

      {/* Add Creator modal — opens from the "+ Add to roster" action on
          unmanaged rows in the inline table OR from the page-level Add button. */}
      {addModalPrefill !== null && (
        <AddCreatorModal
          prefill={addModalPrefill}
          onClose={() => setAddModalPrefill(null)}
          onSuccess={() => {
            setAddModalPrefill(null);
            // Re-fetch so the just-added creator now shows as managed in the
            // unified table (if "Include unmanaged" is on, they migrate from
            // the unmanaged segment into the managed one with full health/ROI).
            fetchRoster();
          }}
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
