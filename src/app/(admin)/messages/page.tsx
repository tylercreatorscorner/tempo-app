'use client';

/**
 * /messages — the Comms hub. One place to talk to the roster:
 *
 *   Broadcasts — send to a SEGMENT with live per-channel reachability
 *                (feed + compose, same pattern as the Reporting outbox)
 *   Inbox      — the working 3-pane DM inbox, plus the pipeline health banner
 *   Templates  — starter broadcast templates (read-only in Phase A)
 *
 * Tabs are URL-driven (?tab=broadcasts|inbox|templates) so views deep-link.
 * Conversations load at page level so the Inbox unread badge is live on every
 * tab. The Broadcasts tab stays mounted (hidden) across tab switches so a
 * half-written compose never gets thrown away.
 *
 * The fake bulk path (BulkMessageModal + /api/messages/bulk) is DELETED —
 * it wrote 'sent' rows without delivering anything. Broadcasts replace it
 * with real, consent-checked, per-creator-logged sends.
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { SegmentedControl } from '@/components/ui/segmented';
import { BroadcastsTab } from '@/components/messages/broadcasts-tab';
import { InboxTab } from '@/components/messages/inbox-tab';
import { TemplatesTab } from '@/components/messages/templates-tab';
import type { Conversation } from '@/components/messages/conversation-list';
import { convKey } from '@/components/messages/conversation-list';
import HubLoading from './loading';

type Tab = 'broadcasts' | 'inbox' | 'templates';

const TAB_META: Record<Tab, { title: string; subtitle: string }> = {
  broadcasts: {
    title: 'Broadcasts',
    subtitle: 'Message a segment. Every send is consent-checked, rate-limited, and logged per creator.',
  },
  inbox: {
    title: 'Inbox',
    subtitle: 'One thread per creator. Broadcast messages land in each thread, tagged with their channel.',
  },
  templates: {
    title: 'Templates',
    subtitle: 'Reusable message starters with personalization tokens.',
  },
};

function parseTab(raw: string | null): Tab {
  return raw === 'inbox' || raw === 'templates' ? raw : 'broadcasts';
}

function CommsHub() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));

  const setTab = useCallback(
    (next: Tab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'broadcasts') params.delete('tab');
      else params.set('tab', next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // ── Conversations (page-level so the unread badge is live on every tab) ──
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [convFailed, setConvFailed] = useState(false);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/messages/conversations');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConversations((data.conversations ?? []) as Conversation[]);
      setConvFailed(false);
    } catch {
      setConvFailed(true);
    } finally {
      setConvLoading(false);
    }
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  const markReadLocal = useCallback((key: string) => {
    setConversations((prev) => prev.map((c) => (convKey(c) === key ? { ...c, unread_count: 0 } : c)));
  }, []);

  // Template pushed from the Templates tab into the compose panel.
  const [templateToLoad, setTemplateToLoad] = useState<string | null>(null);
  const useTemplate = useCallback((key: string) => {
    setTemplateToLoad(key);
    setTab('broadcasts');
  }, [setTab]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Comms"
        title={TAB_META[tab].title}
        subtitle={TAB_META[tab].subtitle}
      />

      <SegmentedControl<Tab>
        ariaLabel="Comms views"
        options={[
          { value: 'broadcasts', label: 'Broadcasts' },
          {
            value: 'inbox',
            label: (
              <span className="inline-flex items-center gap-1.5">
                Inbox
                {totalUnread > 0 && (
                  <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--primary)] px-1 text-[10px] font-bold text-white">
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </span>
            ),
          },
          { value: 'templates', label: 'Templates' },
        ]}
        value={tab}
        onValueChange={setTab}
      />

      {/* Broadcasts stays mounted so compose state survives tab switches;
          its live poll pauses via `visible`. Inbox/Templates mount on demand
          (a hidden inbox would keep polling its open thread). */}
      <div className={tab === 'broadcasts' ? undefined : 'hidden'}>
        <BroadcastsTab
          visible={tab === 'broadcasts'}
          templateToLoad={templateToLoad}
          onTemplateConsumed={() => setTemplateToLoad(null)}
        />
      </div>

      {tab === 'inbox' && (
        <InboxTab
          conversations={conversations}
          loading={convLoading}
          loadFailed={convFailed}
          onRetry={() => { setConvLoading(true); fetchConversations(); }}
          onMarkReadLocal={markReadLocal}
        />
      )}

      {tab === 'templates' && <TemplatesTab onUse={useTemplate} />}
    </div>
  );
}

export default function MessagesPage() {
  // useSearchParams needs a Suspense boundary; the fallback mirrors loading.tsx.
  return (
    <Suspense fallback={<HubLoading />}>
      <CommsHub />
    </Suspense>
  );
}
