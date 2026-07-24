'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { LayoutDashboard, Users, PlaySquare, FileBarChart, MessagesSquare, Wallet, Boxes, PanelLeftClose, PanelLeft, Loader2 } from 'lucide-react';
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

// SEVEN destinations (Products is admin-only; Finance is finance-gated).
// Sub-views (Roster/Retention/Affiliates/Segments, Earnings/YTD/Invoicing/
// Payments, …) live as tabs ON the page via SectionTabs — NOT as sidebar rows.
// Comms (/messages) graduated from a header icon to a destination with the
// Comms-hub rebuild (Broadcasts/Inbox/Templates own their tabs on-page).
// Discover is hidden until real.
// Settings deliberately has NO sidebar row: it already lives in the profile
// dropdown (header.tsx) alongside User Management, and one destination in two
// places is one too many. The dropdown link is ungated, so every role still
// reaches it; /settings' own SectionTabs still carry General/Team/Upload/
// Automations/Integrations/Outreach.
//
// With Settings gone, "Setup" was a section header over a single row, so
// Products folds into the one list. It stays adminOnly, so managers see four.
const PRIMARY: Dest[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: ['/dashboard'] },
  { href: '/roster',    label: 'Creators',  icon: Users,           match: ['/roster', '/retention', '/affiliates', '/segments', '/creators'] },
  { href: '/posts',     label: 'Content',   icon: PlaySquare,      match: ['/posts'] },
  // Reporting is a generator console, not a content view — owner's call
  // (2026-07-23): its own destination, out of the Content tabs.
  { href: '/reporting', label: 'Reporting', icon: FileBarChart,    match: ['/reporting'] },
  { href: '/messages',  label: 'Comms',     icon: MessagesSquare,  match: ['/messages'] },
  { href: '/earnings',  label: 'Finance',   icon: Wallet,          match: ['/earnings', '/ytd', '/invoicing', '/payments'], financeGated: true },
  { href: '/products/catalog', label: 'Products', icon: Boxes,     match: ['/products'], adminOnly: true },
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

      {/* Destinations — one flat list. The "Setup" group existed to hold
          Products + Settings; Settings now lives only in the profile dropdown,
          and a section header over a single row is just noise. */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-1 space-y-0.5">
        {PRIMARY.filter(visible).map(renderItem)}
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
