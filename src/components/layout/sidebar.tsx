'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard, BarChart3, UserCheck, Settings, CreditCard,
  Mail, Shield, Compass, FileBarChart, Store,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { BrandSwitcher } from '@/components/layout/brand-switcher';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

const MAIN_SECTION: NavSection = {
  items: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ],
};

const MANAGE_SECTION: NavSection = {
  label: 'Manage',
  items: [
    { href: '/roster', label: 'My Creators', icon: UserCheck },
    { href: '/discover', label: 'Discover', icon: Compass },
    { href: '/messages', label: 'Messages', icon: Mail },
  ],
};

const INSIGHTS_SECTION: NavSection = {
  label: 'Insights',
  items: [
    { href: '/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/reporting', label: 'Reporting', icon: FileBarChart },
  ],
};

const FINANCES_SECTION: NavSection = {
  label: 'Finances',
  items: [
    { href: '/payments', label: 'Payments', icon: CreditCard },
  ],
};

const ADMIN_SECTION: NavSection = {
  label: 'Admin',
  items: [
    { href: '/brands', label: 'All Brands', icon: Store },
    { href: '/system', label: 'System Health', icon: Shield },
  ],
};

const SETTINGS_SECTION: NavSection = {
  items: [
    { href: '/settings', label: 'Settings', icon: Settings },
  ],
};

interface SidebarProps {
  className?: string;
  userRole?: 'owner' | 'customer';
}

export function Sidebar({ className, userRole = 'customer' }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const brand = searchParams.get('brand');

  const roleOverride = searchParams.get('role');
  const effectiveRole = roleOverride === 'owner' ? 'owner' : userRole;

  const sections = effectiveRole === 'owner'
    ? [MAIN_SECTION, MANAGE_SECTION, INSIGHTS_SECTION, FINANCES_SECTION, ADMIN_SECTION]
    : [MAIN_SECTION, MANAGE_SECTION, INSIGHTS_SECTION, FINANCES_SECTION];

  function withBrand(href: string) {
    if (!brand) return href;
    return `${href}?brand=${brand}`;
  }

  const renderItem = (item: NavItem) => {
    const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
    return (
      <Link
        key={item.href}
        href={withBrand(item.href)}
        className={cn(
          'group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150',
          isActive
            ? 'bg-white/10 text-white font-medium'
            : 'text-gray-400 hover:text-gray-100 hover:bg-white/6'
        )}
      >
        <item.icon className={cn(
          'h-4 w-4 flex-shrink-0 transition-colors',
          isActive ? 'text-[#FF4D8D]' : 'text-gray-500 group-hover:text-gray-300'
        )} />
        {item.label}
        {isActive && (
          <span className="ml-auto w-1 h-4 rounded-full bg-[#FF4D8D]" />
        )}
      </Link>
    );
  };

  const renderSection = (section: NavSection, key: string) => (
    <div key={key} className="space-y-0.5">
      {section.label && (
        <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-gray-600 select-none">
          {section.label}
        </p>
      )}
      {section.items.map(renderItem)}
    </div>
  );

  return (
    <aside className={cn('flex flex-col w-64 h-screen', className)}
      style={{ backgroundColor: '#0F1117', borderRight: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-5">
        <TempoLogo size="md" animated />
      </div>

      {/* Nav sections */}
      <nav className="flex-1 px-2 py-1 overflow-y-auto space-y-0.5">
        {sections.map((s, i) => renderSection(s, `section-${i}`))}

        {/* Divider + Settings */}
        <div className="pt-3">
          <div className="mx-3 mb-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }} />
          {SETTINGS_SECTION.items.map(renderItem)}
        </div>
      </nav>

      {/* Brand selector pinned to bottom */}
      <div className="px-2 pb-4 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <BrandSwitcher dark />
      </div>
    </aside>
  );
}
