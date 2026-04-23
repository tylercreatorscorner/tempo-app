'use client';

import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Users, Send, ArrowRight, Bot } from 'lucide-react';
import Link from 'next/link';
import { ConversationList, type Conversation, convKey } from '@/components/messages/conversation-list';
import { ChatThread } from '@/components/messages/chat-thread';
import { CreatorContextPanel } from '@/components/messages/creator-context-panel';
import { BulkMessageModal } from '@/components/messages/bulk-message-modal';
import { TestDmModal } from '@/components/messages/test-dm-modal';
import { BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import { useTenant } from '@/hooks/use-tenant';

function MessagesSetup() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
      <div className="max-w-lg w-full text-center space-y-8">
        <div className="inline-flex h-20 w-20 rounded-3xl bg-gradient-to-br from-[#5865F2] to-[#7C5CFC] items-center justify-center mx-auto shadow-xl shadow-[#5865F2]/20">
          <Bot className="h-10 w-10 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Connect Discord to Message Creators</h2>
          <p className="text-gray-500 mt-2 max-w-md mx-auto">
            Tempo's messaging relay lets you DM creators directly from your dashboard through the Tempo Discord bot.
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-3">
          {[
            { step: '1', label: 'Connect Discord in Settings', desc: 'Add your Discord server details' },
            { step: '2', label: 'Add Tempo Bot to your server', desc: 'Invite the bot so it can relay messages' },
            { step: '3', label: 'Start messaging creators', desc: 'Send DMs and bulk messages from Tempo' },
          ].map(s => (
            <div key={s.step} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 bg-gray-50/50 text-left">
              <span className="h-8 w-8 rounded-full bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                {s.step}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{s.label}</p>
                <p className="text-xs text-gray-500">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white font-medium text-sm hover:opacity-90 transition-opacity"
        >
          Go to Settings
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function MessagesEmpty() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
      <MessageSquare className="h-16 w-16 text-gray-200 mb-4" />
      <h2 className="text-lg font-semibold text-gray-700 mb-2">No conversations yet</h2>
      <p className="text-gray-400 text-sm max-w-sm">
        Send a message to a creator from their profile, or use the Bulk Message button above to reach multiple creators at once.
      </p>
    </div>
  );
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [testDmOpen, setTestDmOpen] = useState(false);
  // Draft injected from context panel → chat thread. Cleared by thread after consuming.
  const [draftToInject, setDraftToInject] = useState<string | null>(null);
  const { tenant } = useTenant();

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/messages/conversations');
      const data = await res.json();
      setConversations(data.conversations ?? []);
    } catch {
      // Table may not exist yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const activeKey = activeConv ? convKey(activeConv) : null;

  const handleSelect = (conv: Conversation) => {
    setActiveConv(conv);
    setMobileShowThread(true);
    // Clear unread count locally
    setConversations(prev => prev.map(c => 
      convKey(c) === convKey(conv) ? { ...c, unread_count: 0 } : c
    ));
  };

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  return (
    <div className="flex flex-col -m-3 sm:-m-4 md:-m-6" style={{ height: 'calc(100vh - 57px)' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-3">
          {mobileShowThread && (
            <button
              onClick={() => setMobileShowThread(false)}
              className="md:hidden text-gray-500 hover:text-gray-700 mr-2"
            >
              ← Back
            </button>
          )}
          <MessageSquare className="h-5 w-5 text-[#E91E8C]" />
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-[#1A1B3A]">Messages</h1>
            {totalUnread > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#E91E8C] text-white text-[10px] font-bold">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTestDmOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <Send className="h-4 w-4" />
            Test DM
          </button>
          <button
            onClick={() => setBulkOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#E91E8C] text-white text-sm font-semibold hover:bg-[#d1177d] transition-colors shadow-sm"
          >
            <Users className="h-4 w-4" />
            Bulk Message
          </button>
        </div>
      </div>

      {/* Content */}
      {!loading && !tenant?.discord_connected && conversations.length === 0 ? (
        <MessagesSetup />
      ) : !loading && conversations.length === 0 ? (
        <MessagesEmpty />
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Left panel - conversation list */}
          <div className={`w-full md:w-80 md:flex-shrink-0 ${mobileShowThread ? 'hidden md:block' : 'block'}`}>
            {loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
                    <div className="h-10 w-10 rounded-full bg-gray-100 animate-pulse" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-3/5 rounded bg-gray-100 animate-pulse" />
                      <div className="h-2.5 w-4/5 rounded bg-gray-100 animate-pulse" />
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

          {/* Center panel - chat thread */}
          <div className={`flex-1 ${mobileShowThread ? 'block' : 'hidden md:block'}`}>
            {activeConv ? (
              <ChatThread
                key={activeConv.creator_id}
                creatorId={activeConv.creator_id}
                creatorName={activeConv.creator_name}
                discordUserId={activeConv.discord_user_id}
                brandName={activeConv.brand ? (BRAND_DISPLAY_NAMES[activeConv.brand] || activeConv.brand) : undefined}
                postCount={activeConv.total_videos_7d}
                gmv={activeConv.total_gmv_7d}
                draftToInject={draftToInject}
                onDraftConsumed={() => setDraftToInject(null)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-[#F8F9FC] px-4 text-center">
                <MessageSquare className="h-12 w-12 mb-4 opacity-30" />
                <p className="text-sm font-medium text-gray-500">Select a conversation</p>
                <p className="text-xs text-gray-400 mt-1">Or start a new one with the Bulk Message button above</p>
              </div>
            )}
          </div>

          {/* Right panel - creator context */}
          {activeConv && activeConv.creator_id > 0 && (
            <CreatorContextPanel
              creatorId={activeConv.creator_id}
              topic={activeConv.latest_topic ?? null}
              onDraftReply={setDraftToInject}
            />
          )}
        </div>
      )}

      {/* Bulk message modal */}
      <BulkMessageModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
      />

      {/* Test DM modal */}
      <TestDmModal
        open={testDmOpen}
        onClose={() => { setTestDmOpen(false); fetchConversations(); }}
      />
    </div>
  );
}
