'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { LayoutDashboard, Users, PlaySquare, Wallet, Boxes, Settings as SettingsIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { BrandSwitcher } from '@/components/layout/brand-switcher';
import { SystemStatusFooter } from '@/components/layout/system-status-footer';

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

interface SidebarProps {
  className?: string;
  /** Owner/admin (impersonation-aware) — gates admin-only destinations. */
  isAdmin?: boolean;
  /** Finance visibility (impersonation-aware) — gates the Finance destination. */
  canViewFinance?: boolean;
}

export function Sidebar({ className, isAdmin = false, canViewFinance = true }: SidebarProps) {
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
        className={cn(
          'group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150',
          active ? 'bg-primary/10 text-[var(--primary)] font-medium' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50',
        )}
      >
        <d.icon className={cn('h-4 w-4 flex-shrink-0 transition-colors', active ? 'text-[var(--primary)]' : 'text-gray-400 group-hover:text-gray-600')} />
        {d.label}
        {active && <span className="ml-auto w-1 h-4 rounded-full bg-[var(--primary)]" />}
      </Link>
    );
  };

  const setup = SETUP.filter(visible);

  return (
    <aside
      className={cn(
        'sticky top-0 flex flex-col w-64 h-screen bg-white border-r border-gray-100 shrink-0',
        className,
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-5">
        <TempoLogo size="md" animated />
      </div>

      {/* Destinations */}
      <nav className="flex-1 min-h-0 px-2 py-1 overflow-y-auto space-y-0.5">
        {PRIMARY.filter(visible).map(renderItem)}

        {setup.length > 0 && (
          <>
            <div className="pt-4 pb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-300">Setup</div>
            {setup.map(renderItem)}
          </>
        )}
      </nav>

      {/* System health — admin-only footer indicator. */}
      {isAdmin && (
        <div className="px-2 pt-2 border-t border-gray-100">
          <SystemStatusFooter />
        </div>
      )}

      {/* Brand selector pinned to bottom */}
      <div className="px-2 pb-4 pt-2 border-t border-gray-100">
        <BrandSwitcher />
      </div>
    </aside>
  );
}
