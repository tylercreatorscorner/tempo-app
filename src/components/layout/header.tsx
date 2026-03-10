'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu, User, ChevronRight, LogOut, Settings } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { createClient } from '@/lib/supabase/client';

interface HeaderProps {
  onMenuClick?: () => void;
  tenantName?: string;
  userName?: string;
  userEmail?: string;
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
};

export function Header({ onMenuClick, tenantName, userName, userEmail }: HeaderProps) {
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

  // Close menu on outside click
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
    <header className="flex items-center justify-between h-14 px-3 sm:px-6 border-b border-gray-200 bg-white">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5 text-gray-600" />
        </button>

        {/* Mobile logo */}
        <div className="lg:hidden">
          <TempoLogo size="sm" animated />
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-sm min-w-0">
          <span className="text-gray-400 hidden sm:inline">{tenantName ?? 'Tempo'}</span>
          <ChevronRight className="h-3.5 w-3.5 text-gray-300 hidden sm:block" />
          {isCreatorDetail && (
            <>
              <Link href="/creators" className="text-gray-400 hover:text-gray-700 transition-colors">Creators</Link>
              <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
            </>
          )}
          {isBrandDetail && (
            <>
              <Link href="/brands" className="text-gray-400 hover:text-gray-700 transition-colors">Brands</Link>
              <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
            </>
          )}
          <span className="font-medium text-gray-900 truncate">{pageLabel}</span>
        </div>
      </div>

      {/* User menu */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#FF4D8D] to-[#7C5CFC] flex items-center justify-center text-white text-xs font-bold">
            {initials}
          </div>
          {userName && (
            <span className="hidden sm:block text-sm font-medium text-gray-700 max-w-[120px] truncate">
              {userName}
            </span>
          )}
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-900 truncate">{userName || 'User'}</p>
              <p className="text-xs text-gray-500 truncate">{userEmail}</p>
            </div>
            <Link
              href="/settings"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Settings className="h-4 w-4" /> Settings
            </Link>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
