'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { LayoutDashboard, Users, PlaySquare, Wallet, Boxes, Settings as SettingsIcon, PanelLeftClose, PanelLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { TempoLogo, TempoIcon } from '@/components/ui/tempo-logo';
import { BrandSwitcher } from '@/components/layout/brand-switcher';

interface Dest {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Path prefixes that light this destination up (its section's pages). */
  match: string[];
  adminOnly?: boolean;
  financeGated?: boolean;
}

// SIX destinations. Sub-views (Roster/Retention/Affiliates/Segments,
// Earnings/YTD/Invoicing/Payments, …) live as tabs ON the page via SectionTabs —
// NOT as sidebar rows. Messages is in the top bar; Discover is hidden until real.
const PRIMARY: Dest[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: ['/dashboard'] },
  { href: '/roster',    label: 'Creators',  icon: Users,           match: ['/roster', '/retention', '/affiliates', '/segments', '/creators'] },
  { href: '/posts',     label: 'Content',   icon: PlaySquare,      match: ['/posts', '/reporting'] },
  { href: '/earnings',  label: 'Finance',   icon: Wallet,          match: ['/earnings', '/ytd', '/invoicing', '/payments'], financeGated: true },
];
const SETUP: Dest[] = [
  { href: '/products/catalog', label: 'Products', icon: Boxes,        match: ['/products'], adminOnly: true },
  { href: '/settings',         label: 'Settings', icon: SettingsIcon, match: ['/settings', '/team', '/upload', '/workflows'] },
];

/**
 * The nav icon, which becomes a spinner while ITS OWN link's navigation is
 * pending. This is the app's primary "your click registered" signal: every
 * admin route is request-time dynamic, so a click waits on a full server render
 * — and `active` derives from usePathname(), which doesn't update until the
 * transition COMMITS. Without this, a click changes literally nothing on screen
 * for the whole wait, which reads as a frozen app rather than a loading one.
 *
 * Three things here are load-bearing:
 *  - MODULE SCOPE. Sidebar re-renders whenever searchParams change; a component
 *    type declared inside it would be a new type every render, so React would
 *    remount the subtree and destroy the pending state being tracked.
 *  - useLinkStatus() only reports for the nearest ancestor <Link>, so this must
 *    render INSIDE the Link.
 *  - It SWAPS the icon rather than adding an element — the collapsed 68px rail
 *    would shift otherwise. And it's an additive cue, never the active
 *    treatment: `active` stays owned by isActive() alone, or the old row and the
 *    clicked row would both look active for the entire navigation.
 */
function NavIcon({ icon: Icon, active }: { icon: React.ComponentType<{ className?: string }>; active: boolean }) {
  const { pending } = useLinkStatus();
  // Gated so routes that commit fast (e.g. /posts, which has a loading.tsx)
  // don't flash a spinner on every click. House rule — see useDelayedFlag.
  const spin = useDelayedFlag(pending);
  const tone = active ? 'text-[var(--primary)]' : 'text-muted-foreground';
  return spin
    ? <Loader2 className={cn('h-4 w-4 flex-shrink-0 animate-spin', tone)} />
    : <Icon className={cn('h-4 w-4 flex-shrink-0', tone)} />;
}

interface SidebarProps {
  className?: string;
  /** Owner/admin (impersonation-aware) — gates admin-only destinations. */
  isAdmin?: boolean;
  /** Finance visibility (impersonation-aware) — gates the Finance destination. */
  canViewFinance?: boolean;
  /** Collapsed to an icon-only rail (desktop). */
  collapsed?: boolean;
  /** When provided, renders the collapse/expand toggle (desktop sidebar only —
   *  the mobile drawer omits it). */
  onToggleCollapse?: () => void;
}

export function Sidebar({ className, isAdmin = false, canViewFinance = true, collapsed = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const brand = searchParams.get('brand');

  const withBrand = (href: string) => (brand ? `${href}?brand=${brand}` : href);
  const isActive = (d: Dest) => d.match.some((m) => pathname === m || pathname.startsWith(m + '/'));
  const visible = (d: Dest) => (!d.adminOnly || isAdmin) && (!d.financeGated || canViewFinance);

  const renderItem = (d: Dest) => {
    const active = isActive(d);
    return (
      <Link
        key={d.href}
        href={withBrand(d.href)}
        title={collapsed ? d.label : undefined}
        aria-label={d.label}
        className={cn(
          'group flex items-center rounded-lg text-sm transition-colors duration-150',
          collapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2',
          active ? 'bg-primary/10 text-[var(--primary)] font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
        )}
      >
        <NavIcon icon={d.icon} active={active} />
        {!collapsed && <span className="truncate">{d.label}</span>}
        {!collapsed && active && <span className="ml-auto h-4 w-1 rounded-full bg-[var(--primary)]" />}
      </Link>
    );
  };

  const setup = SETUP.filter(visible);

  return (
    <aside
      className={cn(
        'sticky top-0 flex h-screen flex-col overflow-hidden bg-card border-r border-border shrink-0 transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-[68px]' : 'w-64',
        className,
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center py-5', collapsed ? 'justify-center' : 'px-5')}>
        {collapsed ? <TempoIcon size={26} /> : <TempoLogo size="md" animated />}
      </div>

      {/* Destinations */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-1 space-y-0.5">
        {PRIMARY.filter(visible).map(renderItem)}

        {setup.length > 0 && (
          <>
            {collapsed ? (
              <div className="my-2 border-t border-border" />
            ) : (
              <div className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Setup</div>
            )}
            {setup.map(renderItem)}
          </>
        )}
      </nav>

      {/* Bottom cluster — brand (expanded only) + collapse toggle. */}
      <div className="border-t border-border px-2 py-2 space-y-2">
        {!collapsed && <BrandSwitcher />}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'flex w-full items-center rounded-lg text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              collapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2',
            )}
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
        )}
      </div>
    </aside>
  );
}
