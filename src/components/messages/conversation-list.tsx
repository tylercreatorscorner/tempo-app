'use client';

import { useState, useMemo } from 'react';
import {
  Search,
  MessageSquare,
  SlidersHorizontal,
  ArrowUpDown,
  AlertCircle,
  DollarSign,
  Mail,
  WifiOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChannelBadge } from './channel-icon';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { useBrandList } from '@/hooks/use-brand-list';
import {
  STATUS_CONFIG,
  ALL_STATUSES,
  type CreatorStatus,
  getStatusInfo,
} from '@/lib/data/creator-status';
import { MESSAGE_TOPICS, TOPIC_LABELS, TOPIC_COLORS, type MessageTopic } from '@/lib/messages/classify-topic';

export interface Conversation {
  creator_id: number;
  creator_name: string;
  discord_user_id: string | null;
  tiktok_handle: string | null;
  brand: string | null;
  brands?: string[];
  retainer_amount: number | null;
  last_message: string | null;
  last_message_at: string | null;
  direction: string | null;
  unread_count: number;
  message_count: number;
  total_videos_7d: number;
  total_gmv_7d: number;
  status: string;
  discord_avatar: string | null;
  channel?: string;
  /** Topic of the most recent inbound message */
  latest_topic?: string | null;
  /** Topics of all currently-unread inbound messages */
  open_topics?: string[];
}

export function convKey(conv: Conversation): string {
  return conv.discord_user_id || `creator:${conv.creator_id}`;
}

/** "Needs attention" staleness: no message ever, or none in 7+ days.
 *  Module-level so the time read stays out of component render (purity rule). */
function isStaleConversation(lastMessageAt: string | null): boolean {
  if (!lastMessageAt) return true;
  return Date.now() - new Date(lastMessageAt).getTime() > 7 * 24 * 60 * 60 * 1000;
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

type SortOption =
  | 'last_messaged'
  | 'name_asc'
  | 'gmv_desc'
  | 'posts_desc'
  | 'retainer_desc'
  | 'status_worst';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'last_messaged', label: 'Last messaged' },
  { value: 'name_asc', label: 'Name (A-Z)' },
  { value: 'gmv_desc', label: 'GMV (highest)' },
  { value: 'posts_desc', label: 'Posts (most active)' },
  { value: 'retainer_desc', label: 'Retainer (highest)' },
  { value: 'status_worst', label: 'Status (worst first)' },
];

type QuickFilter = 'needs_attention' | 'top_retainer' | 'unread' | 'no_discord';

const STATUS_ORDER: Record<string, number> = {
  ghost: 0,
  behind: 1,
  at_risk: 2,
  on_track: 3,
  star: 4,
};

interface Props {
  conversations: Conversation[];
  activeKey: string | null;
  onSelect: (conv: Conversation) => void;
}

