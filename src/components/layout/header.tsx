'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu, ChevronRight, LogOut, Settings, Bell, MessageSquare } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { createClient } from '@/lib/supabase/client';

interface HeaderProps {
  onMenuClick?: () => void;
  tenantName?: string;
  userName?: string;
  userEmail?: string;
  tenantSwitcher?: React.ReactNode;
}

const BREADCRUMB_MAP: Record<string, string> = {
  '/': 'Dashboard',
  '/dashboard': 'Dashboard',
  '/brands': 'Brands',
  '/analytics': 'Analytics',
  '/creators': 'Creators',
  '/payments': 'Payments',
  '/settings': 'Settings',
  '/roster': 'My Creators',
  '/messages': 'Messages',
  '/discover': 'Discover',
  '/reporting': 'Reporting',
};

export function Header({ onMenuClick, tenantName, userName, userEmail, tenantSwitcher }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isCreatorDetail = pathname.startsWith('/creators/') && pathname !== '/creators';
  const isBrandDetail = pathname.startsWith('/brands/') && pathname !== '/brands';
  const pageLabel = isCreatorDetail
    ? decodeURIComponent(pathname.split('/creators/')[1] ?? '')
    : isBrandDetail
    ? decodeURIComponent(pathname.split('/brands/')[1] ?? '')
    : (BREADCRUMB_MAP[pathname] ?? 'Dashboard');

  useEffect(() => {
    if (!menuOpen) return;
    function handler(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

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
    <header className="flex items-center justify-between h-14 px-3 sm:px-5 border-b border-gray-100 bg-white">
      {/* Left: mobile menu + breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5 text-gray-600" />
        </button>

        <div className="lg:hidden">
          <TempoLogo size="sm" animated />
        </div>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm min-w-0">
          <span className="text-gray-400 hidden sm:inline text-xs">{tenantName ?? 'Tempo'}</span>
          <ChevronRight className="h-3 w-3 text-gray-300 hidden sm:block" />
          {isCreatorDetail && (
            <>
              <Link href="/creators" className="text-gray-400 hover:text-gray-700 text-xs transition-colors hidden sm:inline">Creators</Link>
              <ChevronRight className="h-3 w-3 text-gray-300 hidden sm:block" />
            </>
          )}
          {isBrandDetail && (
            <>
              <Link href="/brands" className="text-gray-400 hover:text-gray-700 text-xs transition-colors hidden sm:inline">Brands</Link>
              <ChevronRight className="h-3 w-3 text-gray-300 hidden sm:block" />
            </>
          )}
          <span className="font-semibold text-gray-900 text-sm truncate">{pageLabel}</span>
        </nav>
      </div>

      {/* Right: tenant switcher + action icons + avatar */}
      <div className="flex items-center gap-1">
        {tenantSwitcher && <div className="hidden sm:block mr-2">{tenantSwitcher}</div>}

        {/* Notifications */}
        <button className="relative p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
          <Bell className="h-4.5 w-4.5 h-[18px] w-[18px]" />
          {/* Unread badge */}
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#FF4D8D] ring-2 ring-white" />
        </button>

        {/* Messages shortcut */}
        <Link
          href="/messages"
          className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <MessageSquare className="h-[18px] w-[18px]" />
        </Link>

        {/* Divider */}
        <div className="w-px h-6 bg-gray-200 mx-1" />

        {/* User avatar + dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] flex items-center justify-center text-white text-xs font-bold shadow-sm">
              {initials}
            </div>
            {userName && (
              <span className="hidden sm:block text-sm font-medium text-gray-700 max-w-[120px] truncate">
                {userName}
              </span>
            )}
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-gray-100 rounded-xl shadow-xl shadow-black/8 py-1.5 z-50">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900 truncate">{userName || 'User'}</p>
                <p className="text-xs text-gray-400 truncate mt-0.5">{userEmail}</p>
              </div>
              <div className="py-1">
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <Settings className="h-4 w-4" /> Settings
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
