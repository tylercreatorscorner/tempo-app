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
              isActive && isAll && 'bg-white/15 border-white/30 text-white shadow-[0_2px_12px_rgba(255,255,255,0.1)]',
              !isActive && isAll && 'bg-white/[0.04] border-white/[0.08] text-muted-foreground/70 hover:bg-white/[0.08] hover:text-white',
              isActive && !isAll && 'text-white shadow-lg',
              !isActive && !isAll && !b.disabled && 'bg-white/[0.04] border-white/[0.08] text-muted-foreground/70 hover:text-white',
            )}
            style={
              isActive && !isAll && color
                ? {
                    backgroundColor: `${color}25`,
                    borderColor: `${color}60`,
                    boxShadow: `0 2px 16px ${color}30`,
                  }
                : !isActive && !isAll && color && !b.disabled
                ? { borderColor: `${color}20` }
                : undefined
            }
          >
            {!isAll && color && (
              <span
                className="inline-block w-2 h-2 rounded-full mr-2"
                style={{ backgroundColor: color }}
              />
            )}
            {b.label}
          </button>
        );
      })}
    </div>
  );
}
