'use client';

import { createContext, useContext, useCallback, useOptimistic, type ReactNode } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { useNavigationPending } from '@/components/layout/navigation-pending';

interface BrandContextValue {
  /** Current brand slug, or 'all'. While a switch is in flight this is the
   *  brand being switched TO (optimistic) — see `brand` below. */
  brand: string;
  /** Set the global brand filter — updates URL on current page */
  setBrand: (brand: string) => void;
  /** Display name for current brand */
  brandLabel: string;
  /** Color for current brand */
  brandColor: string | null;
  /** Whether a specific brand is selected (not 'all') */
  isFiltered: boolean;
  /** True while a brand switch is waiting on the server. */
  isPending: boolean;
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
  const { isPending, startNav } = useNavigationPending();
  const current = searchParams.get('brand') || 'all';
  const urlBrand = current === 'all' || /^[a-z0-9_]+$/.test(current) ? current : 'all';

  // Optimistic brand. The URL doesn't change until the server responds, so
  // deriving the label from searchParams alone left the trigger showing the OLD
  // brand for the entire multi-second wait — the switcher looked like it had
  // ignored the click. Show the target immediately; the pending affordance says
  // the numbers below are still catching up.
  //
  // useOptimistic (not useState) because it re-syncs to `urlBrand` as soon as
  // the transition settles — on commit AND on abort/failure. Hand-clearing it
  // would leave the last target lingering, so a later, unrelated navigation
  // (e.g. a period change, which shares this transition) could resurface a
  // stale brand in the trigger.
  const [brand, setOptimisticBrand] = useOptimistic(urlBrand);

  const setBrand = useCallback(
    (next: string) => {
      // The active row is still clickable; a same-URL push would never settle
      // and would leave the shell dimmed indefinitely.
      if (next === urlBrand) return;
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'all') {
        params.delete('brand');
      } else {
        params.set('brand', next);
      }
      const qs = params.toString();
      startNav(() => {
        // Must be set INSIDE the transition for React to scope the revert to it.
        setOptimisticBrand(next);
        router.push(qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [router, pathname, searchParams, urlBrand, startNav, setOptimisticBrand]
  );

  const brandMeta = useBrandMeta();
  const brandLabel = brandMeta.label(brand); // handles 'all' -> 'All Brands'
  const brandColor = brand === 'all' ? null : brandMeta.color(brand);

  return (
    <BrandContext.Provider value={{ brand, setBrand, brandLabel, brandColor, isFiltered: brand !== 'all', isPending }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useGlobalBrand() {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error('useGlobalBrand must be used within BrandProvider');
  return ctx;
}
