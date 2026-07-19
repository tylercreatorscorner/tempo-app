'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Sparkles, BarChart3, Trophy, Wallet, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { BrandSwitcher } from '@/components/creator/brand-switcher';
import type { CreatorProfile } from '@/lib/data/creator-context';

const NAV_ITEMS: { href: string; label: string; icon: typeof Home; exact?: boolean }[] = [
  { href: '/creator-dashboard', label: 'Home', icon: Home, exact: true },
  { href: '/creator-dashboard/brands', label: 'My Brands', icon: Wallet },
  { href: '/creator-dashboard/stats', label: 'Performance', icon: BarChart3 },
  { href: '/creator-dashboard/rankings', label: 'Rankings', icon: Trophy },
  { href: '/creator-dashboard/discover', label: 'Inspiration', icon: Sparkles },
];

/**
 * Nav icon that becomes a spinner while ITS OWN link's navigation is pending —
 * the "your click registered" cue the portal was missing (routes are dynamic, so
 * `active` only flips on commit; without this a click changed zero pixels for the
 * whole wait). Module-scope so it isn't remounted each render; the swap keeps the
 * row width stable. Mirrors the admin sidebar's NavIcon.
 */
function NavIcon({ icon: Icon, active }: { icon: React.ComponentType<{ className?: string }>; active: boolean }) {
  const { pending } = useLinkStatus();
  const spin = useDelayedFlag(pending);
  const tone = active ? 'text-[var(--primary)]' : 'text-muted-foreground';
  return spin ? (
    <Loader2 className={cn('h-4 w-4 flex-shrink-0 animate-spin', tone)} />
  ) : (
    <Icon className={cn('h-4 w-4 flex-shrink-0', tone)} />
  );
}

/**
 * Creator portal sidebar — matches the admin/brand shell: logo top, nav (active
 * row tinted + a right-edge accent bar), brand switcher pinned at the bottom. The
 * profile lives in the top-right header now, not here.
 */
export function CreatorSidebar({
  className,
  profile,
  onNavigate,
}: {
  className?: string;
  profile: CreatorProfile;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside className={cn('flex h-screen w-64 flex-col border-r border-border bg-card', className)}>
      <div className="flex items-center gap-2 px-5 py-5">
        <TempoLogo size="md" animated />
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-1">
        {NAV_ITEMS.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150',
                active
                  ? 'bg-primary/10 font-medium text-[var(--primary)]'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <NavIcon icon={item.icon} active={active} />
              <span className="truncate">{item.label}</span>
              {active && <span className="ml-auto h-4 w-1 rounded-full bg-[var(--primary)]" />}
            </Link>
          );
        })}
      </nav>

      {profile.brands.length > 1 && (
        <div className="border-t border-border px-3 pb-4 pt-3">
          <BrandSwitcher brands={profile.brands} currentBrand={profile.current_brand} />
        </div>
      )}
    </aside>
  );
}
