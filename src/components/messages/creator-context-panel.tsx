'use client';

import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, User, ExternalLink, DollarSign, Video, Calendar, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getBrandColor, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import { STATUS_CONFIG, type CreatorStatus } from '@/lib/data/creator-status';

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
}

export function CreatorContextPanel({ creatorId }: Props) {
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
