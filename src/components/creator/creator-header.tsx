'use client';

import type { RefObject } from 'react';
import portal from '@/components/layout/portal-workspace.module.css';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, ChevronRight, LogOut, Settings } from 'lucide-react';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import type { CreatorProfile } from '@/lib/data/creator-context';

const BREADCRUMB_MAP: Record<string, string> = {
  '/creator-dashboard': 'Home',
  '/creator-dashboard/brands': 'My Brands',
  '/creator-dashboard/stats': 'Performance',
  '/creator-dashboard/rankings': 'Rankings',
  '/creator-dashboard/discover': 'Inspiration',
  '/creator-dashboard/settings': 'Settings',
};

function getInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'
  );
}

/**
 * Creator portal top header — mirrors the admin/brand shell Header: breadcrumb on
 * the left, theme toggle + the creator PROFILE menu on the top-right (moved out of
 * the sidebar). Sign out ends the creator session.
 */
export function CreatorHeader({
  profile,
  onMenuClick,
  menuButtonRef,
  mobileNavOpen = false,
}: {
  profile: CreatorProfile;
  onMenuClick?: () => void;
  menuButtonRef?: RefObject<HTMLButtonElement | null>;
  mobileNavOpen?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const pageLabel = BREADCRUMB_MAP[pathname] ?? 'Home';

  async function handleLogout() {
    await fetch('/api/auth/creator/logout', { method: 'POST' });
    router.push('/creator-login');
  }

  return (
    <header className={`${portal.portalHeader} sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card px-3 sm:px-5`}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          ref={menuButtonRef}
          aria-haspopup="dialog"
          aria-controls="creator-mobile-navigation"
          aria-expanded={mobileNavOpen}
          onClick={onMenuClick}
          className="min-h-11 min-w-11 rounded-lg p-2 transition-colors hover:bg-muted lg:hidden"
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5 text-muted-foreground" />
        </button>
        <div className="lg:hidden">
          <TempoLogo size="sm" animated={false} />
        </div>
        <nav className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex">
          <span className="hidden text-xs text-muted-foreground sm:inline">Creator Portal</span>
          <ChevronRight className="hidden h-3 w-3 text-muted-foreground sm:block" />
          <span className="truncate text-sm font-semibold text-foreground">{pageLabel}</span>
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle />

        <div className="mx-1 h-6 w-px bg-secondary" />

        <div className="relative" ref={menuRef}>
          <button
            aria-label="Open your account menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#6e4bcc] text-xs font-bold text-white shadow-sm">
              {getInitials(profile.real_name)}
            </div>
            <span className="hidden max-w-[120px] truncate text-sm font-medium text-foreground sm:block">
              {profile.real_name}
            </span>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-56 rounded-xl border border-border bg-card py-1.5 shadow-xl shadow-black/8">
              <div className="border-b border-border px-4 py-3">
                <p className="truncate text-sm font-semibold text-foreground">{profile.real_name}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">Creator</p>
              </div>
              <div className="py-1">
                <Link
                  href="/creator-dashboard/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                >
                  <Settings className="h-4 w-4 text-muted-foreground" /> Settings
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-500 transition-colors hover:bg-red-500/10"
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
