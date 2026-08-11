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
  ChevronDown,
  Check,
  Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { readableOn, tintOver } from '@/lib/utils/brand-color';
import { createClient } from '@/lib/supabase/client';
import type { BrandPortalBrand, BrandPortalContext } from '@/lib/data/brand-portal';
import { setActiveBrand } from '@/app/actions/brand-switch';

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

/**
 * The two card colours the brand portal ever paints text on, from globals.css.
 * Kept as literals on purpose: `readableOn` needs a real hex to measure, and
 * `var(--card)` is a string the maths cannot see.
 */
const CARD_LIGHT = '#FFFFFF';
const CARD_DARK = '#17182F';

/**
 * Brand accent, resolved for BOTH themes up front.
 *
 * A brand accent is chosen to look like the brand, not to be legible, and
 * whether it needs darkening or lightening depends on the theme — measured,
 * 22 of 29 brand colours fail WCAG AA as text on the light card and a
 * DIFFERENT 13 fail on the dark one (Kalshi #3949AB at 2.25:1, Neurogum
 * #8E24AA at 2.47:1). So there is no single correct hex.
 *
 * The theme is a class on <html>, applied in the browser; these pages render
 * on the server, which cannot know it. So both answers are emitted as custom
 * properties here and CSS picks (see `.brand-scope` in globals.css). Any
 * brand-coloured TEXT or ICON must use var(--brand-ink) — never the raw
 * accent, and never a server-side readableOn() call, which can only be right
 * in one theme.
 *
 * Fills, bars, dots and chip backgrounds keep the raw accent: they are not
 * read, so AA does not apply.
 */
function brandInkVars(accent: string): React.CSSProperties {
  return {
    '--brand-ink-l': readableOn(accent, CARD_LIGHT),
    '--brand-ink-d': readableOn(accent, CARD_DARK),
    // Text sitting ON an `${accent}14` / `${accent}18` chip. Blend first, then
    // measure: deriving against the plain card puts Lemme's ink at 2.90:1 on
    // its own yellow tint even though it clears 4.5:1 on white.
    '--brand-ink-14-l': readableOn(accent, tintOver(accent, '14', CARD_LIGHT)),
    '--brand-ink-14-d': readableOn(accent, tintOver(accent, '14', CARD_DARK)),
    '--brand-ink-18-l': readableOn(accent, tintOver(accent, '18', CARD_LIGHT)),
    '--brand-ink-18-d': readableOn(accent, tintOver(accent, '18', CARD_DARK)),
  } as React.CSSProperties;
}

export function BrandShell({ context, children }: BrandShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { activeBrand, user } = context;
  const accentColor = activeBrand.color || 'var(--primary)';

  // Body-scroll layout (matches admin shell): outer is min-h-screen so the
  // page scrolls naturally; sidebar/header are sticky-pinned. Without this,
  // mouse-wheel scrolling only works when the cursor is over <main>, which
  // is unintuitive (every other website scrolls regardless of cursor position).
  return (
    <div
      className="brand-scope flex min-h-screen"
      style={{ backgroundColor: 'var(--background)', ...brandInkVars(activeBrand.color || '#4B45FF') }}
    >
      <BrandSidebar
        className="hidden lg:flex sticky top-0 h-screen"
        accentColor={accentColor}
        activeBrand={activeBrand}
        brands={context.brands}
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
              activeBrand={activeBrand}
              brands={context.brands}
              onNavigate={() => setMobileNavOpen(false)}
            />
            <button
              onClick={() => setMobileNavOpen(false)}
              className="absolute -right-10 top-4 p-2 rounded-lg bg-card shadow"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <BrandHeader
          onMenuClick={() => setMobileNavOpen(true)}
          userName={user.name}
          userEmail={user.email}
          brandName={activeBrand.display_name || activeBrand.name}
        />
        <main className="flex-1 animate-fade-in">
          <div className="p-3 sm:p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

interface BrandSidebarProps {
  className?: string;
  accentColor: string;
  activeBrand: BrandPortalBrand;
  brands: BrandPortalBrand[];
  onNavigate?: () => void;
}

function BrandSidebar({
  className,
  accentColor,
  activeBrand,
  brands,
  onNavigate,
}: BrandSidebarProps) {
  const brandName = activeBrand.display_name || activeBrand.name;
  const brandLogo = activeBrand.logo_url;
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'flex flex-col w-64 h-screen bg-card border-r border-border',
        className,
      )}
    >
      <div className="flex items-center gap-2 px-5 py-5">
        <TempoLogo size="md" animated />
      </div>

      <nav className="flex-1 min-h-0 px-2 py-1 overflow-y-auto space-y-0.5">
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
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
              // Label and icon read var(--brand-ink-14), not the raw accent:
              // this is text sitting on an 8% accent chip, and the raw colour
              // fails AA there for most brands in one theme or the other.
              // The 4px rail below IS the raw accent — it is a fill.
              style={
                active
                  ? { backgroundColor: `${accentColor}14`, color: 'var(--brand-ink-14)' }
                  : undefined
              }
            >
              <item.icon
                className={cn(
                  'h-4 w-4 flex-shrink-0 transition-colors',
                  active
                    ? ''
                    : 'text-muted-foreground group-hover:text-muted-foreground',
                )}
                style={active ? { color: 'var(--brand-ink-14)' } : undefined}
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

      {/* Brand identity at the bottom — dropdown switcher when user has multiple brands */}
      <div className="px-3 pb-4 pt-3 border-t border-border">
        <BrandSwitcher
          activeBrand={activeBrand}
          brands={brands}
          accentColor={accentColor}
        />
      </div>
    </aside>
  );
}

