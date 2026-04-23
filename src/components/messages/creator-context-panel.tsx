'use client';

import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, User, ExternalLink, DollarSign, Video, Calendar, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getBrandColor, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import { STATUS_CONFIG, type CreatorStatus } from '@/lib/data/creator-status';
import { TOPIC_LABELS, TOPIC_COLORS, type MessageTopic } from '@/lib/messages/classify-topic';

interface BrandBreakdown {
  brand: string;
  posts_7d: number;
  gmv_7d: number;
}

interface CreatorContext {
  id: number;
  real_name: string;
  tiktok_handle: string | null;
  brand: string;
  discord_id: string | null;
  retainer_amount: number | null;
  status: CreatorStatus;
  status_label: string;
  posts_7d: number;
  gmv_7d: number;
  last_active: string | null;
  brand_breakdown?: BrandBreakdown[];
}

interface Props {
  creatorId: number;
  /** Topic of the most recent inbound message — drives the Topic Context Card */
  topic?: string | null;
  /** Pushes a draft reply into the chat thread's compose box */
  onDraftReply?: (content: string) => void;
}

/**
 * Builds a topic-specific starter reply using available creator context.
 * Returns null if no useful template for this topic.
 */
function buildDraftReply(topic: MessageTopic, ctx: CreatorContext): string | null {
  const firstName = ctx.real_name.split(' ')[0];
  const gmv = ctx.gmv_7d > 0
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(ctx.gmv_7d)
    : '$0';
  const retainer = ctx.retainer_amount
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(ctx.retainer_amount)
    : null;
  const brand = BRAND_DISPLAY_NAMES[ctx.brand] || ctx.brand;

  switch (topic) {
    case 'payment':
      return retainer
        ? `Hey ${firstName}! Your ${brand} retainer is ${retainer}/mo. Let me check where you're at in the payment cycle and I'll get back to you shortly.`
        : `Hey ${firstName}! Let me look into your payment status and get back to you ASAP.`;
    case 'sample':
      return `Hey ${firstName}! Let me pull up your sample shipment and send you the tracking — one sec.`;
    case 'campaign':
      return `Hey ${firstName}! Thanks for reaching out. Which campaign are you asking about specifically — is this about ${brand} or another program?`;
    case 'ban':
      return `Hey ${firstName}! Sorry to hear about the account issue. Can you send a screenshot of the notification so I can help troubleshoot? Also — did this happen after posting a specific video, or out of nowhere?`;
    case 'review':
      return `Hey ${firstName}! Happy to do a review. Quick snapshot: ${ctx.posts_7d} posts in the last 7 days generating ${gmv} GMV. Want me to dig deeper into a specific video or timeframe?`;
    case 'checkin':
      return `Hey ${firstName}! Doing well on my end — how are things going with you?`;
    default:
      return null;
  }
}

/**
 * Short context snippet per topic that shows "what you should look at first" when
 * answering a question of this type.
 */
function topicBullets(topic: MessageTopic, ctx: CreatorContext): string[] {
  const retainer = ctx.retainer_amount
    ? `$${ctx.retainer_amount.toLocaleString()}/mo retainer`
    : 'No retainer set';
  const brand = BRAND_DISPLAY_NAMES[ctx.brand] || ctx.brand;

  switch (topic) {
    case 'payment':
      return [retainer, `Brand: ${brand}`, 'Payments table not yet wired'];
    case 'sample':
      return [`Brand: ${brand}`, 'Sample-tracking table not yet wired'];
    case 'campaign':
      return [`Currently on ${brand}`, retainer, `${ctx.posts_7d} posts in last 7d`];
    case 'ban':
      return [ctx.discord_id ? 'Discord: connected' : 'Discord: not connected', ctx.tiktok_handle ? `@${ctx.tiktok_handle}` : 'No TikTok handle on file'];
    case 'review':
      return [`${ctx.posts_7d} posts / ${ctx.gmv_7d > 0 ? `$${ctx.gmv_7d.toLocaleString()} GMV` : '$0 GMV'} in last 7d`, `Status: ${ctx.status_label}`, retainer];
    case 'checkin':
      return [`Status: ${ctx.status_label}`, `${ctx.posts_7d} posts last 7d`];
    default:
      return [];
  }
}

