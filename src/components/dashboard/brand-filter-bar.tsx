'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BRAND_COLORS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';

const BRANDS = [
  { key: 'all', label: 'All Brands' },
  { key: 'jiyu', label: 'JiYu' },
  { key: 'catakor', label: 'Cata-Kor' },
  { key: 'physicians_choice', label: "Physician's Choice" },
  { key: 'toplux', label: 'TopLux', disabled: true },
];

export function BrandFilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get('brand') || 'all';

  function select(brand: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (brand === 'all') {
      params.delete('brand');
    } else {
      params.set('brand', brand);
    }
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {BRANDS.map((b) => {
        const isActive = current === b.key;
        const color = BRAND_COLORS[b.key];
        const isAll = b.key === 'all';

        return (
          <button
            key={b.key}
            onClick={() => !b.disabled && select(b.key)}
            disabled={b.disabled}
            className={cn(
              'px-4 py-1.5 text-sm rounded-full font-medium transition-all duration-300 border',
              b.disabled && 'opacity-30 cursor-not-allowed',
              !b.disabled && !isActive && 'cursor-pointer hover:scale-[1.05]',
              isActive && isAll && 'bg-gray-900 border-gray-900 text-white shadow-md',
              !isActive && isAll && 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-900',
              isActive && !isAll && 'text-white shadow-md',
              !isActive && !isAll && !b.disabled && 'bg-white border-gray-200 text-gray-500 hover:text-gray-900',
            )}
            style={
              isActive && !isAll && color
                ? {
                    backgroundColor: color,
                    borderColor: color,
                  }
                : !isActive && !isAll && color && !b.disabled
                ? { borderColor: `${color}40` }
                : undefined
            }
          >
            {!isAll && color && (
              <span
                className="inline-block w-2 h-2 rounded-full mr-2"
                style={{ backgroundColor: isActive ? '#fff' : color }}
              />
            )}
            {b.label}
          </button>
        );
      })}
    </div>
  );
}
