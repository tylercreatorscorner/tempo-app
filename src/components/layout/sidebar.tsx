'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard, UserCheck, CreditCard,
  Mail, Compass, FileBarChart, Upload, Calculator, Receipt, PlaySquare, CalendarRange,
  Plug, Zap, Megaphone, Package, ShoppingBag, Layers, ChevronDown,
  Users, FileText, Boxes, Workflow, Wallet, Wrench, Activity,
  Settings as SettingsIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TempoLogo } from '@/components/ui/tempo-logo';
import { BrandSwitcher } from '@/components/layout/brand-switcher';
import { SystemStatusFooter } from '@/components/layout/system-status-footer';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** When true, only owner/admin see this item (server-side gated too). */
  adminOnly?: boolean;
}

interface NavSection {
  label?: string;
  /** Icon shown to the left of the (collapsible) section header. */
  icon?: React.ComponentType<{ className?: string }>;
  items: NavItem[];
  /** When true, only owner/admin roles see this section. */
  adminOnly?: boolean;
}

// Option A nav structure (entity-based). Standard SaaS pattern — each
// section corresponds to a domain object the user thinks about.
//
// HOME    → Dashboard (today's snapshot)
// CRM     → creators (roster), messages, discover
// CONTENT → posts (with reviews), reporting (output)
// INSIGHTS → analytics
// FINANCE  → earnings, invoicing, payments
// ADMIN    → upload, settings (bottom)
//
// System health is surfaced as a footer status indicator, not a nav item.
// Brands + Products + Discord-Scan routes still exist but live outside
// the sidebar; can be reached by direct URL or future deeper sections.

const HOME_SECTION: NavSection = {
  items: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ],
};

const CREATORS_SECTION: NavSection = {
  label: 'Creators',
  icon: Users,
  items: [
    { href: '/roster',    label: 'Creators',  icon: UserCheck },
    { href: '/retention', label: 'Retention', icon: Activity },
    { href: '/segments',  label: 'Segments',  icon: Layers },
    { href: '/messages', label: 'Messages',    icon: Mail },
    { href: '/discover', label: 'Discover',    icon: Compass },
  ],
};

const CONTENT_SECTION: NavSection = {
  label: 'Content',
  icon: FileText,
  items: [
    { href: '/posts',     label: 'Posts',     icon: PlaySquare },
    { href: '/reporting', label: 'Reporting', icon: FileBarChart },
  ],
};

// Products: Catalog (define each brand's products → powers creator tagging +
// per-product GMV) and the Performance view (GMV by product). Owner/admin only.
const PRODUCTS_SECTION: NavSection = {
  label: 'Products',
  icon: Boxes,
  adminOnly: true,
  items: [
    { href: '/products/catalog', label: 'Catalog',     icon: Package },
    { href: '/products',         label: 'Performance', icon: ShoppingBag },
  ],
};

// Automations is brand-scoped (managers see/create/edit/run only their
// brands' automations; /api/automations enforces it). Integrations (tenant
// infra: Slack OAuth, API keys) and Outreach (mass-send) stay owner/admin.
const WORKFLOWS_SECTION: NavSection = {
  label: 'Workflows',
  icon: Workflow,
  items: [
    { href: '/workflows/integrations', label: 'Integrations', icon: Plug, adminOnly: true },
    { href: '/workflows/automations',  label: 'Automations',  icon: Zap },
    { href: '/workflows/outreach',     label: 'Outreach',     icon: Megaphone, adminOnly: true },
  ],
};

// Finance is visible to all Workspace roles. The pages + /api/earnings,
// /api/invoices, /api/payments routes scope every figure to the caller's
// brands (managers → their brands only; owner/admin → all). Rate-config
// editors (brand-settings, creator-rates) remain owner/admin-gated.
const FINANCE_SECTION: NavSection = {
  label: 'Finance',
  icon: Wallet,
  items: [
    { href: '/earnings',  label: 'Earnings',  icon: Calculator },
    { href: '/ytd',       label: 'Year-to-Date', icon: CalendarRange },
    { href: '/invoicing', label: 'Invoicing', icon: Receipt },
    { href: '/payments',  label: 'Payments',  icon: CreditCard },
  ],
};

// Settings is visible to all Workspace roles (managers get a scoped
// Profile-only view; owner/admin get full agency config). Upload stays
// owner/admin-only.
const ADMIN_SECTION: NavSection = {
  label: 'Admin',
  icon: Wrench,
  items: [
    { href: '/upload',   label: 'Upload',   icon: Upload, adminOnly: true },
    { href: '/settings', label: 'Settings', icon: SettingsIcon },
  ],
};



interface SidebarProps {
  className?: string;
  userRole?: 'owner' | 'customer';
}

