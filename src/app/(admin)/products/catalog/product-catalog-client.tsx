'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Package, Plus, Pencil, Archive, X, Loader2, Check, Search, ArchiveRestore,
} from 'lucide-react';
import { useBrandList } from '@/hooks/use-brand-list';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { TableLoadBar } from '@/components/ui/table-load-bar';

interface CatalogProduct {
  id: string;
  brand: string;
  product_key: string;
  display_name: string;
  product_ids: string[] | null;
  keywords: string[] | null;
  status: string;
}
interface Sku {
  product_id: string;
  product_name: string;
  gmv: number;
  posts: number;
}

const fmt = (n: number) => `$${Math.round(n || 0).toLocaleString()}`;

export function ProductCatalogClient() {
  const { brands } = useBrandList();
  const [brand, setBrand] = useState('');
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [skus, setSkus] = useState<Sku[]>([]);
  const [loading, setLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<CatalogProduct | 'new' | null>(null);
  const showBar = useDelayedFlag(loading);

  const skuById = useMemo(() => new Map(skus.map((s) => [s.product_id, s])), [skus]);

  const load = useCallback(async (b: string) => {
    if (!b) { setProducts([]); setSkus([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/products/catalog?brand=${encodeURIComponent(b)}`);
      const data = await res.json();
      if (res.ok) { setProducts(data.products ?? []); setSkus(data.skus ?? []); }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(brand); }, [brand, load]);

  const productGmv = (p: CatalogProduct) =>
    (p.product_ids ?? []).reduce((sum, id) => sum + (skuById.get(id)?.gmv ?? 0), 0);

  const visible = products.filter((p) => showArchived || p.status !== 'archived');
  const brandName = brands.find((b) => b.slug === brand)?.name;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Product Catalog</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define each brand&apos;s products so creators can be tagged by what they push.
          </p>
        </div>
        {brand && (
          <button
            onClick={() => setEditing('new')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#E91E8C] text-sm font-semibold text-white hover:bg-[#d1177d] transition-colors shadow-sm self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" /> Add product
          </button>
        )}
      </div>

      {/* Brand picker */}
      <div className="rounded-2xl bg-card border border-border shadow-sm p-4 flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Brand</label>
        <select
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-xl bg-card focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C] min-w-[220px]"
        >
          <option value="">Select a brand…</option>
          {brands.map((b) => (
            <option key={b.slug} value={b.slug}>{b.name}</option>
          ))}
        </select>
        {brand && (
          <span className="text-xs text-muted-foreground">
            {skus.length} TikTok SKU{skus.length === 1 ? '' : 's'} in this brand&apos;s data
          </span>
        )}
        {products.some((p) => p.status === 'archived') && (
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="ml-auto text-xs font-medium text-muted-foreground hover:text-muted-foreground"
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
        )}
      </div>

      {/* Product list */}
      {!brand ? (
        <div className="rounded-2xl bg-card border border-border shadow-sm p-16 text-center">
          <Package className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm font-medium">Pick a brand to manage its products</p>
        </div>
      ) : (
        <div className="relative rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
          <TableLoadBar active={showBar} />
          <div className={showBar && visible.length > 0 ? 'opacity-60 transition-opacity duration-200' : ''}>
            {visible.length === 0 && !loading ? (
              <div className="p-16 text-center">
                <Package className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm font-medium">No products defined for {brandName} yet</p>
                <button onClick={() => setEditing('new')} className="text-[#E91E8C] text-sm font-semibold mt-2 hover:underline">
                  Add the first one
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {visible.map((p) => {
                  const skuCount = (p.product_ids ?? []).length;
                  return (
                    <div key={p.id} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/50 transition-colors">
                      <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Package className="h-4 w-4 text-[#E91E8C]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[var(--foreground)] truncate">{p.display_name}</span>
                          {p.status === 'archived' && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Archived</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {skuCount} SKU{skuCount === 1 ? '' : 's'}
                          {(p.keywords ?? []).length > 0 ? ` · ${(p.keywords ?? []).length} keyword${(p.keywords ?? []).length === 1 ? '' : 's'}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-[var(--foreground)] tabular-nums">{fmt(productGmv(p))}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">all-time GMV</p>
                      </div>
                      <button
                        onClick={() => setEditing(p)}
                        className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {editing && (
        <ProductEditor
          brand={brand}
          brandName={brandName}
          skus={skus}
          product={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(brand); }}
        />
      )}
    </div>
  );
}

function ProductEditor({
  brand, brandName, skus, product, onClose, onSaved,
}: {
  brand: string;
  brandName?: string;
  skus: Sku[];
  product: CatalogProduct | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(product?.display_name ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set(product?.product_ids ?? []));
  const [keywords, setKeywords] = useState((product?.keywords ?? []).join(', '));
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filteredSkus = skus.filter((s) =>
    !query || (s.product_name ?? '').toLowerCase().includes(query.toLowerCase()));

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const save = async () => {
    if (!name.trim()) { setError('Give the product a name.'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        display_name: name.trim(),
        product_ids: [...selected],
        keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
      };
      const res = product
        ? await fetch('/api/products/catalog', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: product.id, ...payload }),
          })
        : await fetch('/api/products/catalog', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brand, ...payload }),
          });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Save failed'); return; }
      onSaved();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!product) return;
    setSaving(true);
    await fetch(`/api/products/catalog?id=${product.id}`, { method: 'DELETE' });
    onSaved();
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="relative w-full max-w-lg bg-card rounded-2xl shadow-2xl mx-4 max-h-[90vh] overflow-y-auto pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-[#E91E8C]" />
              <h2 className="text-base font-bold text-[var(--foreground)]">
                {product ? 'Edit product' : 'New product'}{brandName ? ` · ${brandName}` : ''}
              </h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {error && (
              <div className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</div>
            )}

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Product name <span className="text-[#E91E8C]">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Whitening Strips"
                className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
              />
            </div>

            {/* SKU picker */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  TikTok SKUs ({selected.size} selected)
                </label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter SKUs…"
                    className="pl-7 pr-2 py-1 text-xs border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-[#E91E8C]/30 w-40"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Which of this brand&apos;s products this represents. Links the tag to real per-product GMV.
              </p>
              <div className="border border-border rounded-xl divide-y divide-gray-50 max-h-60 overflow-y-auto">
                {filteredSkus.length === 0 && (
                  <p className="text-xs text-muted-foreground px-4 py-3">No SKUs in this brand&apos;s data.</p>
                )}
                {filteredSkus.map((s) => {
                  const on = selected.has(s.product_id);
                  return (
                    <button
                      key={s.product_id}
                      onClick={() => toggle(s.product_id)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted transition-colors"
                    >
                      <span className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-[#E91E8C] border-[#E91E8C]' : 'border-border'}`}>
                        {on && <Check className="h-3 w-3 text-white" />}
                      </span>
                      <span className="min-w-0 flex-1 text-xs text-[var(--foreground)] truncate">{s.product_name || s.product_id}</span>
                      <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{fmt(s.gmv)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Name keywords <span className="font-normal text-muted-foreground normal-case">(optional)</span>
              </label>
              <input
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g. whitening strips, purple strips"
                className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
              />
              <p className="text-xs text-muted-foreground mt-1">Comma-separated. A fallback for matching products by name.</p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#E91E8C] rounded-xl hover:bg-[#d4177d] transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {product ? 'Save changes' : 'Create product'}
              </button>
              {product && product.status !== 'archived' && (
                <button
                  onClick={archive}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-muted-foreground border border-border rounded-xl hover:bg-muted transition-colors disabled:opacity-50"
                  title="Archive"
                >
                  <Archive className="h-4 w-4" /> Archive
                </button>
              )}
              {product && product.status === 'archived' && (
                <button
                  onClick={async () => { setSaving(true); await fetch('/api/products/catalog', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: product.id, status: 'active' }) }); onSaved(); }}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-muted-foreground border border-border rounded-xl hover:bg-muted transition-colors disabled:opacity-50"
                  title="Restore"
                >
                  <ArchiveRestore className="h-4 w-4" /> Restore
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