/**
 * Brand switcher styled to match the admin BrandSwitcher
 * (src/components/layout/brand-switcher.tsx) for visual consistency:
 *   - rounded-xl button with a small color dot + ChevronDown
 *   - Upward-opening dropdown with "Switch Brand" header and small dots
 *   - Active item uses the active brand's tinted background
 */
function BrandSwitcher({
  activeBrand,
  brands,
  accentColor,
}: {
  activeBrand: BrandPortalBrand;
  brands: BrandPortalBrand[];
  accentColor: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasMultiple = brands.length > 1;
  const activeColor = activeBrand.color || accentColor;
  const activeLabel = activeBrand.display_name || activeBrand.name;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!hasMultiple) {
    // Single-brand: static pill with the same shape as the trigger button
    return (
      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border bg-card text-sm font-medium text-foreground">
        {activeColor ? (
          <span
            className="w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-card shadow-sm"
            style={{ backgroundColor: activeColor }}
          />
        ) : (
          <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        )}
        <span className="flex-1 text-left truncate">{activeLabel}</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      {/* Dropdown — opens upward */}
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1.5 bg-card border border-border rounded-xl shadow-xl shadow-black/10 py-1.5 z-50 animate-fade-in max-h-[60vh] overflow-y-auto">
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground select-none">
            Switch Brand
          </p>
          {brands.map((b) => {
            const isActive = b.slug === activeBrand.slug;
            const dotColor = b.color || 'var(--muted-foreground)';
            return (
              <form key={b.slug} action={setActiveBrand.bind(null, b.slug)}>
                <button
                  type="submit"
                  disabled={isActive}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
                    isActive
                      ? 'bg-muted text-foreground font-medium cursor-default'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                  style={
                    isActive ? { backgroundColor: `${dotColor}10` } : undefined
                  }
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm"
                    style={{ backgroundColor: dotColor }}
                  />
                  <span className="flex-1 text-left truncate">
                    {b.display_name || b.name}
                  </span>
                  {isActive && (
                    <Check
                      className="h-3.5 w-3.5 flex-shrink-0"
                      style={{ color: dotColor }}
                    />
                  )}
                </button>
              </form>
            );
          })}
        </div>
      )}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
          'border hover:shadow-sm',
          open
            ? 'bg-muted border-border text-foreground'
            : 'bg-card border-border text-foreground hover:bg-muted',
        )}
      >
        <span
          className="w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-card shadow-sm"
          style={{ backgroundColor: activeColor }}
        />
        <span className="flex-1 text-left truncate">{activeLabel}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
    </div>
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
    <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-3 sm:px-5 border-b border-border bg-card">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg hover:bg-muted transition-colors"
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5 text-muted-foreground" />
        </button>

        <div className="lg:hidden">
          <TempoLogo size="sm" animated />
        </div>

        <nav className="flex items-center gap-1.5 text-sm min-w-0">
          <span className="text-muted-foreground hidden sm:inline text-xs">{brandName}</span>
          <ChevronRight className="h-3 w-3 text-muted-foreground hidden sm:block" />
          <span className="font-semibold text-foreground text-sm truncate">{pageLabel}</span>
        </nav>
      </div>

      <div className="flex items-center gap-1">
        {/* Same component the admin and creator shells use, so the three
            surfaces can't drift. It was missing here, which is the only
            reason dark mode was unreachable for a client. */}
        <ThemeToggle size="sm" />
        <div className="w-px h-6 bg-border mx-1.5" />

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            {/* Literal Pulse pair, not var(--primary)/var(--pulse-accent-2):
                those flip to #5AA6FF/#B06BFF in dark and the white initials
                land at roughly 2.4:1 on them. The avatar is meant to be a deep
                indigo chip in both themes. The admin header (header.tsx) still
                carries the token version and has the same problem — not
                changed here because it is a different surface. */}
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#4B45FF] to-[#9A37EF] flex items-center justify-center text-white text-xs font-bold shadow-sm">
              {initials}
            </div>
            {userName && (
              <span className="hidden sm:block text-sm font-medium text-foreground max-w-[120px] truncate">
                {userName}
              </span>
            )}
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-56 bg-card border border-border rounded-xl shadow-xl shadow-black/8 py-1.5 z-50">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold text-foreground truncate">
                  {userName || 'Brand User'}
                </p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{userEmail}</p>
              </div>
              <div className="py-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
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