export function Sidebar({ className, userRole = 'customer' }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const brand = searchParams.get('brand');

  const roleOverride = searchParams.get('role');
  const effectiveRole = roleOverride === 'owner' ? 'owner' : userRole;

  // Filter admin-only sections out for non-admin roles. Server-side gating on
  // the actual pages/APIs is the real security boundary — this is purely UX.
  const isAdmin = effectiveRole === 'owner';

  // Collapsible nav sections — collapsed by default (persisted to localStorage).
  // A section still auto-expands when it contains the current route, so you
  // never lose your place.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem('tempo_nav_expanded');
      if (raw) setExpanded(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
  }, []);
  const toggleSection = (label: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      try { localStorage.setItem('tempo_nav_expanded', JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };
  const sectionHasActive = (section: NavSection) =>
    section.items.some((it) => pathname === it.href || (it.href !== '/' && pathname.startsWith(it.href)));

  // Option A entity-based order: Home → Creators → Content → Insights → Finance → Admin.
  // Admin (with Upload + Settings) lives at the bottom because both are
  // maintenance/configuration surfaces, not daily-use destinations.
  const sections = [HOME_SECTION, CREATORS_SECTION, CONTENT_SECTION, FINANCE_SECTION, PRODUCTS_SECTION, WORKFLOWS_SECTION, ADMIN_SECTION]
    .filter(s => !s.adminOnly || isAdmin);

  function withBrand(href: string) {
    if (!brand) return href;
    return `${href}?brand=${brand}`;
  }

  const renderItem = (item: NavItem, nested = false) => {
    const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
    return (
      <Link
        key={item.href}
        href={withBrand(item.href)}
        className={cn(
          'group flex items-center gap-3 py-2 rounded-lg text-sm transition-all duration-150',
          // Nested (in a section) → no icon; indent the label so it aligns
          // under the section header's label.
          nested ? 'pl-10 pr-3' : 'px-3',
          isActive
            ? 'bg-pink-50 text-[#FF4D8D] font-medium'
            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
        )}
      >
        {!nested && (
          <item.icon className={cn(
            'h-4 w-4 flex-shrink-0 transition-colors',
            isActive ? 'text-[#FF4D8D]' : 'text-gray-400 group-hover:text-gray-600'
          )} />
        )}
        {item.label}
        {isActive && (
          <span className="ml-auto w-1 h-4 rounded-full bg-[#FF4D8D]" />
        )}
      </Link>
    );
  };

  const renderSection = (section: NavSection, key: string) => {
    const items = section.items.filter((it) => !it.adminOnly || isAdmin);
    if (items.length === 0) return null;
    // Ungrouped (Home) — no collapsible header.
    if (!section.label) {
      return <div key={key} className="space-y-0.5">{items.map((it) => renderItem(it))}</div>;
    }
    const open = sectionHasActive(section) || expanded.has(section.label);
    const SectionIcon = section.icon;
    return (
      <div key={key} className="space-y-0.5">
        <button
          type="button"
          onClick={() => toggleSection(section.label!)}
          className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-all duration-150"
        >
          {SectionIcon && (
            <SectionIcon className="h-4 w-4 flex-shrink-0 text-gray-400 group-hover:text-gray-600 transition-colors" />
          )}
          <span className="font-medium">{section.label}</span>
          <ChevronDown className={cn('ml-auto h-3.5 w-3.5 text-gray-400 transition-transform duration-200', open ? '' : '-rotate-90')} />
        </button>
        {open && (
          <div className="mt-0.5 space-y-0.5">
            {items.map((it) => renderItem(it, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className={cn(
        // sticky + h-screen so the sidebar stays in place while the page
        // body scrolls naturally — keeps scroll-anywhere behavior working
        // (the previous flex/overflow-hidden lock made wheel events only
        // work over <main>, breaking expectations).
        'sticky top-0 flex flex-col w-64 h-screen bg-white border-r border-gray-100 shrink-0',
        className
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-5">
        <TempoLogo size="md" animated />
      </div>

      {/* Nav sections */}
      <nav className="flex-1 min-h-0 px-2 py-1 overflow-y-auto space-y-0.5">
        {sections.map((s, i) => renderSection(s, `section-${i}`))}

      </nav>

      {/* System status — admin-only footer indicator. Pings /api/system/health
          and shows green/amber/red dot. Click → /system for full detail. */}
      {isAdmin && (
        <div className="px-2 pt-2 border-t border-gray-100">
          <SystemStatusFooter />
        </div>
      )}

      {/* Brand selector pinned to bottom */}
      <div className="px-2 pb-4 pt-2 border-t border-gray-100">
        <BrandSwitcher />
      </div>
    </aside>
  );
}
