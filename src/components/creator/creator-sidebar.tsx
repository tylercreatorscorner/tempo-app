'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sun, Search, BarChart3, Trophy, Bot, BookOpen, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { useState } from 'react';

const NAV_ITEMS = [
  { href: '/creator-dashboard', label: 'Today', icon: Sun, exact: true },
  { href: '/creator-dashboard/discover', label: 'Discover', icon: Search },
  { href: '/creator-dashboard/stats', label: 'My Stats', icon: BarChart3 },
  { href: '/creator-dashboard/rankings', label: 'Rankings', icon: Trophy },
  { href: '/creator-dashboard/harmony', label: 'Harmony', icon: Bot, badge: 'AI' },
  { href: '/creator-dashboard/learn', label: 'Learn', icon: BookOpen },
];

export function CreatorSidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <aside className={cn('flex flex-col w-64 border-r border-gray-200 h-screen bg-white', className)}>
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b border-gray-200">
        <TempoLogo size="md" animated />
      </div>

      {/* Portal label */}
      <div className="px-6 pt-4 pb-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Creator Portal</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200',
                isActive
                  ? 'bg-pink-50 text-[#FF4D8D] font-medium shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              )}
            >
              <item.icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#7C5CFC] text-white">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User card */}
      <div className="px-4 py-4 border-t border-gray-200">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] flex items-center justify-center text-white text-xs font-bold">
            TC
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">Test Creator</p>
            <p className="text-xs text-gray-400">Creator</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function CreatorMobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Mobile header */}
      <header className="lg:hidden flex items-center justify-between h-14 px-4 border-b border-gray-200 bg-white sticky top-0 z-40">
        <TempoLogo size="sm" animated={false} />
        <button onClick={() => setOpen(true)} className="p-2 text-gray-600 hover:text-gray-900">
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-72 bg-white shadow-xl animate-slide-in-right">
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
              <span className="font-semibold text-sm text-gray-900">Menu</span>
              <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="px-3 py-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-all',
                      isActive
                        ? 'bg-pink-50 text-[#FF4D8D] font-medium'
                        : 'text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#7C5CFC] text-white">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
            <div className="absolute bottom-0 left-0 right-0 px-4 py-4 border-t border-gray-200">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] flex items-center justify-center text-white text-xs font-bold">
                  TC
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Test Creator</p>
                  <p className="text-xs text-gray-400">Creator</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
