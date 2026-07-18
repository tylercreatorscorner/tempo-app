import { formatCurrency, formatNumber } from '@/lib/utils/format';
import type { CreatorLifetimeStats } from '@/lib/data/creator-profile';
import { StatCard } from '@/components/ui/stat-card';

function Heading() {
  return (
    <div>
      <h3 className="text-lg font-bold tracking-tight text-foreground">Lifetime Stats</h3>
      <p className="text-xs text-muted-foreground mt-0.5">All-time performance across all accounts</p>
    </div>
  );
}

export function LifetimeStats({ stats }: { stats: CreatorLifetimeStats }) {
  if (!stats.first_active_date) {
    return (
      <div className="space-y-3">
        <Heading />
        <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-[var(--pulse-elev-1)]">
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

  // Modernized onto the canonical StatCard (icon-free, per the design system) so
  // lifetime and period stats read as one system. Accents are Pulse tokens, not
  // the old hardcoded hex (#00C853/#FF9800/#2196F3).
  const items: { label: string; value: string; accentColor?: string }[] = [
    { label: 'Lifetime GMV', value: formatCurrency(stats.total_gmv), accentColor: 'var(--primary)' },
    { label: 'Total Videos', value: formatNumber(stats.total_videos), accentColor: 'var(--pulse-accent-2)' },
    { label: 'Total Orders', value: formatNumber(stats.total_orders), accentColor: 'var(--pulse-pos)' },
    { label: 'Commission Earned', value: formatCurrency(stats.total_commission), accentColor: 'var(--pulse-warn)' },
    { label: 'First Active', value: firstDate },
    { label: 'Months Active', value: String(stats.months_active) },
  ];

  return (
    <div className="space-y-3">
      <Heading />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {items.map((item) => (
          <StatCard key={item.label} label={item.label} value={item.value} accentColor={item.accentColor} />
        ))}
      </div>
    </div>
  );
}
