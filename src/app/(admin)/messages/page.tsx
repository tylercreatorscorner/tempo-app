'use client';

import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Users, Send } from 'lucide-react';
import { ConversationList, type Conversation, convKey } from '@/components/messages/conversation-list';
import { ChatThread } from '@/components/messages/chat-thread';
import { CreatorContextPanel } from '@/components/messages/creator-context-panel';
import { BulkMessageModal } from '@/components/messages/bulk-message-modal';
import { TestDmModal } from '@/components/messages/test-dm-modal';
import { BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [testDmOpen, setTestDmOpen] = useState(false);

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

  const activeKey = activeConv ? (activeConv.discord_user_id || `creator:${activeConv.creator_id}`) : null;

  const handleSelect = (conv: Conversation) => {
    setActiveConv(conv);
    setMobileShowThread(true);
    // Clear unread count locally
    setConversations(prev => prev.map(c => 
      convKey(c) === convKey(conv) ? { ...c, unread_count: 0 } : c
    ));
  };

  return (
    <div className="h-full flex flex-col -m-3 sm:-m-4 md:-m-6">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          {mobileShowThread && (
            <button
              onClick={() => setMobileShowThread(false)}
              className="md:hidden text-gray-500 hover:text-gray-700 mr-2"
            >
              ← Back
            </button>
          )}
          <MessageSquare className="h-5 w-5 text-pink-500" />
          <h1 className="text-lg font-semibold text-[#1A1B3A]">Messages</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTestDmOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <Send className="h-4 w-4" />
            Test DM
          </button>
          <button
            onClick={() => setBulkOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-br from-pink-500 to-purple-500 text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Users className="h-4 w-4" />
            Bulk Message
          </button>
        </div>
      </div>

      {/* Three-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel - conversation list */}
        <div className={`w-full md:w-80 md:flex-shrink-0 ${mobileShowThread ? 'hidden md:block' : 'block'}`}>
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="animate-spin h-6 w-6 border-2 border-pink-300 border-t-transparent rounded-full" />
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
              creatorId={activeConv.creator_id}
              creatorName={activeConv.creator_name}
              discordUserId={activeConv.discord_user_id}
              brandName={activeConv.brand ? (BRAND_DISPLAY_NAMES[activeConv.brand] || activeConv.brand) : undefined}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-[#F8F9FC]">
              <MessageSquare className="h-12 w-12 mb-4 opacity-30" />
              <p className="text-sm">Select a conversation to start messaging</p>
            </div>
          )}
        </div>

        {/* Right panel - creator context */}
        {activeConv && activeConv.creator_id > 0 && (
          <CreatorContextPanel creatorId={activeConv.creator_id} />
        )}
      </div>

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
