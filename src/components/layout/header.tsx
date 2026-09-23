'use client';

import { AccountMenu } from './account-menu';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu, ChevronRight } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { createClient } from '@/lib/supabase/client';
import { useBreadcrumbOverride } from '@/components/layout/breadcrumb-context';

interface HeaderProps {
  onMenuClick?: () => void;
  tenantName?: string;
  userName?: string;
  userEmail?: string;
  tenantSwitcher?: React.ReactNode;
  /** Owner/admin (impersonation-aware) — gates the User Management menu entry. */
  isAdmin?: boolean;
}

// Every nav destination AND every SectionTabs sub-view. Keep in sync with
// section-tabs.tsx — a route missing here used to fall through to the literal
// string 'Dashboard', so ~2/3 of the app (Earnings, Retention, Affiliates, YTD,
// Invoicing, Products, Team, Upload, Workflows…) displayed the wrong page name
// in the breadcrumb. The tab consolidation added the routes but not the map.
const BREADCRUMB_MAP: Record<string, string> = {
  '/': 'Dashboard',
  '/dashboard': 'Dashboard',
  // Creators
  '/roster': 'Creators',
  '/retention': 'Retention',
  '/affiliates': 'Affiliates',
  '/segments': 'Segments',
  // Content
  '/posts': 'Posts',
  '/reporting': 'Reporting',
  // Finance
  '/earnings': 'Earnings',
  '/ytd': 'Year-to-Date',
  '/invoicing': 'Invoicing',
  '/payments': 'Payments',
  // Products
  '/products': 'Product Performance',
  '/products/catalog': 'Catalog',
  // Settings
  '/settings': 'Settings',
  '/settings/brands': 'Brands',
  '/team': 'Team',
  '/upload': 'Data Pipeline',
  '/workflows/automations': 'Automations',
  '/workflows/integrations': 'Integrations',
  '/workflows/outreach': 'Outreach',
  // Other
  '/brands': 'Brands',
  '/messages': 'Communications',
  '/discover': 'Discover',
  '/invites': 'Invites',
};

/** Last path segment, title-cased — so an unmapped route names ITSELF rather
 *  than silently claiming to be the Dashboard. */
function labelFromPath(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean).pop();
  if (!seg) return 'Dashboard';
  return seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function Header({ onMenuClick, tenantName, userName, userEmail, tenantSwitcher, isAdmin }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { label: overrideLabel } = useBreadcrumbOverride();
  const isCreatorDetail = pathname.startsWith('/creators/') && pathname !== '/creators';
  const isBrandDetail = pathname.startsWith('/brands/') && pathname !== '/brands';

  // Fallback label if no override is set — truncate UUIDs so they don't dominate the bar
  const fallbackDetailLabel = (slug: string) => {
    const decoded = decodeURIComponent(slug);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded);
    return isUuid ? 'Creator Profile' : decoded;
  };

  const pageLabel = overrideLabel
    ?? (isCreatorDetail
      ? fallbackDetailLabel(pathname.split('/creators/')[1] ?? '')
      : isBrandDetail
      ? decodeURIComponent(pathname.split('/brands/')[1] ?? '')
      : (BREADCRUMB_MAP[pathname] ?? labelFromPath(pathname)));

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  const initials = userName
    ? userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : userEmail
    ? userEmail[0].toUpperCase()
    : '?';

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-3 sm:px-5 border-b border-border bg-card">
      {/* Left: mobile menu + breadcrumb */}
      <div className="flex min-w-0 flex-1 items-center gap-2 pr-2 sm:gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden shrink-0 p-2 rounded-lg hover:bg-muted transition-colors"
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5 text-muted-foreground" />
        </button>

        <div className="shrink-0 lg:hidden">
          <TempoLogo size="sm" animated />
        </div>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm min-w-0">
          <span className="text-muted-foreground hidden sm:inline text-xs">{tenantName ?? 'Tempo'}</span>
          <ChevronRight className="h-3 w-3 text-muted-foreground hidden sm:block" />
          {isCreatorDetail && (
            <>
              <Link href="/roster" className="text-muted-foreground hover:text-foreground text-xs transition-colors hidden sm:inline">Creators</Link>
              <ChevronRight className="h-3 w-3 text-muted-foreground hidden sm:block" />
            </>
          )}
          {isBrandDetail && (
            <>
              <Link href="/brands" className="text-muted-foreground hover:text-foreground text-xs transition-colors hidden sm:inline">Brands</Link>
              <ChevronRight className="h-3 w-3 text-muted-foreground hidden sm:block" />
            </>
          )}
          <span className="font-semibold text-foreground text-sm truncate">{pageLabel}</span>
        </nav>
      </div>

      {/* Right: tenant switcher + action icons + avatar */}
      <div className="flex shrink-0 items-center gap-1">
        {tenantSwitcher && <div className="hidden sm:block mr-2">{tenantSwitcher}</div>}



        {/* Comms lives in the sidebar (its own destination) — the old
            /messages header shortcut is gone with the Comms-hub rebuild. */}

        {/* Light / dark toggle */}
        <ThemeToggle />

        {/* Divider */}
        <div className="w-px h-6 bg-secondary mx-1" />

        <AccountMenu name={userName} email={userEmail} initials={initials} isAdmin={isAdmin} onLogout={handleLogout} />
      </div>
    </header>
  );
}
