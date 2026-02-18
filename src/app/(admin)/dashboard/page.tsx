import { StatCard } from '@/components/dashboard/stat-card';
import { BrandPill } from '@/components/dashboard/brand-pill';

/**
 * Admin dashboard — Operations Center.
 * For single-brand tenants, this shows brand-specific data directly.
 * For multi-brand (agency), it shows the portfolio overview with brand selector.
 *
 * The layout header conditionally shows/hides the brand filter based on tenant.isMultiBrand.
 * This page receives whichever brand context is active.
 */
export default function AdminDashboard() {
  // TODO: Fetch real data via RPC once Supabase is connected.
  // Server-side: check tenant brand count to decide view mode.
  const stats = [
    { label: 'Period GMV', value: '$0', trend: 0, trendLabel: 'WoW' },
    { label: 'Orders', value: '0', trend: 0, trendLabel: 'WoW' },
    { label: 'Active Creators', value: '0' },
    { label: 'Videos', value: '0' },
    { label: 'Portfolio ROI', value: '0%' },
    { label: 'Managed GMV', value: '$0' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Operations Center</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Performance overview and daily operations
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      {/*
        Brand pills — only shown for multi-brand (agency) tenants.
        Single-brand tenants skip this since all data is already brand-scoped.
        TODO: Wrap in a <MultiBrandOnly> guard component.
      */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Brand Performance</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <BrandPill brand="jiyu" displayName="JiYu" value="Connect Supabase to see data" />
          <BrandPill brand="catakor" displayName="Catakor" value="Connect Supabase to see data" />
          <BrandPill brand="physicians_choice" displayName="Physician's Choice" value="Connect Supabase to see data" />
          <BrandPill brand="toplux" displayName="TopLux" value="Connect Supabase to see data" />
        </div>
      </div>

      {/* Placeholder sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold mb-4">Daily Brief</h3>
          <p className="text-sm text-muted-foreground">Connect your Supabase instance to generate daily briefs.</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold mb-4">GMV Trend</h3>
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            Chart will appear when data is available
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold mb-4">Creator Rankings</h3>
        <p className="text-sm text-muted-foreground">Connect your Supabase instance to see creator rankings.</p>
      </div>
    </div>
  );
}
