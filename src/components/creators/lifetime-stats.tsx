import { formatCurrency, formatNumber } from '@/lib/utils/format';
import type { CreatorLifetimeStats } from '@/lib/data/creator-profile';
import { Calendar, TrendingUp, Video, ShoppingCart, DollarSign, Clock } from 'lucide-react';

export function LifetimeStats({ stats }: { stats: CreatorLifetimeStats }) {
  if (!stats.first_active_date) return null;

  const firstDate = new Date(stats.first_active_date).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });

  const items = [
    { label: 'Lifetime GMV', value: formatCurrency(stats.total_gmv), icon: TrendingUp },
    { label: 'Total Videos', value: formatNumber(stats.total_videos), icon: Video },
    { label: 'Total Orders', value: formatNumber(stats.total_orders), icon: ShoppingCart },
    { label: 'Commission Earned', value: formatCurrency(stats.total_commission), icon: DollarSign },
    { label: 'First Active', value: firstDate, icon: Calendar },
    { label: 'Months Active', value: String(stats.months_active), icon: Clock },
  ];

  return (
    <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Lifetime Stats</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-white border border-gray-100 flex items-center justify-center flex-shrink-0">
              <item.icon className="h-3.5 w-3.5 text-gray-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-gray-400 leading-tight">{item.label}</p>
              <p className="text-sm font-bold text-[#1A1B3A] truncate">{item.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
