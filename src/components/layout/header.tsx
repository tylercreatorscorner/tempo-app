'use client';

import { AccountMenu } from './account-menu';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { createClient } from '@/lib/supabase/client';
import { useBreadcrumbOverride } from '@/components/layout/breadcrumb-context';
import styles from './workspace-theme.module.css';

interface HeaderProps {
  onMenuClick?: () => void;
  tenantName?: string;
  userName?: string;
  userEmail?: string;
  tenantSwitcher?: React.ReactNode;
  /** Owner/admin (impersonation-aware) — gates the User Management menu entry. */
  isAdmin?: boolean;
  canInviteMembers?: boolean;
}

// Every nav destination AND every SectionTabs sub-view. Keep in sync with
// section-tabs.tsx — a route missing here used to fall through to the literal
// string 'Dashboard', so ~2/3 of the app (Earnings, Retention, Affiliates, YTD,
// Invoicing, Products, Team, Upload, Workflows…) displayed the wrong page name
// in the breadcrumb. The tab consolidation added the routes but not the map.
const BREADCRUMB_MAP: Record<string, string> = {
  '/agency': 'Agency overview',
  '/agency/clients': 'Agency · Clients',
  '/agency/revenue': 'Agency · Revenue',
  '/agency/finance': 'Agency · Client finance',
  '/agency/reports': 'Agency · Reports',
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
  '/reporting/coaching': 'Coaching',
  '/reporting/coaching/elite': 'Coaching · Creator performance',
  '/earnings/settings': 'Finance setup',
  '/roster/invitations': 'Onboarding',
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
  '/team': 'People & Access',
  '/upload': 'Data & Imports',
  '/workflows/automations': 'Automations',
  '/workflows/integrations': 'Connections',
  '/workflows/outreach': 'Outreach',
  // Other
  '/brands': 'Brands',
  '/messages': 'Communications',
  '/drops': 'Discord posts',
  '/roster/discord-sync': 'Discord groups',
  '/discord-links': 'Discord identity review',
  '/discord-scan': 'Discord scan',
  '/reporting/weekly': 'Weekly manager report',
  '/reporting/agency/weekly': 'Weekly agency brief',
  '/dashboard/reviews': 'Manager reviews',
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

export function Header({ onMenuClick, tenantName, userName, userEmail, tenantSwitcher, isAdmin, canInviteMembers }: HeaderProps) {
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
    <header className={styles.header}>
      {/* Left: mobile menu + breadcrumb */}
      <div className={styles.headerLead}>
        <button
          onClick={onMenuClick}
          type="button"
          className={styles.menuButton}
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5 text-muted-foreground" />
        </button>

        <div className={styles.mobileLogo}>
          <TempoLogo size="sm" animated={false} />
        </div>

        {/* Breadcrumb */}
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <span className={styles.tenantLabel} title={tenantName}>{tenantName ?? 'Tempo'}</span>
          <span className={styles.breadcrumbSeparator} aria-hidden="true">/</span>
          {isCreatorDetail && (
            <>
              <Link href="/roster" className={styles.parentLink}>Creators</Link>
              <span className={styles.breadcrumbSeparator} aria-hidden="true">/</span>
            </>
          )}
          {isBrandDetail && (
            <>
              <Link href="/brands" className={styles.parentLink}>Brands</Link>
              <span className={styles.breadcrumbSeparator} aria-hidden="true">/</span>
            </>
          )}
          <span className={styles.pageLabel} title={pageLabel} aria-current="page">{pageLabel}</span>
        </nav>
      </div>

      {/* Right: tenant switcher + action icons + avatar */}
      <div className={styles.headerActions}>
        {tenantSwitcher && <div className={styles.tenantSwitcher}>{tenantSwitcher}</div>}

        {/* Light / dark toggle */}
        <ThemeToggle size="sm" />

        {/* Divider */}
        <div className={styles.headerDivider} />

        <AccountMenu name={userName} email={userEmail} initials={initials} isAdmin={isAdmin} canInviteMembers={canInviteMembers} onLogout={handleLogout} />
      </div>
    </header>
  );
}
