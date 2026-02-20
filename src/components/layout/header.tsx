'use client';

import Link from 'next/link';
import { Menu, User, ChevronDown, ChevronRight } from 'lucide-react';
import { usePathname } from 'next/navigation';

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
    <header className="flex items-center justify-between h-14 px-3 sm:px-6 border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg hover:bg-muted transition-colors"
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-sm min-w-0">
          <span className="text-muted-foreground hidden sm:inline">{tenantName ?? 'Tempo'}</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 hidden sm:block" />
          {isCreatorDetail && (
            <>
              <Link href="/creators" className="text-muted-foreground hover:text-foreground transition-colors">Creators</Link>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
            </>
          )}
          <span className="font-medium truncate">{pageLabel}</span>
        </div>

        {showBrandFilter && (
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-muted/50 text-sm hover:bg-muted transition-colors">
            <span>All Brands</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center hover:bg-primary/25 transition-colors cursor-pointer">
          <User className="h-4 w-4 text-primary" />
        </div>
      </div>
    </header>
  );
}
