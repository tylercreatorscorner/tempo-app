'use client';

import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';

interface CatalogProduct { product_key: string; display_name: string; status: string }

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
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  useEffect(() => {
    if (!brand || brand === 'all') { setProducts([]); return; }
    let cancelled = false;
    fetch(`/api/products/catalog?brand=${encodeURIComponent(brand)}`)
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d) => { if (!cancelled) setProducts(((d.products ?? []) as CatalogProduct[]).filter((p) => p.status !== 'archived')); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [brand]);
  if (!brand || brand === 'all' || products.length === 0) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-4 py-2.5 rounded-xl border border-border text-sm bg-card focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C] self-start"
    >
      <option value="">All products</option>
      {products.map((p) => (
        <option key={p.product_key} value={p.product_key}>{p.display_name}</option>
      ))}
    </select>
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
    return <p className="text-xs text-muted-foreground">Pick a brand first.</p>;
  }
  if (loading) return <p className="text-xs text-muted-foreground">Loading products…</p>;
  if (products.length === 0) {
    return <p className="text-xs text-muted-foreground">No products defined for this brand yet — add them in Products → Catalog.</p>;
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
              on ? 'bg-[#E91E8C] border-[#E91E8C] text-white' : 'bg-card border-border text-muted-foreground hover:border-border'
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
