'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Sparkles, BarChart3, Trophy, Menu, X, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { useState } from 'react';
import { BrandSwitcher } from '@/components/creator/brand-switcher';
import type { CreatorProfile } from '@/lib/data/creator-context';

const NAV_ITEMS: { href: string; label: string; icon: typeof Home; exact?: boolean; badge?: string }[] = [
  { href: '/creator-dashboard', label: 'Home', icon: Home, exact: true },
  { href: '/creator-dashboard/stats', label: 'Performance', icon: BarChart3 },
  { href: '/creator-dashboard/rankings', label: 'Rankings', icon: Trophy },
  { href: '/creator-dashboard/discover', label: 'Inspiration', icon: Sparkles },
];

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '??';
}

export function CreatorSidebar({ className, profile }: { className?: string; profile: CreatorProfile }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/creator/logout', { method: 'POST' });
    router.push('/creator-login');
  };

  return (
    <aside className={cn('flex flex-col w-64 border-r border-border h-screen bg-card', className)}>
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b border-border">
        <TempoLogo size="md" animated />
      </div>

      {/* Portal label + brand switcher */}
      <div className="px-6 pt-4 pb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Creator Portal</span>
        {profile.brands.length > 1 && (
          <BrandSwitcher brands={profile.brands} currentBrand={profile.current_brand} />
        )}
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
                  ? 'bg-primary/10 text-[var(--primary)] font-medium shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <item.icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--pulse-accent-2)] text-white">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User card */}
      <div className="px-4 py-4 border-t border-border">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--pulse-accent-2)] flex items-center justify-center text-white text-xs font-bold">
            {getInitials(profile.real_name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{profile.real_name}</p>
            <p className="text-xs text-muted-foreground">Creator</p>
          </div>
          <button onClick={handleLogout} className="text-muted-foreground hover:text-muted-foreground p-1" title="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

export function CreatorMobileNav({ profile }: { profile: CreatorProfile }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/creator/logout', { method: 'POST' });
    router.push('/creator-login');
  };

  return (
    <>
      {/* Mobile header */}
      <header className="lg:hidden flex items-center justify-between h-14 px-4 border-b border-border bg-card sticky top-0 z-40">
        <TempoLogo size="sm" animated={false} />
        <div className="flex items-center gap-2">
          {profile.brands.length > 1 && (
            <BrandSwitcher brands={profile.brands} currentBrand={profile.current_brand} />
          )}
          <button onClick={() => setOpen(true)} className="p-2 text-muted-foreground hover:text-foreground">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-72 bg-card shadow-xl animate-slide-in-right">
            <div className="flex items-center justify-between px-4 py-4 border-b border-border">
              <span className="font-semibold text-sm text-foreground">Menu</span>
              <button onClick={() => setOpen(false)} className="p-1 text-muted-foreground hover:text-muted-foreground">
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
                        ? 'bg-primary/10 text-[var(--primary)] font-medium'
                        : 'text-muted-foreground hover:bg-muted'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--pulse-accent-2)] text-white">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
            <div className="absolute bottom-0 left-0 right-0 px-4 py-4 border-t border-border">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--pulse-accent-2)] flex items-center justify-center text-white text-xs font-bold">
                  {getInitials(profile.real_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{profile.real_name}</p>
                  <p className="text-xs text-muted-foreground">Creator</p>
                </div>
                <button onClick={handleLogout} className="text-muted-foreground hover:text-muted-foreground p-1" title="Log out">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
