'use client';

import { useEffect, useState, useCallback } from 'react';
import { Check, X, Search, Users, Zap, HelpCircle, RefreshCw, ChevronDown } from 'lucide-react';

interface Creator {
  id: number;
  real_name: string | null;
  discord_name: string | null;
  brand: string | null;
}

interface QueueEntry {
  id: string;
  guild_id: string;
  discord_user_id: string;
  discord_username: string;
  discord_display_name: string | null;
  discord_avatar_url: string | null;
  matched_creator_id: number | null;
  match_type: 'exact' | 'fuzzy' | 'none';
  match_confidence: number;
  match_reason: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  scanned_at: string;
  managed_creators: Creator | null;
}

interface Stats {
  total: number;
  pending: number;
  exact: number;
  fuzzy: number;
}

const GUILD_NAMES: Record<string, string> = {
  '1181985490363240499': "Physician's Choice",
  '1093295115495297084': 'Tempo Dev',
  '1339335585776533708': 'JiYu',
};

const MATCH_BADGES: Record<string, { label: string; className: string }> = {
  exact: { label: 'Exact', className: 'bg-emerald-100 text-emerald-700' },
  fuzzy: { label: 'Fuzzy', className: 'bg-amber-100 text-amber-700' },
  none: { label: 'No Match', className: 'bg-gray-100 text-gray-500' },
};

const BRAND_COLORS: Record<string, string> = {
  jiyu: 'bg-pink-100 text-pink-700',
  physicians_choice: 'bg-blue-100 text-blue-700',
  catakor: 'bg-purple-100 text-purple-700',
  toplux: 'bg-orange-100 text-orange-700',
};

type TabStatus = 'pending' | 'approved' | 'rejected' | 'all';

export default function DiscordScanPage() {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, exact: 0, fuzzy: 0 });
  const [tab, setTab] = useState<TabStatus>('pending');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [allCreators, setAllCreators] = useState<Creator[]>([]);
  const [reassignOpen, setReassignOpen] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/discord/scan-queue?status=${tab}`);
      const data = await res.json();
      setEntries(data.entries ?? []);
      setStats(data.stats ?? { total: 0, pending: 0, exact: 0, fuzzy: 0 });
    } catch (e) {
      console.error('Failed to fetch queue:', e);
    }
    setLoading(false);
  }, [tab]);

  const fetchCreators = useCallback(async () => {
    try {
      const res = await fetch('/api/discord/scan-queue?status=all&_creators=1');
      // We'll just use managed_creators from existing entries for now
    } catch {}
  }, []);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  async function handleAction(id: string, action: 'approve' | 'reject') {
    setActionLoading(id);
    try {
      await fetch(`/api/discord/scan-queue/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewed_by: 'admin' }),
      });
      await fetchQueue();
    } catch (e) {
      console.error(`Failed to ${action}:`, e);
    }
    setActionLoading(null);
  }

  async function handleReassign(id: string, creatorId: number) {
    setActionLoading(id);
    try {
      await fetch(`/api/discord/scan-queue/${id}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creator_id: creatorId, reviewed_by: 'admin' }),
      });
      setReassignOpen(null);
      await fetchQueue();
    } catch (e) {
      console.error('Failed to reassign:', e);
    }
    setActionLoading(null);
  }

  async function handleBulkApproveExact() {
    const exactPending = entries.filter(e => e.match_type === 'exact' && e.status === 'pending');
    for (const entry of exactPending) {
      await fetch(`/api/discord/scan-queue/${entry.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewed_by: 'admin' }),
      });
    }
    await fetchQueue();
  }

  const tabs: { key: TabStatus; label: string }[] = [
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'all', label: 'All' },
  ];

  // Get unique creators from entries for reassignment dropdown
  const creatorsFromEntries = entries
    .filter(e => e.managed_creators)
    .map(e => e.managed_creators!)
    .filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Search className="h-6 w-6 text-pink-500" />
              Discord Scanner
            </h1>
            <p className="text-gray-500 mt-1">Match Discord server members to managed creators</p>
          </div>
          <button
            onClick={fetchQueue}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          {[
            { label: 'Total Scanned', value: stats.total, icon: Users, color: 'text-gray-600' },
            { label: 'Pending Review', value: stats.pending, icon: HelpCircle, color: 'text-amber-600' },
            { label: 'Exact Matches', value: stats.exact, icon: Check, color: 'text-emerald-600' },
            { label: 'Fuzzy Matches', value: stats.fuzzy, icon: Zap, color: 'text-amber-600' },
          ].map(s => (
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
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                tab === t.key
                  ? 'bg-pink-50 text-pink-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'pending' && entries.some(e => e.match_type === 'exact') && (
          <button
            onClick={handleBulkApproveExact}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors"
          >
            <Check className="h-4 w-4" />
            Approve All Exact Matches
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
          <p className="text-gray-500">No entries found. Run <code className="bg-gray-100 px-2 py-0.5 rounded text-sm">/scan</code> in Discord to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map(entry => (
            <div
              key={entry.id}
              className={`bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 transition-all ${
                actionLoading === entry.id ? 'opacity-50' : ''
              }`}
            >
              {/* Discord user */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {entry.discord_avatar_url ? (
                  <img
                    src={entry.discord_avatar_url}
                    alt={entry.discord_username}
                    className="h-10 w-10 rounded-full flex-shrink-0"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                    <Users className="h-5 w-5 text-gray-400" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{entry.discord_username}</p>
                  {entry.discord_display_name && (
                    <p className="text-xs text-gray-500 truncate">{entry.discord_display_name}</p>
                  )}
                  <p className="text-xs text-gray-400">{GUILD_NAMES[entry.guild_id] ?? entry.guild_id}</p>
                </div>
              </div>

              {/* Match info */}
              <div className="flex items-center gap-3 flex-shrink-0">
                {entry.managed_creators ? (
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">{entry.managed_creators.real_name}</p>
                    {entry.managed_creators.brand && (
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${BRAND_COLORS[entry.managed_creators.brand] ?? 'bg-gray-100 text-gray-600'}`}>
                        {entry.managed_creators.brand}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-gray-400 italic">No match</span>
                )}

                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${MATCH_BADGES[entry.match_type]?.className}`}>
                  {MATCH_BADGES[entry.match_type]?.label}
                </span>

                {entry.match_confidence > 0 && (
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
                      className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </button>
                  )}
                  <button
                    onClick={() => handleAction(entry.id, 'reject')}
                    disabled={actionLoading === entry.id}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setReassignOpen(reassignOpen === entry.id ? null : entry.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Reassign
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    {reassignOpen === entry.id && (
                      <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-10 max-h-60 overflow-y-auto">
                        {creatorsFromEntries.length === 0 ? (
                          <p className="p-3 text-sm text-gray-400">No creators available</p>
                        ) : (
                          creatorsFromEntries.map(c => (
                            <button
                              key={c.id}
                              onClick={() => handleReassign(entry.id, c.id)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                            >
                              <span>{c.real_name ?? `Creator #${c.id}`}</span>
                              {c.brand && (
                                <span className={`text-xs px-2 py-0.5 rounded-full ${BRAND_COLORS[c.brand] ?? 'bg-gray-100'}`}>
                                  {c.brand}
                                </span>
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
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${
                  entry.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                }`}>
                  {entry.status}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
