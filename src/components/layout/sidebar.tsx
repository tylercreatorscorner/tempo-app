'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Store, BarChart3, Users, Settings, CreditCard, MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TempoLogo } from '@/components/ui/tempo-logo';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/brands', label: 'Brands', icon: Store },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/creators', label: 'Creators', icon: Users },
  { href: '/payments', label: 'Payments', icon: CreditCard },
  { href: '/discord-posts', label: 'Discord Posts', icon: MessageSquare },
];

const SETTINGS_ITEMS = [
  { href: '/settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();

  const renderItem = (item: typeof NAV_ITEMS[0]) => {
    const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
    return (
      <Link
        key={item.href}
        href={item.href}
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
    <aside className={cn('flex flex-col w-64 bg-[#F8F9FC] border-r border-gray-200 h-screen', className)}>
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b border-gray-200">
        <TempoLogo size="md" animated={false} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(renderItem)}
        <div className="my-3 mx-3 border-t border-gray-200" />
        {SETTINGS_ITEMS.map(renderItem)}
      </nav>

      {/* Version footer */}
      <div className="px-6 py-4 border-t border-gray-200">
        <p className="text-xs text-gray-400">Tempo v2.0</p>
      </div>
    </aside>
  );
}
