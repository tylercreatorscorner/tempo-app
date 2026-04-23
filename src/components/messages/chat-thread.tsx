'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Check, CheckCheck, X, Loader2, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChannelIcon } from './channel-icon';
import { TemplateSidebar } from './template-sidebar';
import { getChannelConfig } from '@/lib/messages/channels';
import { TOPIC_LABELS, TOPIC_COLORS, type MessageTopic } from '@/lib/messages/classify-topic';

interface Message {
  id: string;
  direction: string;
  channel: string;
  content: string;
  status: string;
  sent_at: string;
  sent_by: string | null;
  topic?: string | null;
}

interface Props {
  creatorId: number;
  creatorName: string;
  discordUserId?: string | null;
  brandName?: string;
  postCount?: number;
  gmv?: number;
  /** Draft text pushed from another component (e.g. context panel) to populate the compose box. */
  draftToInject?: string | null;
  /** Called after the draft is consumed so the parent can reset it to null. */
  onDraftConsumed?: () => void;
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

export function ChatThread({
  creatorId, creatorName, discordUserId, brandName, postCount, gmv,
  draftToInject, onDraftConsumed,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const markAsRead = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (discordUserId) params.set('discord_user_id', discordUserId);
      await fetch(`/api/messages/${creatorId}/mark-read?${params}`, { method: 'POST' });
    } catch {/* non-critical */}
  }, [creatorId, discordUserId]);

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
      // Table may not exist yet
    } finally {
      setLoading(false);
    }
  }, [creatorId, discordUserId]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    fetchMessages(1);
    markAsRead(); // Mark thread as read as soon as it opens
  }, [creatorId, fetchMessages, markAsRead]);

  // Consume drafts pushed from the context panel
  useEffect(() => {
    if (draftToInject) {
      setInput(draftToInject);
      onDraftConsumed?.();
    }
  }, [draftToInject, onDraftConsumed]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Poll every 10s when tab is visible; pause when hidden to save API calls.
  // Mark-as-read is re-called whenever new inbound messages arrive so the unread
  // badge clears even when the user stays in the thread.
  useEffect(() => {
    let lastMessageId: string | null = null;

    const tick = async () => {
      if (document.hidden) return;
      try {
        const params = new URLSearchParams({ page: '1' });
        if (discordUserId) params.set('discord_user_id', discordUserId);
        const res = await fetch(`/api/messages/${creatorId}?${params}`);
        const data = await res.json();
        const newMessages = data.messages as Message[];
        const latestId = newMessages[newMessages.length - 1]?.id ?? null;
        if (latestId !== lastMessageId) {
          lastMessageId = latestId;
          setMessages(newMessages);
          // New inbound message(s) arrived while viewing — re-mark as read
          if (newMessages.some(m => m.direction === 'inbound')) markAsRead();
        }
      } catch {/* non-critical */}
    };

    const interval = setInterval(tick, 10000);
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [creatorId, discordUserId, markAsRead]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput('');

    const tempMsg: Message = {
      id: `temp-${Date.now()}`,
      direction: 'outbound',
      channel: 'dm',
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

  const sendChannel = discordUserId ? 'dm' : 'dm';
  const channelConfig = getChannelConfig(sendChannel);

  return (
    <div className="flex flex-col h-full bg-[#F8F9FC]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-[#1A1B3A]">{creatorName}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-400">Creator #{creatorId}</span>
            {discordUserId && (
              <span className="inline-flex items-center gap-1 text-[10px] text-[#5865F2] font-medium">
                <ChannelIcon channel="dm" size="sm" />
                Discord connected
              </span>
            )}
          </div>
        </div>
        <TemplateSidebar
          creatorName={creatorName}
          brandName={brandName}
          postCount={postCount}
          gmv={gmv}
          onSelect={(content) => setInput(content)}
        />
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
                'flex flex-col',
                msg.direction === 'outbound' ? 'items-end' : 'items-start'
              )}
            >
              {/* Topic pill on inbound messages */}
              {msg.direction === 'inbound' && msg.topic && msg.topic !== 'other' && (
                <span className={cn(
                  'text-[10px] font-semibold px-2 py-0.5 rounded-full mb-1',
                  TOPIC_COLORS[msg.topic as MessageTopic]?.bg,
                  TOPIC_COLORS[msg.topic as MessageTopic]?.fg
                )}>
                  {TOPIC_LABELS[msg.topic as MessageTopic]}
                </span>
              )}
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
                  'flex items-center gap-1.5 mt-1',
                  msg.direction === 'outbound' ? 'justify-end' : 'justify-start'
                )}>
                  {/* Channel indicator */}
                  {msg.channel && (
                    <ChannelIcon
                      channel={msg.channel}
                      size="sm"
                      className={msg.direction === 'outbound' ? 'opacity-70' : 'opacity-50'}
                    />
                  )}
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
        {/* Channel indicator */}
        <div className="flex items-center gap-1.5 mb-2">
          <ChannelIcon channel={sendChannel} size="sm" showLabel />
          <span className="text-[10px] text-gray-400">
            Sending via {channelConfig.label}
          </span>
        </div>
        <div className="flex items-end gap-3">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Ctrl+Enter to send)"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent transition-all"
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
