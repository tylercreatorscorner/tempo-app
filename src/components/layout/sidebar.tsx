'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard, Store, BarChart3, UserCheck, Settings, CreditCard, Mail, ScanSearch, Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { BrandSwitcher } from '@/components/layout/brand-switcher';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const CUSTOMER_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/roster', label: 'My Creators', icon: UserCheck },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/messages', label: 'Messages', icon: Mail },
  { href: '/payments', label: 'Payments', icon: CreditCard },
];

const OWNER_EXTRA: NavItem[] = [
  { href: '/brands', label: 'All Brands', icon: Store },
  { href: '/system', label: 'System Health', icon: Shield },
  { href: '/discord-scan', label: 'Discord Scan', icon: ScanSearch },
];

const SETTINGS_NAV: NavItem[] = [
  { href: '/settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  className?: string;
  userRole?: 'owner' | 'customer';
}

export function Sidebar({ className, userRole = 'customer' }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const brand = searchParams.get('brand');

  // Dev override: ?role=owner
  const roleOverride = searchParams.get('role');
  const effectiveRole = roleOverride === 'owner' ? 'owner' : userRole;

  const navItems = effectiveRole === 'owner'
    ? [...CUSTOMER_NAV, ...OWNER_EXTRA]
    : CUSTOMER_NAV;

  /** Build href preserving current brand filter */
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
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200',
          isActive
            ? 'bg-pink-50 text-[#FF4D8D] font-medium border-l-2 border-[#FF4D8D] ml-0 shadow-sm'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 border-l-2 border-transparent'
        )}
      >
        <item.icon className="h-4 w-4" />
        {item.label}
      </Link>
    );
  };

  return (
    <aside className={cn('flex flex-col w-64 border-r h-screen', className)} style={{ backgroundColor: '#FFFFFF', borderColor: '#E5E7EB' }}>
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b border-gray-200">
        <TempoLogo size="md" animated />
      </div>

      {/* Brand Switcher */}
      <div className="py-3 border-b border-gray-200 relative z-50">
        <BrandSwitcher />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 relative z-0">
        {navItems.map(renderItem)}
        <div className="my-3 mx-3 border-t border-gray-200" />
        {SETTINGS_NAV.map(renderItem)}
      </nav>

      {/* Version footer */}
      <div className="px-6 py-4 border-t border-gray-200">
        <p className="text-xs text-gray-400">Tempo</p>
      </div>
    </aside>
  );
}
