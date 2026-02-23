'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Check, CheckCheck, X, Loader2, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@supabase/supabase-js';

interface Message {
  id: string;
  direction: string;
  content: string;
  status: string;
  sent_at: string;
  sent_by: string | null;
}

interface Props {
  creatorId: number;
  creatorName: string;
  discordUserId?: string | null;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'sent': return <Check className="h-3 w-3 text-gray-400" />;
    case 'delivered': return <CheckCheck className="h-3 w-3 text-pink-400" />;
    case 'failed': return <X className="h-3 w-3 text-red-400" />;
    case 'blocked': return <X className="h-3 w-3 text-orange-400" />;
    default: return <Loader2 className="h-3 w-3 text-gray-300 animate-spin" />;
  }
}

export function ChatThread({ creatorId, creatorName, discordUserId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async (p: number, append = false) => {
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (discordUserId) params.set('discord_user_id', discordUserId);
      const res = await fetch(`/api/messages/${creatorId}?${params}`);
      const data = await res.json();
      setMessages(prev => append ? [...data.messages, ...prev] : data.messages);
      setHasMore(data.hasMore);
      setPage(p);
    } catch {
      // Table may not exist yet — show empty state
    } finally {
      setLoading(false);
    }
  }, [creatorId, discordUserId]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    fetchMessages(1);
  }, [creatorId, fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Supabase Realtime — live message updates
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    const supabase = createClient(url, key);

    // Build filter based on what we have
    const filter = discordUserId
      ? `discord_user_id=eq.${discordUserId}`
      : `creator_id=eq.${creatorId}`;

    const channel = supabase
      .channel(`messages-${discordUserId || creatorId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'creator_messages', filter },
        (payload) => {
          const newMsg = payload.new as Message;
          // Avoid duplicates (optimistic updates)
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [creatorId, discordUserId]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;

    setSending(true);
    setInput('');

    // Optimistic update
    const tempMsg: Message = {
      id: `temp-${Date.now()}`,
      direction: 'outbound',
      content,
      status: 'pending',
      sent_at: new Date().toISOString(),
      sent_by: 'admin',
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      const res = await fetch(`/api/messages/${creatorId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (data.message) {
        setMessages(prev => prev.map(m => m.id === tempMsg.id ? data.message : m));
      }
    } catch {
      setMessages(prev => prev.map(m => m.id === tempMsg.id ? { ...m, status: 'failed' } : m));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full bg-[#F8F9FC]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
        <h2 className="font-semibold text-[#1A1B3A]">{creatorName}</h2>
        <p className="text-xs text-gray-400">Creator #{creatorId}</p>
      </div>

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {hasMore && (
          <button
            onClick={() => fetchMessages(page + 1, true)}
            className="mx-auto flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 py-2"
          >
            <ChevronUp className="h-3 w-3" /> Load more
          </button>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 text-pink-400 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            No messages yet. Send a message to start the conversation.
          </div>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              className={cn(
                'flex',
                msg.direction === 'outbound' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={cn(
                  'max-w-[70%] rounded-2xl px-4 py-2.5 text-sm shadow-sm',
                  msg.direction === 'outbound'
                    ? 'bg-gradient-to-br from-pink-500 to-purple-500 text-white rounded-br-md'
                    : 'bg-white text-[#1A1B3A] border border-gray-100 rounded-bl-md'
                )}
              >
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                <div className={cn(
                  'flex items-center gap-1 mt-1',
                  msg.direction === 'outbound' ? 'justify-end' : 'justify-start'
                )}>
                  <span className={cn('text-[10px]', msg.direction === 'outbound' ? 'text-white/70' : 'text-gray-400')}>
                    {formatTime(msg.sent_at)}
                  </span>
                  {msg.direction === 'outbound' && <StatusIcon status={msg.status} />}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <div className="px-6 py-4 border-t border-gray-200 bg-white">
        <div className="flex items-end gap-3">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Ctrl+Enter to send)"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent"
            style={{ minHeight: '40px', maxHeight: '120px' }}
            onInput={e => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = 'auto';
              t.style.height = Math.min(t.scrollHeight, 120) + 'px';
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-pink-500 to-purple-500 text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
