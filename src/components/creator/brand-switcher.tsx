'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronsUpDown, Check, Building2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { useNavigationPending } from '@/components/layout/navigation-pending';

interface BrandSwitcherProps {
  brands: string[];
  currentBrand: string | null; // null = "All Brands"
}

/**
 * Creator brand switcher — pinned at the sidebar bottom (matches the admin/brand
 * shell), so its dropdown opens UPWARD. Brand name + color come from useBrandMeta
 * (DB-driven, not slug-prettify), and switching runs through the shared nav-pending
 * transition so stale content dims while the new brand's data revalidates.
 */
export function BrandSwitcher({ brands, currentBrand }: BrandSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const brandMeta = useBrandMeta();
  const { startNav } = useNavigationPending();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const labelOf = (b: string | null) => (b ? brandMeta.label(b) : 'All Brands');

  const switchBrand = async (brand: string | null) => {
    setOpen(false);
    await fetch('/api/auth/creator/switch-brand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand }),
    });
    // Revalidate inside the shared transition so the content overlay dims while
    // the new brand's numbers load, instead of the page sitting confidently stale.
    startNav(() => router.refresh());
  };

  // Dedupe + drop empty/"all brands" entries (a null/blank contract brand was
  // rendering a second "All Brands" row alongside the real one).
  const cleanBrands = Array.from(
    new Set(
      brands
        .filter((b) => b && b.trim())
        .map((b) => b.trim())
        .filter((b) => !['all brands', 'all_brands', 'all'].includes(b.toLowerCase())),
    ),
  );

  if (cleanBrands.length <= 1) return null;

  const options: (string | null)[] = [null, ...cleanBrands];

  return (
    <div ref={ref} className="relative">
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1.5 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-card py-1.5 shadow-xl shadow-black/10 z-50 animate-fade-in">
          <p className="select-none px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Switch brand
          </p>
          {options.map((b) => {
            const active = b === currentBrand;
            return (
              <button
                key={b ?? '__all'}
                onClick={() => switchBrand(b)}
                disabled={active}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
                  active
                    ? 'cursor-default bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <BrandDot slug={b} />
                <span className="flex-1 truncate">{labelOf(b)}</span>
                {active && <Check className="h-3.5 w-3.5 flex-shrink-0 text-[var(--primary)]" />}
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all',
          open ? 'border-border bg-muted' : 'border-border bg-card hover:bg-muted',
        )}
      >
        <BrandDot slug={currentBrand} />
        <div className="min-w-0 flex-1 text-left">
          <p className="text-[9px] uppercase leading-none tracking-wider text-muted-foreground">Brand</p>
          <p className="truncate text-sm font-semibold text-foreground">{labelOf(currentBrand)}</p>
        </div>
        <ChevronsUpDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      </button>
    </div>
  );

  /** Brand color dot (from brands_v2 via useBrandMeta); a neutral building glyph
   *  stands in for "All Brands". */
  function BrandDot({ slug }: { slug: string | null }) {
    if (!slug) return <Building2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />;
    return (
      <span
        className="h-2.5 w-2.5 flex-shrink-0 rounded-full ring-2 ring-card"
        style={{ backgroundColor: brandMeta.color(slug) }}
      />
    );
  }
}