export function ConversationList({ conversations, activeKey, onSelect }: Props) {
  const { brands: brandOptions } = useBrandList();
  const brandMeta = useBrandMeta();
  const brandNameOf = (slug: string | null | undefined) =>
    (slug && brandOptions.find(b => b.slug === slug)?.name) || brandMeta.label(slug ?? '');
  const brandColorOf = (slug: string | null | undefined) =>
    (slug && brandOptions.find(b => b.slug === slug)?.color) || brandMeta.color(slug ?? '');

  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<CreatorStatus | null>(null);
  const [quickFilter, setQuickFilter] = useState<QuickFilter | null>(null);
  const [topicFilter, setTopicFilter] = useState<MessageTopic | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('last_messaged');
  const [sortOpen, setSortOpen] = useState(false);

  // Topic counts (only conversations with unread open topics)
  const topicCounts = useMemo(() => {
    const counts: Partial<Record<MessageTopic, number>> = {};
    for (const c of conversations) {
      if (!c.open_topics || c.open_topics.length === 0) continue;
      for (const t of c.open_topics) {
        counts[t as MessageTopic] = (counts[t as MessageTopic] ?? 0) + 1;
      }
    }
    return counts;
  }, [conversations]);

  const filtered = useMemo(() => {
    let items = [...conversations];

    // Search
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (c) =>
          c.creator_name.toLowerCase().includes(q) ||
          (c.tiktok_handle && c.tiktok_handle.toLowerCase().includes(q))
      );
    }

    // Brand
    if (brandFilter) {
      items = items.filter((c) => c.brands?.includes(brandFilter) || c.brand === brandFilter);
    }

    // Status
    if (statusFilter) {
      items = items.filter((c) => c.status === statusFilter);
    }

    // Topic — filter by the latest inbound topic OR any open (unread) topic on the convo
    if (topicFilter) {
      items = items.filter((c) =>
        c.latest_topic === topicFilter || (c.open_topics?.includes(topicFilter) ?? false)
      );
    }

    // Quick filters
    if (quickFilter === 'needs_attention') {
      items = items.filter((c) => {
        const isWorrying = c.status === 'ghost' || c.status === 'behind';
        return isWorrying && isStaleConversation(c.last_message_at);
      });
    } else if (quickFilter === 'top_retainer') {
      items = items.filter((c) => c.retainer_amount && c.retainer_amount > 0);
    } else if (quickFilter === 'unread') {
      items = items.filter((c) => c.unread_count > 0);
    } else if (quickFilter === 'no_discord') {
      items = items.filter((c) => !c.discord_user_id);
    }

    // Sort
    items.sort((a, b) => {
      switch (sortBy) {
        case 'last_messaged': {
          // Messaged creators first, then by time desc
          const aHas = a.last_message_at ? 1 : 0;
          const bHas = b.last_message_at ? 1 : 0;
          if (aHas !== bHas) return bHas - aHas;
          if (a.last_message_at && b.last_message_at) {
            return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
          }
          return a.creator_name.localeCompare(b.creator_name);
        }
        case 'name_asc':
          return a.creator_name.localeCompare(b.creator_name);
        case 'gmv_desc': {
          const diff = b.total_gmv_7d - a.total_gmv_7d;
          return diff !== 0 ? diff : a.creator_name.localeCompare(b.creator_name);
        }
        case 'posts_desc': {
          const diff = b.total_videos_7d - a.total_videos_7d;
          return diff !== 0 ? diff : a.creator_name.localeCompare(b.creator_name);
        }
        case 'retainer_desc': {
          const diff = (b.retainer_amount ?? 0) - (a.retainer_amount ?? 0);
          return diff !== 0 ? diff : a.creator_name.localeCompare(b.creator_name);
        }
        case 'status_worst': {
          const diff = (STATUS_ORDER[a.status] ?? 5) - (STATUS_ORDER[b.status] ?? 5);
          return diff !== 0 ? diff : a.creator_name.localeCompare(b.creator_name);
        }
        default:
          return 0;
      }
    });

    // For top_retainer, ensure sorted by retainer
    if (quickFilter === 'top_retainer') {
      items.sort((a, b) => (b.retainer_amount ?? 0) - (a.retainer_amount ?? 0));
    }

    return items;
  }, [conversations, search, brandFilter, statusFilter, quickFilter, topicFilter, sortBy]);

  const activeFiltersCount =
    (brandFilter ? 1 : 0) + (statusFilter ? 1 : 0) + (quickFilter ? 1 : 0) + (topicFilter ? 1 : 0);

  // Topic pills visible when there are any open topics in the inbox (actionable triage)
  const topicsWithCounts = MESSAGE_TOPICS.filter((t) => (topicCounts[t] ?? 0) > 0);

  return (
    <div className="flex flex-col h-full bg-card/80 backdrop-blur-sm border-r border-border">
      {/* Search + controls */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search creators..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-transparent transition-all"
            />
          </div>
          {/* Filter toggle */}
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={cn(
              'relative p-2.5 rounded-xl border transition-all',
              filtersOpen
                ? 'border-primary/20 bg-primary/10 text-primary'
                : 'border-border bg-muted text-muted-foreground hover:bg-muted'
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeFiltersCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-white text-[10px] flex items-center justify-center font-medium">
                {activeFiltersCount}
              </span>
            )}
          </button>
          {/* Sort dropdown */}
          <div className="relative">
            <button
              onClick={() => setSortOpen(!sortOpen)}
              className="p-2.5 rounded-xl border border-border bg-muted text-muted-foreground hover:bg-muted transition-all"
            >
              <ArrowUpDown className="h-4 w-4" />
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-card rounded-xl border border-border shadow-lg py-1 overflow-hidden">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setSortBy(opt.value);
                        setSortOpen(false);
                      }}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm transition-colors',
                        sortBy === opt.value
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-foreground hover:bg-muted'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Filters panel */}
        {filtersOpen && (
          <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Brand pills */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
                Brand
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setBrandFilter(null)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                    !brandFilter
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-muted-foreground hover:bg-secondary'
                  )}
                >
                  All
                </button>
                {brandOptions.map((b) => {
                  const color = b.color;
                  const isActive = brandFilter === b.slug;
                  return (
                    <button
                      key={b.slug}
                      onClick={() => setBrandFilter(isActive ? null : b.slug)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-medium transition-all border',
                        isActive ? 'text-white' : 'hover:opacity-80'
                      )}
                      style={{
                        backgroundColor: isActive ? color : `${color}15`,
                        borderColor: isActive ? color : `${color}30`,
                        color: isActive ? 'white' : color,
                      }}
                    >
                      {b.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Status pills */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
                Status
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setStatusFilter(null)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                    !statusFilter
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-muted-foreground hover:bg-secondary'
                  )}
                >
                  All
                </button>
                {ALL_STATUSES.map((s) => {
                  const info = getStatusInfo(s);
                  const isActive = statusFilter === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(isActive ? null : s)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-medium transition-all border'
                      )}
                      style={{
                        backgroundColor: isActive ? info.color : info.bgColor,
                        borderColor: isActive ? info.color : `${info.color}30`,
                        color: isActive ? 'white' : info.color,
                      }}
                    >
                      {info.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick filters */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
                Quick Filters
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  {
                    key: 'needs_attention' as QuickFilter,
                    label: 'Needs Attention',
                    icon: AlertCircle,
                    color: '#dc2626',
                  },
                  {
                    key: 'top_retainer' as QuickFilter,
                    label: 'Top Retainer',
                    icon: DollarSign,
                    color: '#059669',
                  },
                  {
                    key: 'unread' as QuickFilter,
                    label: 'Unread',
                    icon: Mail,
                    color: 'var(--primary)',
                  },
                  {
                    key: 'no_discord' as QuickFilter,
                    label: 'No Discord',
                    icon: WifiOff,
                    color: 'var(--muted-foreground)',
                  },
                ].map(({ key, label, icon: Icon, color }) => {
                  const isActive = quickFilter === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setQuickFilter(isActive ? null : key)}
                      className={cn(
                        'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border'
                      )}
                      style={{
                        backgroundColor: isActive ? color : `${color}10`,
                        borderColor: isActive ? color : `${color}25`,
                        color: isActive ? 'white' : color,
                      }}
                    >
                      <Icon className="h-3 w-3" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Results count */}
        <p className="text-[11px] text-muted-foreground">
          {filtered.length} creator{filtered.length !== 1 ? 's' : ''}
          {activeFiltersCount > 0 && (
            <button
              onClick={() => {
                setBrandFilter(null);
                setStatusFilter(null);
                setQuickFilter(null);
              }}
              className="ml-2 text-primary hover:text-primary underline"
            >
              Clear filters
            </button>
          )}
        </p>
      </div>

      {/* Topic triage strip — only shows when there are unread messages with classified topics */}
      {topicsWithCounts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 py-2.5 border-b border-border bg-card">
          <button
            onClick={() => setTopicFilter(null)}
            className={cn(
              'text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors',
              topicFilter === null ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-secondary'
            )}
          >
            All
          </button>
          {topicsWithCounts.map((t) => {
            const active = topicFilter === t;
            const colors = TOPIC_COLORS[t];
            return (
              <button
                key={t}
                onClick={() => setTopicFilter(active ? null : t)}
                className={cn(
                  'inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors',
                  active ? 'bg-foreground text-background' : `${colors.bg} ${colors.fg} hover:ring-1 hover:ring-border`
                )}
              >
                {TOPIC_LABELS[t]}
                <span className={cn(
                  'text-[10px] font-bold px-1.5 rounded-full',
                  active ? 'bg-background/25 text-background' : 'bg-card/70 text-foreground'
                )}>{topicCounts[t]}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-6">
            <MessageSquare className="h-10 w-10 mb-3 opacity-50" />
            <p className="text-sm text-center">
              {activeFiltersCount > 0
                ? 'No creators match your filters.'
                : 'No creators found.'}
            </p>
          </div>
        ) : (
          filtered.map((conv) => {
            const isActive = activeKey === convKey(conv);
            const statusInfo = conv.status
              ? STATUS_CONFIG[conv.status as CreatorStatus]
              : null;

            return (
              <button
                key={convKey(conv)}
                onClick={() => onSelect(conv)}
                className={cn(
                  'w-full text-left px-4 py-3.5 border-b border-border transition-all hover:bg-muted/80',
                  isActive && 'bg-primary/10 border-l-2 border-l-primary hover:bg-primary/10'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      {conv.discord_avatar ? (
                        // Discord CDN avatar — next/image would need a
                        // remote-pattern config change; out of scope here.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={conv.discord_avatar}
                          alt=""
                          className="h-10 w-10 rounded-full border-2 border-border object-cover"
                        />
                      ) : (
                        <div
                          className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-semibold border-2 border-white shadow-sm"
                          style={{
                            backgroundColor: conv.brand
                              ? brandColorOf(conv.brand)
                              : 'var(--pulse-accent-2)',
                          }}
                        >
                          {conv.creator_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {/* Status dot */}
                      {statusInfo && (
                        <div
                          className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white"
                          style={{ backgroundColor: statusInfo.dotColor }}
                          title={statusInfo.label}
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium text-sm text-[var(--foreground)] truncate block">
                        {conv.creator_name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {conv.brands && conv.brands.length > 0 ? (
                          conv.brands.map(b => (
                            <span
                              key={b}
                              className="text-[10px] font-medium"
                              style={{ color: brandColorOf(b) }}
                            >
                              {brandNameOf(b)}
                            </span>
                          ))
                        ) : conv.brand ? (
                          <span
                            className="text-[10px] font-medium"
                            style={{ color: brandColorOf(conv.brand) }}
                          >
                            {brandNameOf(conv.brand)}
                          </span>
                        ) : null}
                        {sortBy === 'gmv_desc' && conv.total_gmv_7d > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            ${Math.round(conv.total_gmv_7d).toLocaleString()} GMV
                          </span>
                        )}
                        {sortBy === 'retainer_desc' && conv.retainer_amount != null && conv.retainer_amount > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            ${conv.retainer_amount.toLocaleString()} retainer
                          </span>
                        )}
                        {sortBy === 'posts_desc' && conv.total_videos_7d > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {conv.total_videos_7d} posts
                          </span>
                        )}
                        {sortBy !== 'gmv_desc' && sortBy !== 'retainer_desc' && sortBy !== 'posts_desc' && conv.total_videos_7d > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {conv.total_videos_7d} posts
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-2">
                    {conv.last_message_at ? (
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {relativeTime(conv.last_message_at)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">--</span>
                    )}
                    {conv.unread_count > 0 && (
                      <span className="bg-primary text-white text-[10px] rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center font-medium">
                        {conv.unread_count > 9 ? '9+' : conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-[52px]">
                  {conv.latest_topic && conv.latest_topic !== 'other' && conv.unread_count > 0 && (
                    <span className={cn(
                      'text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0',
                      TOPIC_COLORS[conv.latest_topic as MessageTopic]?.bg,
                      TOPIC_COLORS[conv.latest_topic as MessageTopic]?.fg
                    )}>
                      {TOPIC_LABELS[conv.latest_topic as MessageTopic]}
                    </span>
                  )}
                  {conv.last_message ? (
                    <>
                      {conv.channel && <ChannelBadge channel={conv.channel} />}
                      <p className="text-xs text-muted-foreground truncate">
                        {conv.direction === 'outbound' ? 'You: ' : ''}
                        {conv.last_message.slice(0, 40)}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No messages yet</p>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
