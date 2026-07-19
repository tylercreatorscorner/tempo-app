'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Menu, ChevronRight, Sun, Moon, LogOut } from 'lucide-react';
import { TempoLogo } from '@/components/ui/tempo-logo';
import type { CreatorProfile } from '@/lib/data/creator-context';

const BREADCRUMB_MAP: Record<string, string> = {
  '/creator-dashboard': 'Home',
  '/creator-dashboard/brands': 'My Brands',
  '/creator-dashboard/stats': 'Performance',
  '/creator-dashboard/rankings': 'Rankings',
  '/creator-dashboard/discover': 'Inspiration',
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
}: {
  profile: CreatorProfile;
  onMenuClick?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!menuOpen) return;
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menuOpen]);

  const pageLabel = BREADCRUMB_MAP[pathname] ?? 'Home';

  async function handleLogout() {
    await fetch('/api/auth/creator/logout', { method: 'POST' });
    router.push('/creator-login');
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card px-3 sm:px-5">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="rounded-lg p-2 transition-colors hover:bg-muted lg:hidden"
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5 text-muted-foreground" />
        </button>
        <div className="lg:hidden">
          <TempoLogo size="sm" animated />
        </div>
        <nav className="flex min-w-0 items-center gap-1.5 text-sm">
          <span className="hidden text-xs text-muted-foreground sm:inline">Creator Portal</span>
          <ChevronRight className="hidden h-3 w-3 text-muted-foreground sm:block" />
          <span className="truncate text-sm font-semibold text-foreground">{pageLabel}</span>
        </nav>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Toggle theme"
        >
          {mounted && resolvedTheme === 'dark' ? (
            <Sun className="h-[18px] w-[18px]" />
          ) : (
            <Moon className="h-[18px] w-[18px]" />
          )}
        </button>

        <div className="mx-1 h-6 w-px bg-secondary" />

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--pulse-accent-2)] text-xs font-bold text-white shadow-sm">
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
