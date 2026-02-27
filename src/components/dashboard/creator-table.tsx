'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import { type CreatorStatus, ALL_STATUSES, STATUS_CONFIG } from '@/lib/data/creator-status';
import { BRAND_COLORS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';

interface Creator {
  display_name: string;
  handles: string[];
  total_gmv: number;
  total_orders: number;
  total_items_sold: number;
  days_active: number;
  total_videos: number;
  managed_creator_id?: string;
  status?: CreatorStatus;
  isManaged?: boolean;
  retainer?: number;
  brand?: string;
}

interface Props {
  creators: Creator[];
  csvButton?: React.ReactNode;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-500 text-white text-xs font-bold shadow-sm">1</span>;
  if (rank === 2) return <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 text-white text-xs font-bold">2</span>;
  if (rank === 3) return <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white text-xs font-bold">3</span>;
  return <span className="text-gray-400 text-sm tabular-nums">{rank}</span>;
}

function StatusDot({ status }: { status?: CreatorStatus }) {
  if (!status) return null;
  const config = STATUS_CONFIG[status];
  return (
    <span
      className="inline-block h-2 w-2 rounded-full flex-shrink-0"
      style={{ backgroundColor: config.dotColor }}
      title={config.label}
    />
  );
}

function BrandPill({ brand }: { brand: string }) {
  const color = BRAND_COLORS[brand] ?? '#6B7280';
  const name = BRAND_DISPLAY_NAMES[brand] ?? brand;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: `${color}15`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}

type FilterValue = 'all' | CreatorStatus;

export function CreatorTable({ creators, csvButton }: Props) {
  const [filter, setFilter] = useState<FilterValue>('all');

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: creators.length };
    for (const s of ALL_STATUSES) counts[s] = 0;
    for (const c of creators) {
      if (c.status) counts[c.status] = (counts[c.status] ?? 0) + 1;
    }
    return counts;
  }, [creators]);

  const filtered = useMemo(() => {
    if (filter === 'all') return creators;
    return creators.filter((c) => c.status === filter);
  }, [creators, filter]);

  const hasStatuses = creators.some((c) => c.status);

  return (
    <div className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm">
      <div className="px-6 py-4 border-b border-gray-100 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-[#1A1B3A]">Top Creators</h3>
            <p className="text-xs text-gray-400 mt-0.5">Ranked by GMV</p>
          </div>
          {csvButton}
        </div>
        {hasStatuses && (
          <div className="flex gap-2 flex-wrap">
            {(['all', ...ALL_STATUSES] as FilterValue[]).map((s) => {
              const isAll = s === 'all';
              const config = !isAll ? STATUS_CONFIG[s] : null;
              const count = statusCounts[s] ?? 0;
              const active = filter === s;
              return (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border',
                    active
                      ? isAll
                        ? 'border-[#FF4D8D] bg-pink-50 text-[#FF4D8D]'
                        : ''
                      : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                  )}
                  style={
                    active && !isAll && config
                      ? { borderColor: config.color, color: config.color, backgroundColor: config.bgColor }
                      : {}
                  }
                >
                  {isAll ? 'All' : config!.label}
                  <span className="ml-1.5 opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr className="border-b border-gray-100 text-gray-500">
              <th className="px-6 py-3 text-left font-medium text-xs uppercase tracking-wider w-12">#</th>
              <th className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wider">Creator</th>
              <th className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wider">Brand</th>
              <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider">GMV</th>
              <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider">Orders</th>
              <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider">Items</th>
              <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider">Videos</th>
              <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider">Retainer</th>
              <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider pr-6">ROI</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={c.display_name + i} className={cn(
                'border-b border-gray-50 transition-all duration-200',
                'hover:bg-gray-50',
              )}>
                <td className="px-6 py-3.5"><RankBadge rank={i + 1} /></td>
                <td className="px-4 py-3.5 font-medium text-[#1A1B3A]">
                  <div className="flex items-center gap-2">
                    <StatusDot status={c.status} />
                    <div>
                      <Link href={`/creators/${c.managed_creator_id ?? encodeURIComponent(c.handles[0])}`} className="hover:text-[#FF4D8D] hover:underline transition-colors">
                        {c.display_name}
                      </Link>
                      {c.handles.length > 0 && c.display_name !== c.handles[0] && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {c.handles.map((h) => `@${h}`).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  {c.brand ? <BrandPill brand={c.brand} /> : <span className="text-gray-300">-</span>}
                </td>
                <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-[#1A1B3A]">{formatCurrency(c.total_gmv)}</td>
                <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums">{formatNumber(c.total_orders)}</td>
                <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums">{formatNumber(c.total_items_sold)}</td>
                <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums">{formatNumber(c.total_videos)}</td>
                <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums">
                  {c.retainer && c.retainer > 0 ? `$${c.retainer.toLocaleString()}` : ''}
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums pr-6">
                  {c.retainer && c.retainer > 0 ? (
                    <span className={c.total_gmv / c.retainer >= 1 ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
                      {(c.total_gmv / c.retainer).toFixed(1)}x
                    </span>
                  ) : ''}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">No creator data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
