'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Video,
  FileText,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { createClient } from '@/lib/supabase/client';
import type { BrandPortalContext } from '@/lib/data/brand-portal';

const NAV_ITEMS = [
  { href: '/brand-dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/brand-dashboard/creators', label: 'Creators', icon: Users },
  { href: '/brand-dashboard/videos', label: 'Videos', icon: Video },
  { href: '/brand-dashboard/reports', label: 'Reports', icon: FileText },
  { href: '/brand-dashboard/settings', label: 'Settings', icon: SettingsIcon },
];

const BREADCRUMB_MAP: Record<string, string> = {
  '/brand-dashboard': 'Overview',
  '/brand-dashboard/creators': 'Creators',
  '/brand-dashboard/videos': 'Videos',
  '/brand-dashboard/reports': 'Reports',
  '/brand-dashboard/settings': 'Settings',
};

interface BrandShellProps {
  context: BrandPortalContext;
  children: React.ReactNode;
}

export function BrandShell({ context, children }: BrandShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { activeBrand, user } = context;
  const accentColor = activeBrand.color || '#FF4D8D';

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#F8F9FC' }}>
      <BrandSidebar
        className="hidden lg:flex"
        accentColor={accentColor}
        brandName={activeBrand.display_name || activeBrand.name}
        brandLogo={activeBrand.logo_url}
      />

      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="relative">
            <BrandSidebar
              accentColor={accentColor}
              brandName={activeBrand.display_name || activeBrand.name}
              brandLogo={activeBrand.logo_url}
              onNavigate={() => setMobileNavOpen(false)}
            />
            <button
              onClick={() => setMobileNavOpen(false)}
              className="absolute -right-10 top-4 p-2 rounded-lg bg-white shadow"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <BrandHeader
          onMenuClick={() => setMobileNavOpen(true)}
          userName={user.name}
          userEmail={user.email}
          brandName={activeBrand.display_name || activeBrand.name}
        />
        <main className="flex-1 overflow-y-auto animate-fade-in">
          <div className="p-3 sm:p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

interface BrandSidebarProps {
  className?: string;
  accentColor: string;
  brandName: string;
  brandLogo: string | null;
  onNavigate?: () => void;
}

function BrandSidebar({
  className,
  accentColor,
  brandName,
  brandLogo,
  onNavigate,
}: BrandSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'flex flex-col w-64 h-screen bg-white border-r border-gray-100',
        className,
      )}
    >
      <div className="flex items-center gap-2 px-5 py-5">
        <TempoLogo size="md" animated />
      </div>

      <nav className="flex-1 px-2 py-1 overflow-y-auto space-y-0.5">
        {NAV_ITEMS.map((item) => {
          // Reports / Settings: active when path is in their subtree
          // Overview: active for /brand-dashboard and any nested path NOT in another section
          let active: boolean;
          if (item.href === '/brand-dashboard') {
            const inOtherSection = NAV_ITEMS
              .filter((n) => n.href !== '/brand-dashboard')
              .some((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
            active = !inOtherSection;
          } else {
            active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150',
                active
                  ? 'font-medium'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50',
              )}
              style={
                active
                  ? { backgroundColor: `${accentColor}14`, color: accentColor }
                  : undefined
              }
            >
              <item.icon
                className={cn(
                  'h-4 w-4 flex-shrink-0 transition-colors',
                  active
                    ? ''
                    : 'text-gray-400 group-hover:text-gray-600',
                )}
                style={active ? { color: accentColor } : undefined}
              />
              {item.label}
              {active && (
                <span
                  className="ml-auto w-1 h-4 rounded-full"
                  style={{ backgroundColor: accentColor }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Brand identity at the bottom */}
      <div className="px-3 pb-4 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 overflow-hidden"
            style={{ backgroundColor: accentColor }}
          >
            {brandLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brandLogo} alt={brandName} className="h-full w-full object-cover" />
            ) : (
              brandName.slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest leading-none">
              Brand
            </p>
            <p className="text-sm font-semibold text-gray-900 truncate">{brandName}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

interface BrandHeaderProps {
  onMenuClick?: () => void;
  userName: string | null;
  userEmail: string;
  brandName: string;
}

function BrandHeader({
  onMenuClick,
  userName,
  userEmail,
  brandName,
}: BrandHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const pageLabel = BREADCRUMB_MAP[pathname] ?? 'Overview';

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
    ? userName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : userEmail
    ? userEmail[0].toUpperCase()
    : '?';

  return (
    <header className="flex items-center justify-between h-14 px-3 sm:px-5 border-b border-gray-100 bg-white">
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

        <nav className="flex items-center gap-1.5 text-sm min-w-0">
          <span className="text-gray-400 hidden sm:inline text-xs">{brandName}</span>
          <ChevronRight className="h-3 w-3 text-gray-300 hidden sm:block" />
          <span className="font-semibold text-gray-900 text-sm truncate">{pageLabel}</span>
        </nav>
      </div>

      <div className="flex items-center gap-1">
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
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {userName || 'Brand User'}
                </p>
                <p className="text-xs text-gray-400 truncate mt-0.5">{userEmail}</p>
              </div>
              <div className="py-1">
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
