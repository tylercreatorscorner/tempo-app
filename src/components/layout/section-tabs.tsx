'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

interface Tab {
  label: string;
  href: string;
  /** owner/admin only — hidden from managers (pages also enforce server-side). */
  admin?: boolean;
}

// The sub-views for each sidebar destination. One shared bar, driven by the URL,
// so pages don't each hand-roll their own tabs.
const SECTIONS: { key: string; tabs: Tab[] }[] = [
  { key: 'creators', tabs: [
    { label: 'Roster', href: '/roster' },
    { label: 'Retention', href: '/retention' },
    { label: 'Affiliates', href: '/affiliates' },
    { label: 'Segments', href: '/segments' },
  ] },
  { key: 'content', tabs: [
    { label: 'Posts', href: '/posts' },
    { label: 'Reporting', href: '/reporting' },
  ] },
  { key: 'finance', tabs: [
    { label: 'Earnings', href: '/earnings' },
    { label: 'Year-to-Date', href: '/ytd' },
    { label: 'Invoicing', href: '/invoicing' },
    { label: 'Payments', href: '/payments' },
  ] },
  { key: 'products', tabs: [
    { label: 'Catalog', href: '/products/catalog' },
    { label: 'Performance', href: '/products' },
  ] },
  { key: 'settings', tabs: [
    { label: 'General', href: '/settings' },
    { label: 'Team', href: '/team', admin: true },
    { label: 'Upload', href: '/upload', admin: true },
    { label: 'Automations', href: '/workflows/automations' },
    { label: 'Integrations', href: '/workflows/integrations', admin: true },
    { label: 'Outreach', href: '/workflows/outreach', admin: true },
  ] },
];

export function SectionTabs({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const brand = searchParams.get('brand');

  // Active tab = the longest href that the current path sits under (so
  // /products/catalog wins over /products).
  let current: { key: string; tabs: Tab[]; activeHref: string } | null = null;
  for (const s of SECTIONS) {
    for (const t of s.tabs) {
      if (pathname === t.href || pathname.startsWith(t.href + '/')) {
        if (!current || t.href.length > current.activeHref.length) {
          current = { key: s.key, tabs: s.tabs, activeHref: t.href };
        }
      }
    }
  }
  if (!current) return null;

  const tabs = current.tabs.filter((t) => !t.admin || isAdmin);
  if (tabs.length <= 1) return null;

  const withBrand = (href: string) => (brand ? `${href}?brand=${brand}` : href);

  return (
    <div className="sticky top-14 z-20 bg-card border-b border-border">
      <nav className="flex items-center gap-1 px-3 sm:px-4 md:px-6 overflow-x-auto" aria-label="Section">
        {tabs.map((t) => {
          const active = t.href === current!.activeHref;
          return (
            <Link
              key={t.href}
              href={withBrand(t.href)}
              className={cn(
                'px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
                active
                  ? 'border-[var(--primary)] text-[var(--foreground)]'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
