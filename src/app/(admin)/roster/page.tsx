'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { UserPlus, Upload, Search, Users, DollarSign, UserCheck, UserX, X, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';

const PAGE_SIZE = 50;

function getAdditionalAccounts(creator: any): string[] {
  const accounts: string[] = [];
  for (let i = 2; i <= 10; i++) {
    const val = creator[`account_${i}`];
    if (val) accounts.push(val);
  }
  return accounts;
}

function AdditionalAccountsBadge({ creator }: { creator: any }) {
  const extras = getAdditionalAccounts(creator);
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
        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-pink-50 text-[#E91E8C] hover:bg-pink-100 transition-colors"
      >
        +{extras.length}
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-2 min-w-[160px]">
          {extras.map((handle) => (
            <a
              key={handle}
              href={`https://tiktok.com/@${handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-2 py-1 text-xs text-[#E91E8C] hover:bg-pink-50 rounded-lg transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              @{handle}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function CreatorPanel({ creator, onClose }: { creator: any; onClose: () => void }) {
  const allAccounts = [creator.account_1, ...getAdditionalAccounts(creator)].filter(Boolean);
  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20" />
      <div
        className="relative w-full max-w-md bg-white shadow-2xl h-full overflow-y-auto animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#1A1B3A]">{creator.real_name || 'Unknown'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>
        <div className="p-6 space-y-5">
          {/* TikTok Accounts */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">TikTok Accounts</p>
            <div className="space-y-1">
              {allAccounts.length > 0 ? allAccounts.map((h: string) => (
                <a key={h} href={`https://tiktok.com/@${h}`} target="_blank" rel="noopener noreferrer" className="block text-sm text-[#E91E8C] hover:underline">@{h}</a>
              )) : <span className="text-sm text-gray-400">—</span>}
            </div>
          </div>
          {/* Discord */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">Discord</p>
            <div className="flex items-center gap-2">
              {creator.discord_avatar && (
                <img src={creator.discord_avatar} alt="" className="h-6 w-6 rounded-full" />
              )}
              <span className="text-sm text-gray-700">{creator.discord_name || '—'}</span>
            </div>
          </div>
          {/* Brand */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">Brand</p>
            <span className="text-sm text-gray-700">{BRAND_DISPLAY_NAMES[creator.brand] || creator.brand || '—'}</span>
          </div>
          {/* Retainer */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">Retainer</p>
            <span className="text-sm font-semibold text-[#1A1B3A]">{creator.retainer > 0 ? fmt(creator.retainer) : '—'}</span>
          </div>
          {/* Posts/Mo */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">Monthly Post Requirement</p>
            <span className="text-sm text-gray-700">{creator.monthly_post_requirement || 30}</span>
          </div>
          {/* Status */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">Status</p>
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${creator.status === 'Active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
              {creator.status || 'Active'}
            </span>
          </div>
          {/* Notes */}
          {creator.notes && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{creator.notes}</p>
            </div>
          )}
          {/* Joined */}
          {creator.created_at && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">Joined</p>
              <span className="text-sm text-gray-700">{new Date(creator.created_at).toLocaleDateString()}</span>
            </div>
          )}

          {/* View Full Profile Link */}
          {creator.account_1 && (
            <Link
              href={`/creators/${encodeURIComponent(creator.account_1)}`}
              className="flex items-center justify-center gap-2 w-full mt-2 px-4 py-2.5 rounded-xl bg-[#E91E8C] text-white text-sm font-medium hover:bg-[#d1177d] transition-colors"
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

function RosterContent() {
  const searchParams = useSearchParams();
  const brand = searchParams.get('brand') || 'all';
  const showBrandColumn = brand === 'all';

  const [roster, setRoster] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedCreator, setSelectedCreator] = useState<any>(null);
  const [page, setPage] = useState(1);

  const fetchRoster = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (brand && brand !== 'all') params.set('brand', brand);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search) params.set('search', search);
      const res = await fetch(`/api/roster?${params}`);
      const json = await res.json();
      setRoster(json.data || []);
      setPage(1);
    } catch (err) {
      console.error('Failed to fetch roster:', err);
    } finally {
      setLoading(false);
    }
  }, [brand, statusFilter, search]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  const totalRetainer = roster.reduce((sum, c) => sum + (c.retainer || 0), 0);
  const activeCount = roster.filter(c => c.status === 'Active').length;
  const withRetainer = roster.filter(c => c.retainer > 0).length;

  const totalPages = Math.max(1, Math.ceil(roster.length / PAGE_SIZE));
  const paginatedRoster = roster.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

  const brandDisplayName = brand !== 'all' ? (BRAND_DISPLAY_NAMES[brand] || brand.replace(/_/g, ' ')) : '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1B3A]">My Creators</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {brandDisplayName ? `${brandDisplayName} — ` : ''}Your managed talent roster
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => alert('Bulk Upload coming soon!')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Upload className="h-4 w-4" />
            Bulk Upload
          </button>
          <button
            onClick={() => alert('Add Creator coming soon!')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#E91E8C] text-sm font-medium text-white hover:bg-[#d1177d] transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Add Creator
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-gray-400" />
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Total Creators</p>
          </div>
          <p className="text-2xl font-extrabold text-[#1A1B3A]">{roster.length}</p>
        </div>
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-gray-400" />
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Monthly Retainer</p>
          </div>
          <p className="text-2xl font-extrabold text-[#1A1B3A]">{fmt(totalRetainer)}</p>
        </div>
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <UserCheck className="h-4 w-4 text-green-500" />
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Active</p>
          </div>
          <p className="text-2xl font-extrabold text-[#1A1B3A]">{activeCount}</p>
        </div>
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-[#E91E8C]" />
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">On Retainer</p>
          </div>
          <p className="text-2xl font-extrabold text-[#1A1B3A]">{withRetainer}</p>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, handle, or Discord..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-12 text-center text-sm text-gray-400">
          Loading creators...
        </div>
      ) : roster.length === 0 ? (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-12 text-center">
          <UserX className="h-8 w-8 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No creators found</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Primary Handle</th>
                  {showBrandColumn && <th className="text-left px-4 py-3 font-semibold text-gray-600">Brand</th>}
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Discord</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Retainer</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Posts/Mo</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRoster.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-gray-50 hover:bg-pink-50/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedCreator(c)}
                  >
                    <td className="px-4 py-3 font-medium text-[#1A1B3A]">{c.real_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.account_1 ? (
                        <span className="flex items-center">
                          <a
                            href={`https://tiktok.com/@${c.account_1}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#E91E8C] hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            @{c.account_1}
                          </a>
                          <AdditionalAccountsBadge creator={c} />
                        </span>
                      ) : '—'}
                    </td>
                    {showBrandColumn && (
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                          {BRAND_DISPLAY_NAMES[c.brand] || c.brand?.replace(/_/g, ' ') || '—'}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      <span className="flex items-center gap-1.5">
                        {c.discord_avatar && (
                          <img src={c.discord_avatar} alt="" className="h-6 w-6 rounded-full flex-shrink-0" />
                        )}
                        {c.discord_name || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {c.retainer > 0 ? fmt(c.retainer) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{c.monthly_post_requirement || 30}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        c.status === 'Active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {c.status || 'Active'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-400">{roster.length} creators total</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Previous
                </button>
                <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Slide-out Panel */}
      {selectedCreator && (
        <CreatorPanel creator={selectedCreator} onClose={() => setSelectedCreator(null)} />
      )}

      {/* Slide-in animation */}
      <style jsx global>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.25s ease-out;
        }
      `}</style>
    </div>
  );
}

export default function RosterPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-gray-400">Loading...</div>}>
      <RosterContent />
    </Suspense>
  );
}
