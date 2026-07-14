'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Check, X, Search, Users, Zap, HelpCircle, RefreshCw, ChevronDown,
  MessageSquare, Hand,
} from 'lucide-react';

interface BrandRef {
  slug: string;
  name: string;
  display_name: string | null;
  color: string | null;
}
interface CreatorRef {
  id: string;
  real_name: string | null;
  discord_username: string | null;
}

interface PendingLink {
  id: string;
  brand_id: string;
  guild_id: string;
  discord_user_id: string;
  discord_username: string | null;
  discord_display_name: string | null;
  discord_avatar_url: string | null;
  requested_handle: string | null;
  matched_creator_id: string | null;
  match_type: 'exact' | 'fuzzy' | 'none' | 'manual' | null;
  match_confidence: number | null;
  match_reason: string | null;
  source: 'user_link' | 'admin_scan' | 'manual';
  status: 'pending' | 'approved' | 'rejected';
  notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  brand: BrandRef | null;
  creator: CreatorRef | null;
}

interface Counts {
  pending: number;
  approved: number;
  rejected: number;
  exact: number;
  fuzzy: number;
  unmatched: number;
}

const MATCH_BADGES: Record<string, { label: string; className: string }> = {
  exact: { label: 'Exact', className: 'bg-emerald-100 text-emerald-700' },
  fuzzy: { label: 'Fuzzy', className: 'bg-amber-100 text-amber-700' },
  none: { label: 'No Match', className: 'bg-gray-100 text-gray-500' },
  manual: { label: 'Manual', className: 'bg-violet-100 text-violet-700' },
};

const SOURCE_BADGES: Record<string, { label: string; icon: typeof MessageSquare }> = {
  user_link: { label: 'User /link', icon: MessageSquare },
  admin_scan: { label: 'Admin /scan', icon: Search },
  manual: { label: 'Manual', icon: Hand },
};

type TabStatus = 'pending' | 'approved' | 'rejected' | 'all';

