'use client';

import { useState, useEffect, useMemo } from 'react';
import { Check } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

interface CatalogProduct { product_key: string; display_name: string; status: string }
type CatalogState = { request: { brand: string; attempt: number } | null; status: 'loading' | 'ready' | 'error'; products: CatalogProduct[]; error?: string };

/** Catalog failures must stay distinct from a confirmed empty catalog. */
function useProductCatalog(brand: string) {
  const [attempt, setAttempt] = useState(0);
  const request = useMemo(() => ({ brand, attempt }), [brand, attempt]);
  const [state, setState] = useState<CatalogState>({ request: null, status: 'loading', products: [] });
  useEffect(() => {
    if (!brand || brand === 'all') return;
    let active = true;
    let timedOut = false;
    const controller = new AbortController();
    const timeoutMessage = 'Products took too long to load. Retry to load the catalog.';
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      if (active) setState({ request, status: 'error', products: [], error: timeoutMessage });
    }, 15_000);
    fetch(`/api/products/catalog?brand=${encodeURIComponent(brand)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 403
          ? 'Product catalog access is unavailable. Retry after your brand access is updated.'
          : 'Products could not be loaded. Retry to check the catalog.');
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !('products' in data) || !Array.isArray(data.products)
          || !data.products.every(product => product && typeof product.product_key === 'string' && typeof product.display_name === 'string')) {
          throw new Error('The product catalog response could not be read. Please retry.');
        }
        if (active && !controller.signal.aborted) setState({ request, status: 'ready', products: (data.products as CatalogProduct[]).filter(product => product.status !== 'archived') });
      })
      .catch(error => {
        if (active) setState({ request, status: 'error', products: [], error: timedOut ? timeoutMessage : error instanceof Error ? error.message : 'Products could not be loaded. Please retry.' });
      })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [brand, request]);
  // Never expose the previous brand's controls during the render before its effect.
  const current = state.request === request ? state : { request, status: 'loading' as const, products: [] };
  return { ...current, retry: () => setAttempt(value => value + 1) };
}

function CatalogError({ message, retry, selected = false }: { message: string; retry: () => void; selected?: boolean }) {
  return <div className="space-y-1.5">
    <p role="alert" className="text-xs text-destructive">{message}</p>
    {selected && <p className="text-xs text-muted-foreground">Your selected products have been kept.</p>}
    <Button type="button" variant="outline" size="sm" onClick={retry}>Retry products</Button>
  </div>;
}

/**
 * A select to filter the roster by a brand's product. Renders nothing unless a
 * specific brand is chosen and it has catalog products.
 */
export function ProductFilterSelect({
  brand, value, onChange,
}: {
  brand: string;
  value: string;
  onChange: (key: string) => void;
}) {
  const catalog = useProductCatalog(brand);
  if (!brand || brand === 'all') return null;
  if (catalog.status === 'loading') return <p role="status" className="text-xs text-muted-foreground">Loading product filter…</p>;
  if (catalog.status === 'error') return <CatalogError message={catalog.error!} retry={catalog.retry} />;
  if (catalog.products.length === 0) return null;
  return (
    <div className="self-start">
      <Select aria-label="Filter creators by product" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All products</option>
        {catalog.products.map((p) => (
          <option key={p.product_key} value={p.product_key}>{p.display_name}</option>
        ))}
      </Select>
    </div>
  );
}

/**
 * Toggle-chip multi-select for a brand's products (from the catalog). Optional —
 * selecting nothing is a valid state (creator with creative freedom / a mix).
 */
export function ProductTagPicker({
  brand, value, onChange,
}: {
  brand: string;
  value: string[];
  onChange: (keys: string[]) => void;
}) {
  const catalog = useProductCatalog(brand);

  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);

  if (!brand || brand === 'all') {
    return <p className="text-xs text-muted-foreground">Pick a brand first.</p>;
  }
  if (catalog.status === 'loading') return <p role="status" className="text-xs text-muted-foreground">Loading products…</p>;
  if (catalog.status === 'error') return <CatalogError message={catalog.error!} retry={catalog.retry} selected={value.length > 0} />;
  if (catalog.products.length === 0) {
    return <p className="text-xs text-muted-foreground">No catalog products are set up for this brand. Product assignment is optional.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {catalog.products.map((p) => {
        const on = value.includes(p.product_key);
        return (
          <Button
            key={p.product_key}
            type="button"
            aria-pressed={on}
            variant={on ? 'primary' : 'outline'}
            size="sm"
            onClick={() => toggle(p.product_key)}
            className="rounded-full font-medium gap-1"
          >
            {on && <Check />}
            {p.display_name}
          </Button>
        );
      })}
    </div>
  );
}
