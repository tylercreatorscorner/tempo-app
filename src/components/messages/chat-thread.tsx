'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Check, CheckCheck, X, Loader2, ChevronUp, AlertTriangle } from 'lucide-react';
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
  /** Broadcast-originated messages carry the broadcast id here. */
  metadata?: { broadcast_id?: string } | null;
}

/** Channel tag inside a bubble. Tone flips with the bubble background:
 *  outbound sits on the accent gradient, inbound on the card surface. */
function BubbleChip({ outbound, children }: { outbound: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1 py-px text-[9px] font-bold uppercase tracking-[0.06em] leading-none',
        outbound ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary',
      )}
    >
      {children}
    </span>
  );
}

interface Props {
  creatorId: number | string;
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
    case 'sent': return <Check className="h-3 w-3 text-muted-foreground" />;
    case 'delivered': return <CheckCheck className="h-3 w-3 text-primary" />;
    case 'failed': return <X className="h-3 w-3 text-red-400" />;
    case 'blocked': return <X className="h-3 w-3 text-orange-400" />;
    case 'unknown': return <AlertTriangle className="h-3 w-3 text-orange-400" />;
    default: return <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />;
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
  const [loadError, setLoadError] = useState('');
  const [sendError, setSendError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
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
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (discordUserId) params.set('discord_user_id', discordUserId);
      const res = await fetch(`/api/messages/${creatorId}?${params}`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.messages)) throw new Error(data.error || 'Could not load messages.');
      setMessages(prev => append ? [...data.messages.filter((message: Message) => !prev.some(existing => existing.id === message.id)), ...prev] : data.messages);
      setHasMore(data.hasMore);
      setPage(p);
      setLoadError('');
    } catch {
      setLoadError('Could not load messages. Please retry.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
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
        if (!res.ok || !Array.isArray(data.messages)) throw new Error('Could not refresh messages.');
        const newMessages = data.messages as Message[];
        setLoadError('');
        if (page === 1) setHasMore(Boolean(data.hasMore));
        const latestId = newMessages[newMessages.length - 1]?.id ?? null;
        if (latestId !== lastMessageId) {
          lastMessageId = latestId;
          setMessages(previous => {
            const latest = new Map(newMessages.map(message => [message.id, message]));
            return [...previous.filter(message => !latest.has(message.id)), ...newMessages]
              .sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at));
          });
          // New inbound message(s) arrived while viewing — re-mark as read
          if (newMessages.some(m => m.direction === 'inbound')) markAsRead();
        }
      } catch { setLoadError('Could not refresh messages. Showing the last loaded conversation.'); }
    };

    const interval = setInterval(tick, 10000);
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [creatorId, discordUserId, markAsRead, page]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setSendError('');

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
      if (!res.ok || !data.message) throw new Error('Delivery could not be confirmed. Check the conversation before retrying.');
      // A poll can observe the saved message before this response arrives.
      setMessages(prev => [...prev.filter(m => m.id !== tempMsg.id && m.id !== data.message.id), data.message]
        .sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at)));
      if (['failed', 'blocked'].includes(data.message.status)) {
        setSendError('The message was not delivered. Your draft is preserved.');
      } else {
        setInput('');
        if (typeof data.warning === 'string') setSendError(data.warning);
      }
    } catch {
      setMessages(prev => prev.map(m => m.id === tempMsg.id ? { ...m, status: 'unknown' } : m));
      setSendError('Delivery could not be confirmed. Your draft is preserved. Check the conversation before retrying.');
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
    <div className="flex flex-col h-full bg-[var(--background)]">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-border bg-card flex flex-wrap gap-2 items-center justify-between">
        <div className="min-w-0">
          <h2 className="font-semibold text-[var(--foreground)]">{creatorName}</h2>
          <div className="flex flex-wrap items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground">Creator #{creatorId}</span>
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
      <div ref={containerRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
        {loadError && <div role="alert" className="text-sm text-destructive space-y-2"><p>{loadError}</p><button className="underline" onClick={() => void fetchMessages(page, page > 1)} disabled={loading || loadingMore}>Retry loading messages</button></div>}
        {hasMore && (
          <button
            onClick={() => fetchMessages(page + 1, true)}
            disabled={loadingMore}
            className="mx-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-muted-foreground py-2"
          >
            <ChevronUp className="h-3 w-3" /> {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
          </div>
        ) : messages.length === 0 && !loadError ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
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
                  'max-w-[90%] sm:max-w-[70%] min-w-0 rounded-2xl px-4 py-2.5 text-sm shadow-sm',
                  msg.direction === 'outbound'
                    ? 'bg-gradient-to-br from-primary to-purple-500 text-white rounded-br-md'
                    : 'bg-card text-[var(--foreground)] border border-border rounded-bl-md'
                )}
              >
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                <div className={cn(
                  'flex flex-wrap items-center gap-1.5 mt-1',
                  msg.direction === 'outbound' ? 'justify-end' : 'justify-start'
                )}>
                  {/* Channel chip (all 'dm' today; SMS/Email thread in later) */}
                  {msg.channel && (
                    <BubbleChip outbound={msg.direction === 'outbound'}>
                      {msg.channel === 'dm' || msg.channel === 'discord_dm' ? 'DM' : msg.channel}
                    </BubbleChip>
                  )}
                  {msg.metadata?.broadcast_id && (
                    <BubbleChip outbound={msg.direction === 'outbound'}>Broadcast</BubbleChip>
                  )}
                  <span className={cn('text-[10px]', msg.direction === 'outbound' ? 'text-white/70' : 'text-muted-foreground')}>
                    {formatTime(msg.sent_at)}
                  </span>
                  {msg.direction === 'outbound' && <span aria-label={`Delivery status: ${msg.status}`} title={`Delivery status: ${msg.status}`}><StatusIcon status={msg.status} /></span>}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <div className="px-4 sm:px-6 py-4 border-t border-border bg-card">
        {sendError && <p role="alert" className="mb-2 text-sm text-destructive">{sendError}</p>}
        {/* Channel indicator */}
        <div className="flex items-center gap-1.5 mb-2">
          <ChannelIcon channel={sendChannel} size="sm" showLabel />
          <span className="text-[10px] text-muted-foreground">
            Sending via {channelConfig.label}
          </span>
        </div>
        <div className="flex items-end gap-3">
          <textarea
            value={input}
            disabled={sending}
            aria-label={`Message ${creatorName}`}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Ctrl+Enter to send)"
            rows={1}
            className="min-w-0 flex-1 resize-none rounded-xl border border-border px-4 py-2.5 text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-transparent transition-all"
            style={{ minHeight: '40px', maxHeight: '120px' }}
            onInput={e => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = 'auto';
              t.style.height = Math.min(t.scrollHeight, 120) + 'px';
            }}
          />
          <button
            onClick={handleSend}
            aria-label="Send message"
            disabled={!input.trim() || sending}
            className="flex shrink-0 items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-purple-500 text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
