'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Building2, LayoutDashboard, UserRoundPlus, Users, PlaySquare, GraduationCap, FileBarChart, MessagesSquare, Hash, Wallet, PanelLeftClose, PanelLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { TempoLogo, TempoIcon } from '@/components/ui/tempo-logo';
import { BrandSwitcher } from '@/components/layout/brand-switcher';
import styles from './workspace-theme.module.css';

interface Dest {
  href: string;
  /** Matrix screen this destination opens. Absent = always shown. */
  screen?: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Path prefixes that light this destination up (its section's pages). */
  match: string[];
  exclude?: string[];
  adminOnly?: boolean;
  financeGated?: boolean;
  group: string;
}

// Primary destinations. Sub-views live in SectionTabs; settings lives in the account menu.
// Coaching preserves its existing routes and server-side Reporting permission guards.
const PRIMARY: Dest[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: ['/dashboard'], screen: 'dashboard', group: 'Workspace' },
  { href: '/roster/invitations', label: 'Onboarding', icon: UserRoundPlus, match: ['/roster/invitations'], adminOnly: true, screen: 'roster', group: 'Workspace' },
  { href: '/roster',    label: 'Creators',  icon: Users,           match: ['/roster', '/retention', '/affiliates', '/segments', '/contests', '/creators'], exclude: ['/roster/invitations'], screen: 'roster', group: 'Workspace' },
  { href: '/posts',     label: 'Content',   icon: PlaySquare,      match: ['/posts'], screen: 'posts', group: 'Workspace' },
  { href: '/reporting/coaching', label: 'Coaching', icon: GraduationCap, match: ['/reporting/coaching'], screen: 'coaching', group: 'Engagement' },
  // Reporting is a generator console, not a content view — owner's call
  // (2026-07-23): its own destination, out of the Content tabs.
  { href: '/reporting', label: 'Reporting', icon: FileBarChart,    match: ['/reporting'], exclude: ['/reporting/coaching'], screen: 'reporting', group: 'Engagement' },
  { href: '/messages',  label: 'Communications',     icon: MessagesSquare,  match: ['/messages'], screen: 'messages', group: 'Engagement' },
  { href: '/drops',     label: 'Discord',            icon: Hash,            match: ['/drops'], screen: 'messages', group: 'Engagement' },
  { href: '/earnings',  label: 'Finance',   icon: Wallet,          match: ['/earnings', '/ytd', '/invoicing', '/payments'], financeGated: true, screen: 'earnings', group: 'Finance' },
];

