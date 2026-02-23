'use client';

import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Users } from 'lucide-react';
import { ConversationList, type Conversation } from '@/components/messages/conversation-list';
import { ChatThread } from '@/components/messages/chat-thread';
import { BulkMessageModal } from '@/components/messages/bulk-message-modal';

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeCreatorId, setActiveCreatorId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(false);

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

  const activeConv = conversations.find(c => c.creator_id === activeCreatorId);

  const handleSelect = (id: number) => {
    setActiveCreatorId(id);
    setMobileShowThread(true);
  };

  return (
    <div className="h-[calc(100vh-0px)] flex flex-col">
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
        <button
          onClick={() => setBulkOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-br from-pink-500 to-purple-500 text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Users className="h-4 w-4" />
          Bulk Message
        </button>
      </div>

      {/* Two-panel layout */}
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
              activeCreatorId={activeCreatorId}
              onSelect={handleSelect}
            />
          )}
        </div>

        {/* Right panel - chat thread */}
        <div className={`flex-1 ${mobileShowThread ? 'block' : 'hidden md:block'}`}>
          {activeCreatorId && activeConv ? (
            <ChatThread
              creatorId={activeCreatorId}
              creatorName={activeConv.creator_name}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-[#F8F9FC]">
              <MessageSquare className="h-12 w-12 mb-4 opacity-30" />
              <p className="text-sm">Select a conversation to start messaging</p>
            </div>
          )}
        </div>
      </div>

      {/* Bulk message modal */}
      <BulkMessageModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        conversations={conversations}
      />
    </div>
  );
}
