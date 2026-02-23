'use client';

import { useState } from 'react';
import { X, Send, Loader2, CheckSquare, Square } from 'lucide-react';
import type { Conversation } from './conversation-list';

interface Props {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
}

export function BulkMessageModal({ open, onClose, conversations }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  if (!open) return null;

  const filtered = conversations.filter(c =>
    c.creator_name.toLowerCase().includes(filter.toLowerCase())
  );

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(c => c.creator_id)));
    }
  };

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const handleSend = async () => {
    if (!content.trim() || selected.size === 0) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/messages/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatorIds: [...selected], content: content.trim() }),
      });
      const data = await res.json();
      setResult(`✓ ${data.queued} messages queued`);
      setContent('');
      setSelected(new Set());
    } catch {
      setResult('Failed to send bulk messages');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-[#1A1B3A]">Bulk Message</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Creator selection */}
        <div className="px-6 py-3 border-b border-gray-100">
          <input
            type="text"
            placeholder="Filter creators..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-300"
          />
          <button onClick={toggleAll} className="mt-2 text-xs text-pink-500 hover:text-pink-700 flex items-center gap-1">
            {selected.size === filtered.length ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />}
            {selected.size === filtered.length ? 'Deselect all' : 'Select all'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-2 max-h-48">
          {filtered.map(c => (
            <label key={c.creator_id} className="flex items-center gap-2 py-1.5 text-sm cursor-pointer hover:bg-gray-50 px-2 rounded">
              <input
                type="checkbox"
                checked={selected.has(c.creator_id)}
                onChange={() => toggle(c.creator_id)}
                className="accent-pink-500"
              />
              <span className="text-[#1A1B3A]">{c.creator_name}</span>
            </label>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No creators found</p>
          )}
        </div>

        {/* Message compose */}
        <div className="px-6 py-3 border-t border-gray-100">
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Type your message..."
            rows={3}
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-gray-400">
              {selected.size} creator{selected.size !== 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2">
              {result && <span className="text-xs text-green-600">{result}</span>}
              <button
                onClick={handleSend}
                disabled={!content.trim() || selected.size === 0 || sending}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-br from-pink-500 to-purple-500 text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send to {selected.size}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
