import { formatCurrency, formatNumber } from '@/lib/utils/format';
import type { CreatorLifetimeStats } from '@/lib/data/creator-profile';
import { Calendar, TrendingUp, Video, ShoppingCart, DollarSign, Clock } from 'lucide-react';

export function LifetimeStats({ stats }: { stats: CreatorLifetimeStats }) {
  if (!stats.first_active_date) {
    return (
      <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-border">
          <h3 className="text-lg font-bold tracking-tight text-[var(--foreground)]">Lifetime Stats</h3>
          <p className="text-xs text-muted-foreground mt-0.5">All-time performance across all accounts</p>
        </div>
        <div className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No performance data yet for this creator.</p>
          <p className="text-xs text-muted-foreground mt-1">Stats will appear here once TikTok Shop data starts syncing.</p>
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
    { label: 'Lifetime GMV', value: formatCurrency(stats.total_gmv), icon: TrendingUp, color: 'var(--primary)' },
    { label: 'Total Videos', value: formatNumber(stats.total_videos), icon: Video, color: 'var(--pulse-accent-2)' },
    { label: 'Total Orders', value: formatNumber(stats.total_orders), icon: ShoppingCart, color: '#00C853' },
    { label: 'Commission Earned', value: formatCurrency(stats.total_commission), icon: DollarSign, color: '#FF9800' },
    { label: 'First Active', value: firstDate, icon: Calendar, color: '#2196F3' },
    { label: 'Months Active', value: String(stats.months_active), icon: Clock, color: 'var(--muted-foreground)' },
  ];

  return (
    <div className="rounded-2xl overflow-hidden bg-card border border-border shadow-sm">
      <div className="px-4 sm:px-6 py-4 border-b border-border">
        <h3 className="text-lg font-bold tracking-tight text-[var(--foreground)]">Lifetime Stats</h3>
        <p className="text-xs text-muted-foreground mt-0.5">All-time performance across all accounts</p>
      </div>
      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          {items.map((item) => (
            <div key={item.label} className="flex flex-col items-center text-center gap-2 p-3 rounded-xl bg-muted hover:bg-muted transition-colors">
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${item.color}15` }}
              >
                <item.icon className="h-5 w-5" style={{ color: item.color }} />
              </div>
              <div>
                <p className="text-lg font-bold text-[var(--foreground)]">{item.value}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
