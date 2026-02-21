'use client';

import Link from 'next/link';
import { Menu, User, ChevronDown, ChevronRight } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { TempoLogo } from '@/components/ui/tempo-logo';

interface HeaderProps {
  onMenuClick?: () => void;
  showBrandFilter?: boolean;
  tenantName?: string;
}

const BREADCRUMB_MAP: Record<string, string> = {
  '/': 'Dashboard',
  '/brands': 'Brands',
  '/analytics': 'Analytics',
  '/creators': 'Creators',
  '/payments': 'Payments',
  '/settings': 'Settings',
};

export function Header({ onMenuClick, showBrandFilter = false, tenantName }: HeaderProps) {
  const pathname = usePathname();
  const isCreatorDetail = pathname.startsWith('/creators/') && pathname !== '/creators';
  const pageLabel = isCreatorDetail
    ? decodeURIComponent(pathname.split('/creators/')[1] ?? '')
    : (BREADCRUMB_MAP[pathname] ?? 'Dashboard');

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
          <span className="font-medium text-gray-900 truncate">{pageLabel}</span>
        </div>

        {showBrandFilter && (
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 bg-white text-sm hover:bg-gray-50 transition-colors text-gray-600">
            <span>All Brands</span>
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-pink-50 border border-pink-100 flex items-center justify-center hover:bg-pink-100 transition-colors cursor-pointer">
          <User className="h-4 w-4 text-[#FF4D8D]" />
        </div>
      </div>
    </header>
  );
}
