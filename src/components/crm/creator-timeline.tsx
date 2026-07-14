'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare, ArrowRightLeft, Send, DollarSign, Star, Tag,
  Loader2, ChevronDown, Clock,
} from 'lucide-react';
import type { ActivityEntry, ActivityType } from '@/lib/data/crm';

const ICONS: Record<ActivityType, typeof MessageSquare> = {
  note: MessageSquare,
  status_change: ArrowRightLeft,
  outreach: Send,
  message: Send,
  payment: DollarSign,
  milestone: Star,
  tag_change: Tag,
  retainer_change: DollarSign,
  brand_change: ArrowRightLeft,
};

const ICON_COLORS: Record<string, string> = {
  note: 'bg-blue-50 text-blue-500',
  status_change: 'bg-orange-50 text-orange-500',
  outreach: 'bg-primary/10 text-[var(--primary)]',
  message: 'bg-primary/10 text-[var(--primary)]',
  payment: 'bg-green-50 text-green-500',
  milestone: 'bg-yellow-50 text-yellow-500',
  tag_change: 'bg-purple-50 text-purple-500',
  retainer_change: 'bg-green-50 text-green-500',
  brand_change: 'bg-orange-50 text-orange-500',
};

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function CreatorTimeline({ creatorId }: { creatorId: string }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchEntries = useCallback(async (p: number, append = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/timeline/${creatorId}?page=${p}&limit=20`);
      const data = await res.json();
      const items: ActivityEntry[] = data.entries || [];
      setEntries(prev => append ? [...prev, ...items] : items);
      setHasMore(items.length === 20);
    } catch { /* ignore */ }
    setLoading(false);
  }, [creatorId]);

  useEffect(() => { fetchEntries(1); }, [fetchEntries]);

  const addNote = async () => {
    if (!note.trim()) return;
    setSubmitting(true);
    try {
      await fetch(`/api/crm/timeline/${creatorId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity_type: 'note', title: 'Note', body: note.trim(), created_by: 'tyler' }),
      });
      setNote('');
      setPage(1);
      await fetchEntries(1);
    } catch { /* ignore */ }
    setSubmitting(false);
  };

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-lg font-bold text-[#1A1B3A]">Activity Timeline</h3>
        <p className="text-xs text-gray-400 mt-0.5">Notes, status changes, and activity history</p>
      </div>

      {/* Add Note */}
      <div className="px-6 py-4 border-b border-gray-50">
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Add a note..."
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-[var(--primary)] transition"
          rows={2}
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={addNote}
            disabled={submitting || !note.trim()}
            className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:bg-primary disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Add Note
          </button>
        </div>
      </div>

      {/* Entries */}
      <div className="divide-y divide-gray-50">
        {entries.map(entry => {
          const Icon = ICONS[entry.activity_type] || MessageSquare;
          const colorClass = ICON_COLORS[entry.activity_type] || 'bg-gray-50 text-gray-500';
          return (
            <div key={entry.id} className="px-6 py-4 flex gap-3">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-[#1A1B3A]">{entry.title || entry.activity_type}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{entry.created_by}</span>
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {relativeTime(entry.created_at)}
                  </span>
                </div>
                {entry.body && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{entry.body}</p>}
              </div>
            </div>
          );
        })}
        {entries.length === 0 && !loading && (
          <div className="px-6 py-12 text-center text-gray-400 text-sm">No activity yet</div>
        )}
      </div>

      {/* Load More */}
      {hasMore && entries.length > 0 && (
        <div className="px-6 py-3 border-t border-gray-50 flex justify-center">
          <button
            onClick={() => { const next = page + 1; setPage(next); fetchEntries(next, true); }}
            disabled={loading}
            className="text-sm text-gray-500 hover:text-[var(--primary)] flex items-center gap-1 transition"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Load more
          </button>
        </div>
      )}
      {loading && entries.length === 0 && (
        <div className="px-6 py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-300" /></div>
      )}
    </div>
  );
}
