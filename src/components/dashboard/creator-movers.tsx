'use client';

import { formatCurrency } from '@/lib/utils/format';
import { BRAND_COLORS } from '@/lib/utils/constants';
import { Rocket, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export interface CreatorMover {
  display_name: string;
  brand?: string;
  current_gmv: number;
  prev_gmv: number;
  delta_pct: number | null;
  is_ghost: boolean;
  managed_creator_id?: number;
}

interface Props {
  risers: CreatorMover[];
  decliners: CreatorMover[];
}

function CreatorRow({ c, type }: { c: CreatorMover; type: 'rise' | 'decline' }) {
  const inner = (
    <div className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-gray-50/80 transition-colors group cursor-pointer">
      <div className="flex items-center gap-2 min-w-0">
        <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: BRAND_COLORS[c.brand ?? ''] ?? '#6B7280' }} />
        <span className="text-sm font-medium text-[#1A1B3A] truncate">{c.display_name}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-2">
        {c.is_ghost ? (
          <span className="text-sm text-gray-400 font-medium">Ghost 👻</span>
        ) : (
          <>
            <span className="text-sm font-semibold text-[#1A1B3A]">{formatCurrency(c.current_gmv)}</span>
            {c.delta_pct !== null && (
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-md ${type === 'rise' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                {type === 'rise' ? '+' : ''}{c.delta_pct.toFixed(0)}%
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );

  if (c.managed_creator_id) {
    return <Link href={`/creators/${c.managed_creator_id}`}>{inner}</Link>;
  }
  return inner;
}

export function CreatorMovers({ risers, decliners }: Props) {
  if (risers.length === 0 && decliners.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Rising Stars */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <Rocket className="h-4 w-4 text-green-500" />
          <h3 className="text-sm font-bold text-[#1A1B3A]">Rising Stars</h3>
        </div>
        {risers.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">No risers this period</p>
        ) : (
          <div className="space-y-0.5">
            {risers.slice(0, 5).map((c, i) => (
              <CreatorRow key={i} c={c} type="rise" />
            ))}
          </div>
        )}
      </div>

      {/* Needs Attention */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-bold text-[#1A1B3A]">Needs Attention</h3>
        </div>
        {decliners.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">Everyone&apos;s doing well!</p>
        ) : (
          <div className="space-y-0.5">
            {decliners.slice(0, 5).map((c, i) => (
              <CreatorRow key={i} c={c} type="decline" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
