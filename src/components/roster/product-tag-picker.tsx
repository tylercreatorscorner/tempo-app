'use client';

import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';

interface CatalogProduct { product_key: string; display_name: string; status: string }

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
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!brand || brand === 'all') { setProducts([]); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/products/catalog?brand=${encodeURIComponent(brand)}`)
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d) => {
        if (!cancelled) setProducts(((d.products ?? []) as CatalogProduct[]).filter((p) => p.status !== 'archived'));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [brand]);

  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);

  if (!brand || brand === 'all') {
    return <p className="text-xs text-gray-400">Pick a brand first.</p>;
  }
  if (loading) return <p className="text-xs text-gray-400">Loading products…</p>;
  if (products.length === 0) {
    return <p className="text-xs text-gray-400">No products defined for this brand yet — add them in Products → Catalog.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {products.map((p) => {
        const on = value.includes(p.product_key);
        return (
          <button
            type="button"
            key={p.product_key}
            onClick={() => toggle(p.product_key)}
            className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
              on ? 'bg-[#E91E8C] border-[#E91E8C] text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {on && <Check className="h-3 w-3" />}
            {p.display_name}
          </button>
        );
      })}
    </div>
  );
}
