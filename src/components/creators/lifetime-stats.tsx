import { formatCurrency, formatNumber } from '@/lib/utils/format';
import type { CreatorLifetimeStats } from '@/lib/data/creator-profile';
import { Calendar, TrendingUp, Video, ShoppingCart, DollarSign, Clock } from 'lucide-react';

export function LifetimeStats({ stats }: { stats: CreatorLifetimeStats }) {
  if (!stats.first_active_date) {
    return (
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold tracking-tight text-[#1A1B3A]">Lifetime Stats</h3>
          <p className="text-xs text-gray-400 mt-0.5">All-time performance across all accounts</p>
        </div>
        <div className="p-8 text-center">
          <p className="text-sm text-gray-400">No performance data yet for this creator.</p>
          <p className="text-xs text-gray-300 mt-1">Stats will appear here once TikTok Shop data starts syncing.</p>
        </div>
      </div>
    );
  }

  const firstDate = new Date(stats.first_active_date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const items = [
    { label: 'Lifetime GMV', value: formatCurrency(stats.total_gmv), icon: TrendingUp, color: '#FF4D8D' },
    { label: 'Total Videos', value: formatNumber(stats.total_videos), icon: Video, color: '#7C5CFC' },
    { label: 'Total Orders', value: formatNumber(stats.total_orders), icon: ShoppingCart, color: '#00C853' },
    { label: 'Commission Earned', value: formatCurrency(stats.total_commission), icon: DollarSign, color: '#FF9800' },
    { label: 'First Active', value: firstDate, icon: Calendar, color: '#2196F3' },
    { label: 'Months Active', value: String(stats.months_active), icon: Clock, color: '#6B7280' },
  ];

  return (
    <div className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm">
      <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
        <h3 className="text-lg font-bold tracking-tight text-[#1A1B3A]">Lifetime Stats</h3>
        <p className="text-xs text-gray-400 mt-0.5">All-time performance across all accounts</p>
      </div>
      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          {items.map((item) => (
            <div key={item.label} className="flex flex-col items-center text-center gap-2 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${item.color}15` }}
              >
                <item.icon className="h-5 w-5" style={{ color: item.color }} />
              </div>
              <div>
                <p className="text-lg font-bold text-[#1A1B3A]">{item.value}</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">{item.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
