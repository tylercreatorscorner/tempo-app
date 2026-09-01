'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { cn } from '@/lib/utils';

interface BrandFilterProps {
  brands: string[];
  brandsWithData: string[];
  selectedBrand: string | null;
  /**
   * Collapse brands with no data in the current window behind a "+N more"
   * toggle. With ~28 active brands the pill wall was four rows of mostly
   * "(no data)" noise; the brands that matter stay one glance away.
   */
  collapseNoData?: boolean;
}

export function BrandFilter({ brands, brandsWithData, selectedBrand, collapseNoData = false }: BrandFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const brandMeta = useBrandMeta();
  const [showAll, setShowAll] = useState(false);

  const handleSelect = (brand: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (brand) {
      params.set('brand', brand);
    } else {
      params.delete('brand');
    }
    // Absolute path, built from usePathname(), rather than a bare `?${params}`.
    //
    // ⚠️ UNRESOLVED, do not read the git history as settled. In the in-app
    // browser this control does not navigate: the onClick fires, throws nothing,
    // and history.pushState is never called. Switching to an absolute path did
    // NOT change that, which argues the query-only form was not the cause.
    //
    // That same browser showed a half-hydrated page (two <main> elements, orphan
    // <table> nodes in <body>, unresolved S:0/S:1/S:2 stream holders), so the
    // fault may be the browser rather than the app. NEEDS A TEST IN REAL CHROME
    // before anyone concludes either way. The absolute path is kept because it
    // is the more correct form regardless.
    //
    // What IS proven: loading the page with ?brand=<slug> by hand filters
    // correctly (Views 1.8M -> 69.9k for akwellness1 on Forchics), so the page
    // and the data are fine either way.
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  // Until data arrives, brandsWithData is empty — don't collapse the whole
  // list to nothing; treat "no data known yet" as "show everything".
  const dataKnown = brandsWithData.length > 0;
  const withData = brands.filter(b => brandsWithData.includes(b) || b === selectedBrand);
  const hidden = collapseNoData && dataKnown && !showAll
    ? brands.length - withData.length
    : 0;
  const visibleBrands = hidden > 0 ? withData : brands;

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => handleSelect(null)}
        className={cn(
          'px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
          !selectedBrand
            ? 'bg-[var(--foreground)] text-[var(--background)] border-[var(--foreground)]'
            : 'bg-card text-muted-foreground border-border hover:border-border'
        )}
      >
        All Brands
      </button>
      {visibleBrands.map((brand) => {
        const isActive = selectedBrand === brand;
        const hasData = brandsWithData.includes(brand);
        const color = brandMeta.color(brand);
        return (
          <button
            key={brand}
            onClick={() => handleSelect(brand)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
              isActive
                ? 'text-white'
                : hasData
                  ? 'bg-card hover:border-border'
                  : 'bg-card hover:border-border opacity-50'
            )}
            style={
              isActive
                ? { backgroundColor: color, borderColor: color }
                : { borderColor: `${color}40`, color }
            }
          >
            {brandMeta.label(brand)}
            {!hasData && !isActive && dataKnown && (
              <span className="ml-1 text-[10px] opacity-60">(no data)</span>
            )}
          </button>
        );
      })}
      {hidden > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors border border-dashed border-border bg-card text-muted-foreground hover:text-foreground"
        >
          +{hidden} without data
        </button>
      )}
      {collapseNoData && showAll && dataKnown && brands.length > withData.length && (
        <button
          onClick={() => setShowAll(false)}
          className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors border border-dashed border-border bg-card text-muted-foreground hover:text-foreground"
        >
          Hide empty
        </button>
      )}
    </div>
  );
}