export default function DiscordLinksPage() {
  const [entries, setEntries] = useState<PendingLink[]>([]);
  const [counts, setCounts] = useState<Counts>({
    pending: 0, approved: 0, rejected: 0, exact: 0, fuzzy: 0, unmatched: 0,
  });
  const [tab, setTab] = useState<TabStatus>('pending');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reassignOpen, setReassignOpen] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: tab });
      if (brandFilter !== 'all') params.set('brand', brandFilter);
      const res = await fetch(`/api/discord-links?${params}`);
      const data = await res.json();
      setEntries(data.entries ?? []);
      setCounts(data.counts ?? counts);
    } catch (e) {
      console.error('Failed to fetch:', e);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, brandFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleAction(id: string, action: 'approve' | 'reject') {
    setActionLoading(id);
    try {
      await fetch(`/api/discord-links/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewed_by: 'admin' }),
      });
      await fetchData();
    } catch (e) {
      console.error(`Failed to ${action}:`, e);
    }
    setActionLoading(null);
  }

  async function handleReassign(id: string, creatorId: string) {
    setActionLoading(id);
    try {
      await fetch(`/api/discord-links/${id}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creator_id: creatorId, reviewed_by: 'admin' }),
      });
      setReassignOpen(null);
      await fetchData();
    } catch (e) {
      console.error('Failed to reassign:', e);
    }
    setActionLoading(null);
  }

  async function handleBulkApproveExact() {
    const exactPending = entries.filter(
      (e) => e.match_type === 'exact' && e.status === 'pending' && e.matched_creator_id,
    );
    for (const entry of exactPending) {
      await fetch(`/api/discord-links/${entry.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewed_by: 'admin' }),
      });
    }
    await fetchData();
  }

  const tabs: { key: TabStatus; label: string; count?: number }[] = [
    { key: 'pending', label: 'Pending', count: counts.pending },
    { key: 'approved', label: 'Approved', count: counts.approved },
    { key: 'rejected', label: 'Rejected', count: counts.rejected },
    { key: 'all', label: 'All' },
  ];

  // Build list of unique creators we've seen for the reassign dropdown
  const knownCreators = entries
    .filter((e) => e.creator)
    .map((e) => e.creator!)
    .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i)
    .sort((a, b) => (a.real_name ?? '').localeCompare(b.real_name ?? ''));

  // Discover brand options from entries seen
  const brandOptions = entries
    .filter((e) => e.brand)
    .map((e) => e.brand!)
    .filter((b, i, arr) => arr.findIndex((x) => x.slug === b.slug) === i)
    .sort((a, b) => (a.display_name ?? a.name).localeCompare(b.display_name ?? b.name));

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
      <div className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Search className="h-6 w-6 text-primary" />
              Discord Link Review
            </h1>
            <p className="text-gray-500 mt-1">
              Approve creators auto-matched from <code className="bg-gray-100 px-1 rounded text-xs">/scan</code> or self-linked via <code className="bg-gray-100 px-1 rounded text-xs">/link</code>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
            >
              <option value="all">All brands</option>
              {brandOptions.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.display_name ?? b.name}
                </option>
              ))}
            </select>
            <button
              onClick={fetchData}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          {[
            { label: 'Pending', value: counts.pending, icon: HelpCircle, color: 'text-amber-600' },
            { label: 'Exact', value: counts.exact, icon: Check, color: 'text-emerald-600' },
            { label: 'Fuzzy', value: counts.fuzzy, icon: Zap, color: 'text-amber-600' },
            { label: 'Unmatched', value: counts.unmatched, icon: Users, color: 'text-gray-600' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className={`h-4 w-4 ${s.color}`} />
                <span className="text-xs text-gray-500 font-medium">{s.label}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs + Bulk Actions */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                tab === t.key ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className="ml-2 text-xs text-gray-400">{t.count}</span>
              )}
            </button>
          ))}
        </div>
        {tab === 'pending' && entries.some(
          (e) => e.match_type === 'exact' && e.matched_creator_id,
        ) && (
          <button
            onClick={handleBulkApproveExact}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600"
          >
            <Check className="h-4 w-4" />
            Approve all exact matches
          </button>
        )}
      </div>

      {/* Entries */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-6 w-6 text-gray-400 animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Search className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">
            No entries found. Run <code className="bg-gray-100 px-2 py-0.5 rounded text-sm">/scan</code> in Discord to populate this queue.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const matchType = entry.match_type ?? 'none';
            const SourceIcon = SOURCE_BADGES[entry.source]?.icon ?? Users;
            return (
              <div
                key={entry.id}
                className={`bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 ${
                  actionLoading === entry.id ? 'opacity-50' : ''
                }`}
              >
                {/* Discord user */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {entry.discord_avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.discord_avatar_url}
                      alt={entry.discord_username ?? 'avatar'}
                      className="h-10 w-10 rounded-full flex-shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                      <Users className="h-5 w-5 text-gray-400" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {entry.discord_username ?? entry.discord_user_id}
                    </p>
                    {entry.discord_display_name && (
                      <p className="text-xs text-gray-500 truncate">{entry.discord_display_name}</p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {entry.brand && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {entry.brand.display_name ?? entry.brand.name}
                        </span>
                      )}
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <SourceIcon className="h-3 w-3" />
                        {SOURCE_BADGES[entry.source]?.label ?? entry.source}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Match info */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  {entry.creator ? (
                    <div className="text-right max-w-[180px]">
                      <p className="text-sm font-medium text-gray-900 truncate">{entry.creator.real_name}</p>
                      {entry.requested_handle && (
                        <p className="text-xs text-gray-400 truncate">requested: @{entry.requested_handle}</p>
                      )}
                    </div>
                  ) : entry.requested_handle ? (
                    <div className="text-right max-w-[180px]">
                      <p className="text-xs text-gray-400">requested</p>
                      <p className="text-sm font-medium text-gray-700 truncate">@{entry.requested_handle}</p>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400 italic">No match</span>
                  )}

                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      MATCH_BADGES[matchType]?.className ?? 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {MATCH_BADGES[matchType]?.label ?? matchType}
                  </span>

                  {entry.match_confidence != null && entry.match_confidence > 0 && (
                    <span className="text-xs text-gray-500 font-mono w-10 text-right">
                      {Math.round(entry.match_confidence * 100)}%
                    </span>
                  )}
                </div>

                {/* Actions */}
                {entry.status === 'pending' && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {entry.matched_creator_id && (
                      <button
                        onClick={() => handleAction(entry.id, 'approve')}
                        disabled={actionLoading === entry.id}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Approve
                      </button>
                    )}
                    <button
                      onClick={() => handleAction(entry.id, 'reject')}
                      disabled={actionLoading === entry.id}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setReassignOpen(reassignOpen === entry.id ? null : entry.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                      >
                        Reassign
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      {reassignOpen === entry.id && (
                        <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-10 max-h-64 overflow-y-auto">
                          {knownCreators.length === 0 ? (
                            <p className="p-3 text-sm text-gray-400">No creators to reassign to yet.</p>
                          ) : (
                            knownCreators.map((c) => (
                              <button
                                key={c.id}
                                onClick={() => handleReassign(entry.id, c.id)}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                              >
                                <span className="truncate">{c.real_name ?? `Creator ${c.id.slice(0, 8)}`}</span>
                                {c.discord_username && (
                                  <span className="text-xs text-gray-400 ml-2">@{c.discord_username}</span>
                                )}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {entry.status !== 'pending' && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        entry.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {entry.status}
                    </span>
                    {entry.reviewed_by && (
                      <span className="text-xs text-gray-400">by {entry.reviewed_by}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
