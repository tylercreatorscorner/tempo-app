'use client';

/**
 * Inbox tab — the working 3-pane DM inbox (conversation list / thread /
 * creator context), recomposed under the Comms hub inside a bounded-height
 * card. The existing API wiring (conversations / thread / send / mark-read /
 * context) is untouched.
 *
 * New here: the PIPELINE BANNER driven by GET /api/comms/health. The Discord
 * relay died silently in March and nothing surfaced it — this banner is the
 * fix: bot offline = loud warning; online-but-quiet = softer note; and a
 * failed health check says so instead of vanishing.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Bot, Info, MessageSquare, RotateCw } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ConversationList, type Conversation, convKey } from './conversation-list';
import { ChatThread } from './chat-thread';
import { CreatorContextPanel } from './creator-context-panel';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { useTenant } from '@/hooks/use-tenant';
import { relativeTimeAgo } from './comms-bits';

// ── Pipeline health banner ──────────────────────────────────────────
interface CommsHealth {
  botLastSeenAt: string | null;
  botOnline: boolean;
  latestMessageAt: string | null;
  inboundLast7d: number;
}

function PipelineBanner() {
  const [health, setHealth] = useState<CommsHealth | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/comms/health');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as CommsHealth;
        if (!cancelled) { setHealth(data); setFailed(false); }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (failed) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-[var(--pulse-warn-bg)] px-3.5 py-2.5 text-xs text-[var(--pulse-warn)]">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Couldn&apos;t check the Discord pipeline status. Inbound capture may or may not be working.</span>
      </div>
    );
  }
  if (!health) return null;

  if (!health.botOnline) {
    const lastSeen = health.botLastSeenAt ? relativeTimeAgo(health.botLastSeenAt) : 'never seen';
    return (
      <div className="flex items-start gap-2 rounded-lg border border-[var(--pulse-warn)]/25 bg-[var(--pulse-warn-bg)] px-3.5 py-2.5 text-xs">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--pulse-warn)]" />
        <span className="text-muted-foreground">
          <strong className="text-[var(--pulse-warn)]">The Discord bot looks offline</strong>
          {' - '}last seen {lastSeen}{' - '}inbound DMs are not being captured. Check the Railway service.
        </span>
      </div>
    );
  }

  if (health.inboundLast7d === 0) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-secondary px-3.5 py-2.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          The bot is online, but no creator DMs have come in for 7 days. If that seems wrong,
          check that the bot still shares a server with your creators.
        </span>
      </div>
    );
  }

  return null;
}

// ── Setup / empty states (kept from the old page, kit-toned) ────────
function InboxSetup() {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg space-y-6 text-center">
        <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-pulse-grad shadow-pulse-primary">
          <Bot className="h-8 w-8 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Connect Discord to message creators</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Tempo&apos;s messaging relay lets you DM creators directly from your dashboard through the Tempo Discord bot.
          </p>
        </div>
        <div className="space-y-2.5 rounded-xl border border-border bg-card p-5 text-left shadow-[var(--pulse-elev-1)]">
          {[
            { step: '1', label: 'Connect Discord in Settings', desc: 'Add your Discord server details' },
            { step: '2', label: 'Add the Tempo bot to your server', desc: 'Invite the bot so it can relay messages' },
            { step: '3', label: 'Start messaging creators', desc: 'DM threads and broadcasts land here' },
          ].map((s) => (
            <div key={s.step} className="flex items-center gap-3 rounded-lg border border-border bg-secondary/60 px-4 py-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pulse-grad text-xs font-bold text-white">
                {s.step}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 rounded-md bg-pulse-grad px-5 py-2.5 text-sm font-semibold text-white shadow-pulse-primary transition-[filter] hover:brightness-[1.07]"
        >
          Go to Settings
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

// ── Tab ─────────────────────────────────────────────────────────────
export function InboxTab({
  conversations,
  loading,
  loadFailed,
  onRetry,
  onMarkReadLocal,
}: {
  conversations: Conversation[];
  loading: boolean;
  /** Cold-load failure (nothing to show) — renders an error card, never fake-empty. */
  loadFailed: boolean;
  onRetry: () => void;
  /** Clears a conversation's unread count in the page-level state (badge). */
  onMarkReadLocal: (key: string) => void;
}) {
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [mobileShowThread, setMobileShowThread] = useState(false);
  // Draft injected from context panel into the chat thread's compose box.
  const [draftToInject, setDraftToInject] = useState<string | null>(null);
  const { tenant } = useTenant();
  const brandMeta = useBrandMeta();

  const activeKey = activeConv ? convKey(activeConv) : null;

  const handleSelect = (conv: Conversation) => {
    setActiveConv(conv);
    setMobileShowThread(true);
    onMarkReadLocal(convKey(conv));
  };

  if (!loading && loadFailed && conversations.length === 0) {
    return (
      <div className="space-y-3">
        <PipelineBanner />
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8 text-[var(--pulse-neg)]" />}
          title="Couldn't load the inbox"
          description="The conversation list didn't load. This is a fetch error, not an empty inbox."
          action={
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RotateCw />
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  if (!loading && !tenant?.discord_connected && conversations.length === 0) {
    return (
      <div className="space-y-3">
        <PipelineBanner />
        <Card className="overflow-hidden">
          <InboxSetup />
        </Card>
      </div>
    );
  }

  if (!loading && conversations.length === 0) {
    return (
      <div className="space-y-3">
        <PipelineBanner />
        <EmptyState
          icon={<MessageSquare className="h-8 w-8" />}
          title="No conversations yet"
          description="DM a creator from their profile, or send a broadcast - replies thread into the inbox here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PipelineBanner />

      {mobileShowThread && (
        <button
          onClick={() => setMobileShowThread(false)}
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:hidden"
        >
          &larr; Back to conversations
        </button>
      )}

      <Card className="flex h-[calc(100vh-300px)] min-h-[480px] overflow-hidden">
        {/* Left — conversation list */}
        <div className={cn('w-full md:w-80 md:shrink-0', mobileShowThread ? 'hidden md:block' : 'block')}>
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl p-3">
                  <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
                    <div className="h-2.5 w-4/5 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <ConversationList
              conversations={conversations}
              activeKey={activeKey}
              onSelect={handleSelect}
            />
          )}
        </div>

        {/* Center — chat thread */}
        <div className={cn('min-w-0 flex-1', mobileShowThread ? 'block' : 'hidden md:block')}>
          {activeConv ? (
            <ChatThread
              key={activeConv.creator_id}
              creatorId={activeConv.creator_id}
              creatorName={activeConv.creator_name}
              discordUserId={activeConv.discord_user_id}
              brandName={activeConv.brand ? brandMeta.label(activeConv.brand) : undefined}
              postCount={activeConv.total_videos_7d}
              gmv={activeConv.total_gmv_7d}
              draftToInject={draftToInject}
              onDraftConsumed={() => setDraftToInject(null)}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center bg-[var(--background)] px-4 text-center text-muted-foreground">
              <MessageSquare className="mb-4 h-12 w-12 opacity-30" />
              <p className="text-sm font-medium">Select a conversation</p>
              <p className="mt-1 text-xs">Or reach a whole segment from the Broadcasts tab</p>
            </div>
          )}
        </div>

        {/* Right — creator context */}
        {activeConv && activeConv.creator_id > 0 && (
          <CreatorContextPanel
            creatorId={activeConv.creator_id}
            topic={activeConv.latest_topic ?? null}
            onDraftReply={setDraftToInject}
          />
        )}
      </Card>
    </div>
  );
}
