'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  UserPlus, Search, Users, DollarSign, UserCheck, X,
  ChevronLeft, ChevronRight, ExternalLink, TrendingUp, Loader2,
  UserX, Globe,
} from 'lucide-react';
import Link from 'next/link';
import { BRAND_DISPLAY_NAMES, ACTIVE_BRANDS } from '@/lib/utils/constants';
import type { UniverseCreator } from '@/app/api/creators/universe/route';

const PAGE_SIZE = 50;

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
}

function getExtraAccounts(c: Creator): string[] {
  return [c.account_2, c.account_3, c.account_4, c.account_5].filter(Boolean) as string[];
}

function StatusBadge({ status }: { status: string | null }) {
  const isActive = status === 'Active';
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${
      isActive ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'
    }`}>
      {status || 'Active'}
    </span>
  );
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

function CreatorPanel({ creator, onClose }: { creator: Creator; onClose: () => void }) {
  const allAccounts = [creator.account_1, ...getExtraAccounts(creator)].filter(Boolean) as string[];
  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />
      <div
        className="relative w-full max-w-md bg-white shadow-2xl h-full overflow-y-auto"
        style={{ animation: 'slideInRight 0.22s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#1A1B3A]">{creator.real_name || creator.account_1 || 'Creator'}</h2>
            {creator.brand && (
              <p className="text-xs text-gray-400 mt-0.5">{BRAND_DISPLAY_NAMES[creator.brand] || creator.brand}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Key stats row */}
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

          {/* Status */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Status</p>
            <StatusBadge status={creator.status} />
          </div>

          {/* TikTok Accounts */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">TikTok Accounts</p>
            <div className="space-y-1">
              {allAccounts.length > 0 ? allAccounts.map((h) => (
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
              )) : <span className="text-sm text-gray-400">—</span>}
            </div>
          </div>

          {/* Discord */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Discord</p>
            <div className="flex items-center gap-2">
              {creator.discord_avatar ? (
                <img
                  src={creator.discord_avatar}
                  alt=""
                  className="h-7 w-7 rounded-full ring-2 ring-gray-100"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : null}
              <span className="text-sm text-gray-700">{creator.discord_name || '—'}</span>
            </div>
          </div>

          {/* Notes */}
          {creator.notes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{creator.notes}</p>
            </div>
          )}

          {/* Joined */}
          {creator.created_at && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Joined</p>
              <span className="text-sm text-gray-500">
                {new Date(creator.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          )}

          {/* CTA */}
          {creator.account_1 && (
            <Link
              href={`/creators/${encodeURIComponent(creator.account_1)}`}
              className="flex items-center justify-center gap-2 w-full mt-2 px-4 py-3 rounded-xl bg-[#E91E8C] text-white text-sm font-semibold hover:bg-[#d1177d] transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              View Full Profile
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

interface AddCreatorModalProps {
  prefill?: { account_1?: string; brand?: string };
  onClose: () => void;
  onSuccess: () => void;
}

function AddCreatorModal({ prefill, onClose, onSuccess }: AddCreatorModalProps) {
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
              {ACTIVE_BRANDS.map(b => (
                <option key={b} value={b}>{BRAND_DISPLAY_NAMES[b] || b}</option>
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

// ─── All Creators Tab ────────────────────────────────────────────────────────

const DAYS_OPTIONS = [
  { label: '30d', value: 30 },
  { label: '60d', value: 60 },
  { label: '90d', value: 90 },
];

function AllCreatorsTab({ brand, onAddCreator }: { brand: string; onAddCreator: (prefill: { account_1: string; brand: string }) => void }) {
  const [creators, setCreators] = useState<UniverseCreator[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [days, setDays] = useState(90);
  const [managedFilter, setManagedFilter] = useState<'all' | 'managed' | 'unmanaged'>('all');
  const [page, setPage] = useState(1);
  const PAGE = 50;

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setPage(1); }, [days, managedFilter]);

  useEffect(() => { setPage(1); }, [brand]);

  const fetchCreators = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE), days: String(days) });
      if (search) params.set('search', search);
      if (brand && brand !== 'all') params.set('brand', brand);

      const res = await fetch(`/api/creators/universe?${params}`);
      const json = await res.json();

      let data: UniverseCreator[] = json.data || [];
      if (managedFilter === 'managed')   data = data.filter(c => c.is_managed);
      if (managedFilter === 'unmanaged') data = data.filter(c => !c.is_managed);

      setCreators(data);
      setTotal(managedFilter === 'all' ? (json.total || 0) : data.length);
    } catch (err) {
      console.error('Failed to fetch all creators:', err);
    } finally {
      setLoading(false);
    }
  }, [brand, page, search, days, managedFilter]);

  useEffect(() => { fetchCreators(); }, [fetchCreators]);

  const fmt  = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
  const totalPages = Math.max(1, Math.ceil(total / PAGE));

  const managedCount   = creators.filter(c => c.is_managed).length;
  const unmanagedCount = creators.filter(c => !c.is_managed).length;

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by handle..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
          />
        </div>

        {/* Managed filter */}
        <div className="flex rounded-xl border border-gray-200 overflow-hidden text-sm font-medium">
          {(['all', 'managed', 'unmanaged'] as const).map(f => (
            <button
              key={f}
              onClick={() => setManagedFilter(f)}
              className={`px-3.5 py-2 capitalize transition-colors ${managedFilter === f ? 'bg-[#E91E8C] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Days toggle */}
        <div className="flex rounded-xl border border-gray-200 overflow-hidden text-sm font-medium">
          {DAYS_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => setDays(o.value)}
              className={`px-3.5 py-2 transition-colors ${days === o.value ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-16 flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-6 w-6 text-gray-300 animate-spin" />
          <p className="text-sm text-gray-400">Loading creators...</p>
        </div>
      ) : creators.length === 0 ? (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-16 text-center">
          <Globe className="h-8 w-8 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm font-medium">No creators found</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Creator</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Brand</th>
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">GMV ({days}d)</th>
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Orders</th>
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Videos</th>
                  <th className="text-center px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {creators.map((c) => (
                  <tr key={`${c.creator_name}|||${c.brand}`} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <div>
                        <a
                          href={`https://tiktok.com/@${c.creator_name}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-[#E91E8C] hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          @{c.creator_name}
                        </a>
                        {c.managed_real_name && (
                          <p className="text-xs text-gray-400 mt-0.5">{c.managed_real_name}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                        {BRAND_DISPLAY_NAMES[c.brand] || c.brand}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-[#1A1B3A]">
                      {fmt(c.total_gmv)}
                    </td>
                    <td className="px-5 py-3.5 text-right text-gray-500">
                      {c.total_orders.toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 text-right text-gray-500">
                      {c.total_videos.toLocaleString()}
                    </td>
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
                    <td className="px-5 py-3.5 text-right">
                      {!c.is_managed && (
                        <button
                          onClick={() => onAddCreator({ account_1: c.creator_name, brand: c.brand })}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#E91E8C] text-white hover:bg-[#d1177d] transition-colors whitespace-nowrap"
                        >
                          + Add to Roster
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 bg-gray-50/40">
            <p className="text-xs text-gray-400">
              {total.toLocaleString()} creators · {managedCount} managed · {unmanagedCount} unmanaged on this page
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
    </div>
  );
}

// ─── Managed Roster Tab ───────────────────────────────────────────────────────

function RosterContent() {
  const searchParams = useSearchParams();
  const brand = searchParams.get('brand') || 'all';
  const showBrandColumn = brand === 'all';

  const [activeTab, setActiveTab] = useState<'roster' | 'all'>('roster');
  const [roster, setRoster] = useState<Creator[]>([]);
  const [total, setTotal] = useState(0);
  const [totalRetainer, setTotalRetainer] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null);
  const [page, setPage] = useState(1);
  const [addModalPrefill, setAddModalPrefill] = useState<{ account_1?: string; brand?: string } | null>(null);

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
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (brand && brand !== 'all') params.set('brand', brand);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search) params.set('search', search);

      const res = await fetch(`/api/roster?${params}`);
      const json = await res.json();
      setRoster(json.data || []);
      setTotal(json.total || 0);
      setTotalRetainer(json.total_retainer || 0);
    } catch (err) {
      console.error('Failed to fetch roster:', err);
    } finally {
      setLoading(false);
    }
  }, [brand, statusFilter, search, page]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [brand, statusFilter]);

  const totalPages   = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeCount  = roster.filter(c => c.status === 'Active').length;
  const withRetainer = roster.filter(c => (c.retainer || 0) > 0).length;

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

  const brandDisplayName = brand !== 'all' ? (BRAND_DISPLAY_NAMES[brand] || brand.replace(/_/g, ' ')) : '';

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

      {/* Tab toggle */}
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
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            activeTab === 'all' ? 'bg-white text-[#1A1B3A] shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Globe className="h-4 w-4" /> All Creators
        </button>
      </div>

      {/* All Creators tab */}
      {activeTab === 'all' && (
        <AllCreatorsTab
          brand={brand}
          onAddCreator={(prefill) => setAddModalPrefill(prefill)}
        />
      )}

      {/* Managed Roster tab content */}
      {activeTab === 'roster' && (<><div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: <Users className="h-4 w-4 text-gray-400" />, label: 'Total Creators', value: total.toLocaleString() },
          { icon: <DollarSign className="h-4 w-4 text-[#E91E8C]" />, label: 'Monthly Retainer', value: fmt(totalRetainer) },
          { icon: <UserCheck className="h-4 w-4 text-green-500" />, label: 'Active', value: activeCount.toLocaleString() },
          { icon: <TrendingUp className="h-4 w-4 text-blue-400" />, label: 'On Retainer', value: withRetainer.toLocaleString() },
        ].map(({ icon, label, value }) => (
          <div key={label} className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-2">
              {icon}
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
            </div>
            <p className="text-2xl font-extrabold text-[#1A1B3A]">{loading ? '—' : value}</p>
          </div>
        ))}
      </div>

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
          <option value="Inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-16 flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-6 w-6 text-gray-300 animate-spin" />
          <p className="text-sm text-gray-400">Loading creators...</p>
        </div>
      ) : roster.length === 0 ? (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-16 text-center">
          <Users className="h-8 w-8 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm font-medium">No creators found</p>
          <p className="text-gray-400 text-xs mt-1">Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Name</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Handle</th>
                  {showBrandColumn && <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Brand</th>}
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Discord</th>
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Retainer</th>
                  <th className="text-center px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Posts/Mo</th>
                  <th className="text-center px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {roster.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-pink-50/20 transition-colors cursor-pointer group"
                    onClick={() => setSelectedCreator(c)}
                  >
                    <td className="px-5 py-3.5 font-medium text-[#1A1B3A]">
                      {c.real_name || <span className="text-gray-400">—</span>}
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
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                          {BRAND_DISPLAY_NAMES[c.brand || ''] || c.brand?.replace(/_/g, ' ') || '—'}
                        </span>
                      </td>
                    )}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        {c.discord_avatar && (
                          <img
                            src={c.discord_avatar}
                            alt=""
                            className="h-6 w-6 rounded-full flex-shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                        <span className="text-xs text-gray-500">{c.discord_name || <span className="text-gray-300">—</span>}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-[#1A1B3A]">
                      {(c.retainer || 0) > 0
                        ? fmt(c.retainer!)
                        : <span className="text-gray-300 font-normal">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-center text-gray-600 text-sm">
                      {c.monthly_post_requirement || 30}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <StatusBadge status={c.status} />
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

      {/* Creator detail panel */}
      {selectedCreator && (
        <CreatorPanel creator={selectedCreator} onClose={() => setSelectedCreator(null)} />
      )}
      </>)}

      {/* Add Creator modal — available from both tabs */}
      {addModalPrefill !== null && (
        <AddCreatorModal
          prefill={addModalPrefill}
          onClose={() => setAddModalPrefill(null)}
          onSuccess={() => { setAddModalPrefill(null); fetchRoster(); }}
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
