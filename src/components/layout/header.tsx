'use client';

import { Menu, User, ChevronDown } from 'lucide-react';

interface HeaderProps {
  onMenuClick?: () => void;
  /** When true, shows the brand filter/selector */
  showBrandFilter?: boolean;
  /** Current tenant name for display */
  tenantName?: string;
}

/** Top header with conditional brand filter and user menu */
export function Header({ onMenuClick, showBrandFilter = false, tenantName }: HeaderProps) {
  return (
    <header className="flex items-center justify-between h-14 px-6 border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg hover:bg-muted"
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h2 className="text-sm font-medium text-muted-foreground">
          {tenantName ?? 'Operations Center'}
        </h2>

        {/* Brand selector — only shown for multi-brand tenants */}
        {showBrandFilter && (
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/50 text-sm hover:bg-muted transition-colors">
            <span>All Brands</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </header>
  );
}