const AGENCY: Dest[] = [
  { href: '/agency', label: 'Overview', icon: LayoutDashboard, match: ['/agency'], exclude: ['/agency/clients', '/agency/revenue', '/agency/reports', '/agency/finance'], group: 'Agency' },
  { href: '/agency/clients', label: 'Clients', icon: Building2, match: ['/agency/clients'], group: 'Agency' },
  { href: '/agency/revenue', label: 'Revenue', icon: Wallet, match: ['/agency/revenue'], group: 'Finance' },
  { href: '/agency/finance', label: 'Client finance', icon: Wallet, match: ['/agency/finance'], group: 'Finance' },
  { href: '/agency/reports', label: 'Reports', icon: FileBarChart, match: ['/agency/reports'], group: 'Insights' },
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
 *  - It SWAPS the icon rather than adding an element — the collapsed icon rail
 *    would shift otherwise. And it's an additive cue, never the active
 *    treatment: `active` stays owned by isActive() alone, or the old row and the
 *    clicked row would both look active for the entire navigation.
 */
function NavIcon({ icon: Icon, active }: { icon: React.ComponentType<{ className?: string }>; active: boolean }) {
  const { pending } = useLinkStatus();
  // Gated so routes that commit fast (e.g. /posts, which has a loading.tsx)
  // don't flash a spinner on every click. House rule — see useDelayedFlag.
  const spin = useDelayedFlag(pending);
  const tone = active ? 'text-[var(--primary)]' : 'text-current';
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
  /** Matrix read-permissions by screen. Undefined = unresolved, show everything
   *  the old rules allow rather than blanking the nav on a failed lookup. */
  navPerms?: Record<string, boolean>;
  /** Collapsed to an icon-only rail (desktop). */
  collapsed?: boolean;
  /** When provided, renders the collapse/expand toggle (desktop sidebar only —
   *  the mobile drawer omits it). */
  onToggleCollapse?: () => void;
}

export function Sidebar({ className, isAdmin = false, canViewFinance = true, navPerms, collapsed = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const brand = searchParams.get('brand');
  const agencyAllowed = navPerms?.agency === true;
  const agencyMode = agencyAllowed && (pathname === '/agency' || pathname.startsWith('/agency/'));

  const withBrand = (href: string) => (brand && !href.startsWith('/agency') ? `${href}?brand=${encodeURIComponent(brand)}` : href);
  const matches = (prefix: string) => pathname === prefix || pathname.startsWith(prefix + '/');
  const isActive = (d: Dest) => d.match.some(matches) && !d.exclude?.some(matches);
  // ⚠️ AND-ed with the old rules, never instead of them: the matrix can hide a
  // destination the old rules allowed, but cannot reveal one they denied.
  const visible = (d: Dest) =>
    (!d.adminOnly || isAdmin) &&
    (!d.financeGated || canViewFinance) &&
    (!navPerms || !d.screen || navPerms[d.screen] !== false);
  const destinations = agencyMode ? AGENCY : PRIMARY.filter(visible);
  const groups = [...new Set(destinations.map(destination => destination.group))];

  const renderItem = (d: Dest) => {
    const active = isActive(d);
    return (
      <Link
        key={d.href}
        href={withBrand(d.href)}
        title={collapsed ? d.label : undefined}
        aria-label={d.label}
        aria-current={active ? 'page' : undefined}
        className={cn(styles.navItem, active && styles.navItemActive)}
      >
        <NavIcon icon={d.icon} active={active} />
        {!collapsed && <span className="truncate">{d.label}</span>}
      </Link>
    );
  };

  return (
    <aside
      data-collapsed={collapsed || undefined}
      className={cn('flex', styles.sidebar, className)}
    >
      {/* Logo */}
      <div className={styles.sidebarLogo}>
        {collapsed ? <TempoIcon size={28} /> : <TempoLogo size="md" animated={false} />}
      </div>

      {agencyAllowed && <nav aria-label="Workspace mode" className={styles.workspaceModes}>
        {[{ label: 'Brands', href: withBrand('/dashboard'), icon: Users, active: !agencyMode }, { label: 'Agency', href: '/agency', icon: Building2, active: agencyMode }].map(({ label, href, icon: Icon, active }) => <Link key={label} href={href} title={collapsed ? `${label} workspace` : undefined} aria-label={`${label} workspace`} aria-current={active ? 'true' : undefined} className={cn(styles.workspaceMode, active && styles.workspaceModeActive)}><NavIcon icon={Icon} active={active} />{!collapsed && label}</Link>)}
      </nav>}

      {/* Empty permission groups disappear; the same navigation serves mobile. */}
      <nav aria-label={agencyMode ? 'Agency navigation' : 'Brand navigation'} className={styles.destinations}>
        {groups.map(group => <div key={group} className={styles.navGroup} role="group" aria-label={group}>
          <h2 className={cn(styles.navGroupLabel, collapsed && 'sr-only')}>{group}</h2>
          {destinations.filter(destination => destination.group === group).map(renderItem)}
        </div>)}
      </nav>

      {/* Bottom cluster — brand (expanded only) + collapse toggle. */}
      <div className={styles.sidebarFooter}>
        {!collapsed && !agencyMode && <div className={styles.brandContext}><p className={styles.contextLabel}>Selected brand</p><BrandSwitcher /></div>}
        {!collapsed && agencyMode && <p className={styles.agencyContext}>Internal agency workspace</p>}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={styles.collapseButton}
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" />
                <span>Collapse sidebar</span>
              </>
            )}
          </button>
        )}
      </div>
    </aside>
  );
}

