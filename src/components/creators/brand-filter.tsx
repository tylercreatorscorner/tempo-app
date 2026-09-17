'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { cn } from '@/lib/utils';
import { ChoiceMenu } from '@/components/ui/choice-menu';
import { AllBrandsPortrait } from './all-brands-portrait';
import { BrandPortrait } from './brand-portrait';

interface BrandFilterProps {
  label?: string;
  compact?: boolean;
  brands: string[];
  appearance?: 'default' | 'creator';
  brandsWithData: string[];
  selectedBrand: string | null;
  /**
   * Collapse brands with no data in the current window behind a "+N more"
   * toggle. With ~28 active brands the pill wall was four rows of mostly
   * "(no data)" noise; the brands that matter stay one glance away.
   */
  collapseNoData?: boolean;
}

export function BrandFilter({ brands, brandsWithData, selectedBrand, collapseNoData = false, appearance = 'default', label = 'Brand relationship', compact = false }: BrandFilterProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const brandMeta = useBrandMeta();
  const [showAll, setShowAll] = useState(false);
  const router = useRouter();
  const [pending, startTransition] = useTransition();


  const brandHref = (brand: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (brand) {
      params.set('brand', brand);
    } else {
      params.delete('brand');
    }
    // A real navigation link also works before hydration completes and supports
    // opening another brand in a new tab. Preserve the current date window.
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  // Until data arrives, brandsWithData is empty — don't collapse the whole
  // list to nothing; treat "no data known yet" as "show everything".
  const dataKnown = brandsWithData.length > 0;
  const withData = brands.filter(b => brandsWithData.includes(b) || b === selectedBrand);
  const hidden = collapseNoData && dataKnown && !showAll
    ? brands.length - withData.length
    : 0;
  const visibleBrands = hidden > 0 ? withData : brands;

  if (appearance === 'creator') return <div aria-busy={pending}>
    <ChoiceMenu compact={compact} label={label} value={selectedBrand ?? '__all'} disabled={pending}
      options={[{value:'__all',label:'All Brands',icon:<AllBrandsPortrait/>,description:`${brands.length} brand relationships`}, ...brands.map(brand => ({value:brand,label:brandMeta.label(brand),icon:<BrandPortrait name={brandMeta.label(brand)} source={brandMeta.logo(brand)} color={brandMeta.color(brand)} />}))]}
      onChange={value => startTransition(()=>router.push(brandHref(value === '__all' ? null : value),{scroll:false}))} />
    {pending && <span role="status" className="text-xs text-muted-foreground">Updating brand scope…</span>}
  </div>;
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={brandHref(null)}
        aria-current={!selectedBrand ? 'page' : undefined}
        className={cn(
          'px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
          !selectedBrand
            ? 'bg-[var(--foreground)] text-[var(--background)] border-[var(--foreground)]'
            : 'bg-card text-muted-foreground border-border hover:border-border'
        )}
      >
        All Brands
      </a>
      {visibleBrands.map((brand) => {
        const isActive = selectedBrand === brand;
        const hasData = brandsWithData.includes(brand);
        const color = brandMeta.color(brand);
        return (
          <a
            key={brand}
            href={brandHref(brand)}
            aria-current={isActive ? 'page' : undefined}
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
          </a>
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

