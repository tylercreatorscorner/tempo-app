'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ExternalLink, UserCheck, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { BRAND_COLORS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';

export interface TopCreator {
  creator_name: string;
  total_videos: number;
  total_gmv: number;
  total_orders: number;
  total_items_sold: number;
  avg_gmv_per_video: number;
  brand: string;
  /** Set by parent: true if @creator_name is in your managed_creators */
  is_managed: boolean;
  /** Optional: managed_creators row id, for deep-linking to profile */
  managed_id?: string | null;
}

type Metric = 'total_gmv' | 'total_orders' | 'total_videos';
type Audience = 'all' | 'managed';

const METRICS: Array<{ key: Metric; label: string; format: (n: number) => string }> = [
  { key: 'total_gmv',    label: 'GMV',    format: (n) => formatCurrency(n) },
  { key: 'total_orders', label: 'Orders', format: (n) => formatNumber(n) },
  { key: 'total_videos', label: 'Posts',  format: (n) => formatNumber(n) },
];

interface Props {
  creators: TopCreator[];
  limit?: number;
}

export function TopCreatorsCard({ creators, limit = 10 }: Props) {
  const [metric, setMetric] = useState<Metric>('total_gmv');
  const [audience, setAudience] = useState<Audience>('all');

  const sorted = useMemo(() => {
    const filtered = audience === 'managed' ? creators.filter((c) => c.is_managed) : creators;
    return [...filtered].sort((a, b) => b[metric] - a[metric]).slice(0, limit);
  }, [creators, metric, audience, limit]);

  const cfg = METRICS.find((m) => m.key === metric)!;
  const max = sorted[0]?.[metric] ?? 1;
  const managedCount = creators.filter((c) => c.is_managed).length;

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-bold text-[#1A1B3A]">Top Creators</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Highest-performing creators by {cfg.label.toLowerCase()} · top {Math.min(limit, sorted.length)}
            </p>
          </div>
          {/* Metric toggle */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
            {METRICS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setMetric(key)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                  metric === key ? 'bg-white text-[#1A1B3A] shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Audience filter — only useful if there are managed creators in the dataset */}
        {managedCount > 0 && (
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
            <button
              onClick={() => setAudience('all')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                audience === 'all' ? 'bg-white text-[#1A1B3A] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <Users className="h-3.5 w-3.5" />
              All Creators
              <span className="text-[10px] text-gray-400 ml-0.5">{formatNumber(creators.length)}</span>
            </button>
            <button
              onClick={() => setAudience('managed')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                audience === 'managed' ? 'bg-white text-[#1A1B3A] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <UserCheck className="h-3.5 w-3.5" />
              My Creators
              <span className="text-[10px] text-gray-400 ml-0.5">{formatNumber(managedCount)}</span>
            </button>
          </div>
        )}
      </div>

      <div className="divide-y divide-gray-50">
        {sorted.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">
            {audience === 'managed' ? 'No managed creators in this period' : 'No creators in this period'}
          </div>
        ) : (
          sorted.map((c, i) => {
            const value = c[metric];
            const pct = (value / max) * 100;
            const brandColor = BRAND_COLORS[c.brand] ?? '#6B7280';
            const handleHref = c.is_managed
              ? `/creators/${encodeURIComponent(c.creator_name)}`
              : `https://tiktok.com/@${c.creator_name}`;
            const handleTarget = c.is_managed ? undefined : '_blank';

            return (
              <div key={`${c.creator_name}-${c.brand}-${i}`} className="px-5 py-3.5 hover:bg-gray-50/60 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="text-xs text-gray-300 font-bold tabular-nums w-6">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {c.is_managed ? (
                        <Link
                          href={handleHref}
                          className="text-sm font-medium text-[#1A1B3A] hover:text-[#E91E8C] transition-colors truncate min-w-0"
                        >
                          @{c.creator_name}
                        </Link>
                      ) : (
                        <a
                          href={handleHref}
                          target={handleTarget}
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-[#1A1B3A] hover:text-[#E91E8C] transition-colors truncate min-w-0 inline-flex items-center gap-1"
                        >
                          @{c.creator_name}
                          <ExternalLink className="h-3 w-3 opacity-50 flex-shrink-0" />
                        </a>
                      )}
                      {c.is_managed && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 flex-shrink-0">
                          <UserCheck className="h-2.5 w-2.5" /> Managed
                        </span>
                      )}
                      <span
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0"
                        style={{ backgroundColor: `${brandColor}18`, color: brandColor }}
                      >
                        {BRAND_DISPLAY_NAMES[c.brand] ?? c.brand}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">
                      {formatNumber(c.total_videos)} posts · {formatCurrency(c.avg_gmv_per_video)} avg/post
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right min-w-[100px]">
                    <p className="text-sm font-bold text-[#1A1B3A] tabular-nums">{cfg.format(value)}</p>
                    <div className="h-1 mt-1 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: brandColor }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
