'use client';

import { useState } from 'react';
import { Search, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChannelBadge } from './channel-icon';
import { getBrandColor, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';

export interface Conversation {
  creator_id: number;
  creator_name: string;
  discord_user_id: string | null;
  last_message: string;
  last_message_at: string;
  direction: string;
  unread_count: number;
  message_count?: number;
  channel?: string;
  brand?: string;
}

/** Unique key for a conversation */
export function convKey(conv: Conversation): string {
  return conv.discord_user_id || `creator:${conv.creator_id}`;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

interface Props {
  conversations: Conversation[];
  activeKey: string | null;
  onSelect: (conv: Conversation) => void;
}

export function ConversationList({ conversations, activeKey, onSelect }: Props) {
  const [search, setSearch] = useState('');

  const filtered = conversations.filter(c =>
    c.creator_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-white/80 backdrop-blur-sm border-r border-gray-200">
      {/* Search */}
      <div className="p-4 border-b border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search creators..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent transition-all"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 px-6">
            <MessageSquare className="h-10 w-10 mb-3 opacity-50" />
            <p className="text-sm text-center">No conversations yet.<br />Start a conversation with a creator.</p>
          </div>
        ) : (
          filtered.map(conv => {
            const isActive = activeKey === convKey(conv);
            return (
              <button
                key={convKey(conv)}
                onClick={() => onSelect(conv)}
                className={cn(
                  'w-full text-left px-4 py-3.5 border-b border-gray-50 transition-all hover:bg-gray-50/80',
                  isActive && 'bg-pink-50/80 border-l-2 border-l-pink-400 hover:bg-pink-50'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Avatar initial */}
                    <div
                      className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                      style={{
                        backgroundColor: conv.brand ? getBrandColor(conv.brand) : '#7C5CFC',
                      }}
                    >
                      {conv.creator_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium text-sm text-[#1A1B3A] truncate block">
                        {conv.creator_name}
                      </span>
                      {conv.brand && (
                        <span
                          className="text-[10px] font-medium"
                          style={{ color: getBrandColor(conv.brand) }}
                        >
                          {BRAND_DISPLAY_NAMES[conv.brand] || conv.brand}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-2">
                    <span className="text-[10px] text-gray-400 whitespace-nowrap">
                      {relativeTime(conv.last_message_at)}
                    </span>
                    {conv.unread_count > 0 && (
                      <span className="bg-pink-500 text-white text-[10px] rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center font-medium">
                        {conv.unread_count > 9 ? '9+' : conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-10">
                  {conv.channel && <ChannelBadge channel={conv.channel} />}
                  <p className="text-xs text-gray-500 truncate">
                    {conv.direction === 'outbound' ? 'You: ' : ''}{conv.last_message.slice(0, 40)}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
