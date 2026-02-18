'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Store, BarChart3, Users, Settings, CreditCard,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/brands', label: 'Brands', icon: Store },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/creators', label: 'Creators', icon: Users },
  { href: '/payments', label: 'Payments', icon: CreditCard },
  { href: '/settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  className?: string;
}

/** Dark sidebar navigation for admin portal */
export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className={cn('flex flex-col w-64 bg-sidebar border-r border-sidebar-border h-screen', className)}>
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b border-sidebar-border">
        <div className="h-8 w-8 rounded-lg bg-tempo-pink flex items-center justify-center">
          <span className="text-white font-bold text-sm">T</span>
        </div>
        <span className="text-lg font-semibold text-sidebar-foreground">Tempo</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-primary'
                  : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