export function CreatorContextPanel({ creatorId, topic, onDraftReply }: Props) {
  const [context, setContext] = useState<CreatorContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/messages/${creatorId}/context`)
      .then(r => r.json())
      .then(data => {
        if (data.creator) setContext(data.creator);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [creatorId]);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="hidden lg:flex flex-col items-center justify-center w-10 border-l border-gray-200 bg-white hover:bg-gray-50 transition-colors"
        title="Show creator info"
      >
        <ChevronLeft className="h-4 w-4 text-gray-400" />
        <span className="text-[10px] text-gray-400 mt-1 [writing-mode:vertical-lr]">Info</span>
      </button>
    );
  }

  return (
    <div className="hidden lg:flex flex-col w-72 border-l border-gray-200 bg-white overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Creator Info</span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 text-pink-400 animate-spin" />
        </div>
      ) : !context ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <User className="h-8 w-8 text-gray-300 mb-2" />
          <p className="text-xs text-gray-400">Creator info unavailable</p>
        </div>
      ) : (
        <div className="px-4 py-4 space-y-5">
          {/* Topic Context Card — only when a real topic is classified */}
          {topic && topic !== 'other' && (() => {
            const t = topic as MessageTopic;
            const colors = TOPIC_COLORS[t];
            const bullets = topicBullets(t, context);
            const draft = buildDraftReply(t, context);
            return (
              <div className={cn('rounded-xl border p-3', colors?.bg, 'border-transparent')}>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className={cn('h-3.5 w-3.5', colors?.fg)} />
                  <span className={cn('text-[10px] font-bold uppercase tracking-wider', colors?.fg)}>
                    Asking about: {TOPIC_LABELS[t]}
                  </span>
                </div>
                {bullets.length > 0 && (
                  <ul className="space-y-1 mb-3">
                    {bullets.map((b, i) => (
                      <li key={i} className="text-xs text-[#1A1B3A] flex gap-2">
                        <span className={cn('mt-1.5 h-1 w-1 rounded-full flex-shrink-0', colors?.fg.replace('text-', 'bg-'))} />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {draft && onDraftReply && (
                  <button
                    onClick={() => onDraftReply(draft)}
                    className="w-full text-xs font-semibold px-3 py-2 rounded-lg bg-white text-[#1A1B3A] border border-gray-200 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="h-3 w-3" />
                    Draft reply
                  </button>
                )}
              </div>
            );
          })()}

          {/* Name + avatar placeholder */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-pink-400 to-purple-400 flex items-center justify-center text-white font-semibold text-sm">
              {context.real_name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-[#1A1B3A] truncate">{context.real_name}</p>
              {context.tiktok_handle && (
                <a
                  href={`https://tiktok.com/@${context.tiktok_handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-400 hover:text-pink-500 flex items-center gap-1 transition-colors"
                >
                  @{context.tiktok_handle}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>

          {/* Brand pill */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Brand</p>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: getBrandColor(context.brand) }}
            >
              {BRAND_DISPLAY_NAMES[context.brand] || context.brand}
            </span>
          </div>

          {/* Status */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Status</p>
            {(() => {
              const cfg = STATUS_CONFIG[context.status];
              return (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: cfg.bgColor, color: cfg.color }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cfg.dotColor }} />
                  {cfg.label}
                </span>
              );
            })()}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<Video className="h-3.5 w-3.5" />}
              label="Posts (7d)"
              value={String(context.posts_7d)}
            />
            <StatCard
              icon={<DollarSign className="h-3.5 w-3.5" />}
              label="GMV (7d)"
              value={`$${context.gmv_7d.toLocaleString()}`}
            />
            <StatCard
              icon={<DollarSign className="h-3.5 w-3.5" />}
              label="Retainer"
              value={context.retainer_amount ? `$${context.retainer_amount.toLocaleString()}` : 'N/A'}
            />
            <StatCard
              icon={<Calendar className="h-3.5 w-3.5" />}
              label="Last Active"
              value={context.last_active ? new Date(context.last_active).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'N/A'}
            />
          </div>

          {/* Brand breakdown (for multi-brand creators) */}
          {context.brand_breakdown && context.brand_breakdown.length > 1 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Per Brand (7d)</p>
              <div className="space-y-2">
                {context.brand_breakdown.map(b => (
                  <div key={b.brand} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                      style={{ backgroundColor: getBrandColor(b.brand) }}
                    >
                      {BRAND_DISPLAY_NAMES[b.brand] || b.brand}
                    </span>
                    <div className="flex items-center gap-3 text-xs text-[#1A1B3A]">
                      <span>{b.posts_7d} posts</span>
                      <span className="font-medium">${b.gmv_7d.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Discord status */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Discord</p>
            {context.discord_id ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-[#5865F2]">
                <span className="h-2 w-2 rounded-full bg-green-400" />
                Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                <span className="h-2 w-2 rounded-full bg-gray-300" />
                Not connected
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <div className="flex items-center gap-1 text-gray-400 mb-1">
        {icon}
        <span className="text-[10px] font-medium">{label}</span>
      </div>
      <p className="text-sm font-semibold text-[#1A1B3A]">{value}</p>
    </div>
  );
}
