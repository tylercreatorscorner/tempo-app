'use client';

import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { Users, UserCheck, UserX } from 'lucide-react';

interface SplitData {
  managed: { gmv: number; orders: number; creators: number; videos: number };
  unmanaged: { gmv: number; orders: number; creators: number; videos: number };
}

export function ManagedSplit({ data }: { data: SplitData }) {
  const totalGmv = data.managed.gmv + data.unmanaged.gmv;
  const managedPct = totalGmv > 0 ? (data.managed.gmv / totalGmv) * 100 : 0;
  const unmanagedPct = totalGmv > 0 ? 100 - managedPct : 0;

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <Users className="h-5 w-5 text-[#FF4D8D]" />
        <h3 className="text-lg font-bold tracking-tight text-[#1A1B3A]">Creator Program Split</h3>
      </div>

      {/* Visual bar */}
      <div className="h-3 rounded-full overflow-hidden flex mb-4 bg-gray-100">
        {managedPct > 0 && (
          <div
            className="h-full bg-[#FF4D8D] transition-all duration-500"
            style={{ width: `${managedPct}%` }}
          />
        )}
        {unmanagedPct > 0 && (
          <div
            className="h-full bg-gray-300 transition-all duration-500"
            style={{ width: `${unmanagedPct}%` }}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Managed */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <UserCheck className="h-4 w-4 text-[#FF4D8D]" />
            <span className="text-sm font-semibold text-[#1A1B3A]">Managed</span>
            <span className="text-xs font-bold text-[#FF4D8D] ml-auto">{managedPct.toFixed(0)}% of GMV</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">GMV</span>
              <span className="font-semibold text-[#1A1B3A]">{formatCurrency(data.managed.gmv)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Orders</span>
              <span className="font-medium text-gray-700">{formatNumber(data.managed.orders)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Creators</span>
              <span className="font-medium text-gray-700">{formatNumber(data.managed.creators)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Videos</span>
              <span className="font-medium text-gray-700">{formatNumber(data.managed.videos)}</span>
            </div>
          </div>
        </div>

        {/* Unmanaged */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <UserX className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-semibold text-[#1A1B3A]">Organic / Unmanaged</span>
            <span className="text-xs font-bold text-gray-400 ml-auto">{unmanagedPct.toFixed(0)}% of GMV</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">GMV</span>
              <span className="font-semibold text-[#1A1B3A]">{formatCurrency(data.unmanaged.gmv)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Orders</span>
              <span className="font-medium text-gray-700">{formatNumber(data.unmanaged.orders)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Creators</span>
              <span className="font-medium text-gray-700">{formatNumber(data.unmanaged.creators)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Videos</span>
              <span className="font-medium text-gray-700">{formatNumber(data.unmanaged.videos)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
