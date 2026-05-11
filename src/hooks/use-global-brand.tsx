'use client';

import { createContext, useContext, useCallback, type ReactNode } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { BRAND_DISPLAY_NAMES, BRAND_COLORS } from '@/lib/utils/constants';

interface BrandContextValue {
  /** Current brand slug, or 'all' */
  brand: string;
  /** Set the global brand filter — updates URL on current page */
  setBrand: (brand: string) => void;
  /** Display name for current brand */
  brandLabel: string;
  /** Color for current brand */
  brandColor: string | null;
  /** Whether a specific brand is selected (not 'all') */
  isFiltered: boolean;
}

const BrandContext = createContext<BrandContextValue | null>(null);

export function BrandProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Accept any slug-shaped value. We used to gate this against the hardcoded
  // ACTIVE_BRANDS list, which silently dropped newly-created brands (the
  // picker would set ?brand=cosrx but state would revert to 'all'). The
  // canonical active-brands list now lives in brands_v2 — the picker reads
  // from there directly, and pages handle "no data for this brand" gracefully.
  const current = searchParams.get('brand') || 'all';
  const brand = current === 'all' || /^[a-z0-9_]+$/.test(current) ? current : 'all';

  const setBrand = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'all') {
        params.delete('brand');
      } else {
        params.set('brand', next);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams]
  );

  const brandLabel = brand === 'all' ? 'All Brands' : (BRAND_DISPLAY_NAMES[brand] ?? brand);
  const brandColor = brand === 'all' ? null : (BRAND_COLORS[brand] ?? null);

  return (
    <BrandContext.Provider value={{ brand, setBrand, brandLabel, brandColor, isFiltered: brand !== 'all' }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useGlobalBrand() {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error('useGlobalBrand must be used within BrandProvider');
  return ctx;
}
