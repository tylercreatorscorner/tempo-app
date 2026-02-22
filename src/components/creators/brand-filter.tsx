'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { BRAND_COLORS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import { cn } from '@/lib/utils';

interface BrandFilterProps {
  brands: string[];
  brandsWithData: string[];
  selectedBrand: string | null;
}

export function BrandFilter({ brands, brandsWithData, selectedBrand }: BrandFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSelect = (brand: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (brand) {
      params.set('brand', brand);
    } else {
      params.delete('brand');
    }
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => handleSelect(null)}
        className={cn(
          'px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
          !selectedBrand
            ? 'bg-[#1A1B3A] text-white border-[#1A1B3A]'
            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
        )}
      >
        All Brands
      </button>
      {brands.map((brand) => {
        const isActive = selectedBrand === brand;
        const hasData = brandsWithData.includes(brand);
        const color = BRAND_COLORS[brand] ?? '#6B7280';
        return (
          <button
            key={brand}
            onClick={() => handleSelect(brand)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
              isActive
                ? 'text-white'
                : hasData
                  ? 'bg-white hover:border-gray-300'
                  : 'bg-white hover:border-gray-300 opacity-50'
            )}
            style={
              isActive
                ? { backgroundColor: color, borderColor: color }
                : { borderColor: `${color}40`, color }
            }
          >
            {BRAND_DISPLAY_NAMES[brand] ?? brand}
            {!hasData && !isActive && (
              <span className="ml-1 text-[10px] opacity-60">(no data)</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
