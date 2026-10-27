'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Package, Plus, Pencil, Archive, X, Loader2, Check, Search, ArchiveRestore,
} from 'lucide-react';
import { useBrandList } from '@/hooks/use-brand-list';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { TableLoadBar } from '@/components/ui/table-load-bar';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ChoiceMenu } from '@/components/ui/choice-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import layout from '@/components/ui/workspace-layout.module.css';
import { WorkspaceMetrics } from '@/components/ui/workspace-metrics';

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
  const [loadedBrand, setLoadedBrand] = useState('');
  const [error, setError] = useState('');
  const readSequence = useRef(0);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<CatalogProduct | 'new' | null>(null);
  const showBar = useDelayedFlag(loading);

  const skuById = useMemo(() => new Map(skus.map((s) => [s.product_id, s])), [skus]);

  const load = useCallback(async (b: string) => {
    const sequence = ++readSequence.current;
    if (!b) { setProducts([]); setSkus([]); setLoadedBrand(''); setError(''); setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/products/catalog?brand=${encodeURIComponent(b)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load this catalog.');
      if (sequence !== readSequence.current) return;
      setProducts(data.products ?? []); setSkus(data.skus ?? []); setLoadedBrand(b);
    } catch (error) {
      if (sequence === readSequence.current) setError(error instanceof Error ? error.message : 'Could not load this catalog.');
    } finally {
      if (sequence === readSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(brand); }, [brand, load]);

  const productGmv = (p: CatalogProduct) =>
    (p.product_ids ?? []).reduce((sum, id) => sum + (skuById.get(id)?.gmv ?? 0), 0);

  const currentBrandLoaded = loadedBrand === brand && Boolean(brand);
  const visible = currentBrandLoaded ? products.filter((p) => showArchived || p.status !== 'archived') : [];
  const brandName = brands.find((b) => b.slug === brand)?.name;

  return (
    <div className={layout.page}>
      {/* Header */}
      <PageHeader
        eyebrow="Products"
        title="Product Catalog"
        subtitle="Define each brand's products so creators can be tagged by what they push."
        actions={brand && (
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Add product
          </Button>
        )}
      />

      {/* Brand picker */}
      <div className={layout.toolbar}>
        <Label className="mb-0">Brand</Label>
        <div className="w-full sm:w-64 min-w-0">
          <ChoiceMenu compact label="Catalog brand" value={brand} onChange={setBrand} options={[{ value: '', label: 'Select a brand…' }, ...brands.map(b => ({ value: b.slug, label: b.name }))]} />
        </div>
        {brand && (
          <span className="text-xs text-muted-foreground">
            {currentBrandLoaded ? `${skus.length} TikTok SKU${skus.length === 1 ? '' : 's'} in this brand’s data` : loading ? 'Loading catalog…' : 'Catalog not loaded'}
          </span>
        )}
        {currentBrandLoaded && products.some((p) => p.status === 'archived') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowArchived((v) => !v)}
            className="ml-auto"
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </Button>
        )}
      </div>

      {brand && <WorkspaceMetrics label="Catalog summary" items={[
        { label: 'Active products', value: loading || !currentBrandLoaded ? '—' : products.filter(p => p.status !== 'archived').length },
        { label: 'TikTok SKUs', value: loading || !currentBrandLoaded ? '—' : skus.length },
        { label: 'Archived products', value: loading || !currentBrandLoaded ? '—' : products.filter(p => p.status === 'archived').length },
      ]} />}
      {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"><span>{error}{currentBrandLoaded ? ' Showing the last loaded catalog for this brand.' : ' Catalog counts are unavailable.'}</span><Button variant="outline" size="sm" disabled={loading} onClick={() => void load(brand)}>Retry</Button></div>}

      <div className={brand ? layout.columns : layout.stack}>
      {/* Product list */}
      {!brand ? (
        <EmptyState
          icon={<Package className="h-8 w-8" />}
          title="Pick a brand to manage its products"
        />
      ) : (
        <Card className="relative overflow-hidden">
          <TableLoadBar active={showBar} />
          <div className={showBar && visible.length > 0 ? 'opacity-60 transition-opacity duration-200' : ''}>
            {!currentBrandLoaded ? <p role="status" className="p-6 text-sm text-muted-foreground">{loading ? 'Loading this brand’s catalog…' : 'Catalog data is unavailable. Retry to load products.'}</p> : visible.length === 0 && !loading ? (
              <div className="p-8 text-center">
                <Package className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm font-medium">No products defined for {brandName} yet</p>
                <button onClick={() => setEditing('new')} className="text-[var(--primary)] text-sm font-semibold mt-2 hover:underline">
                  Add the first one
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {visible.map((p) => {
                  const skuCount = (p.product_ids ?? []).length;
                  return (
                    <div key={p.id} className="grid grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-x-3 gap-y-2 px-4 py-3 hover:bg-muted/50 transition-colors sm:grid-cols-[36px_minmax(0,1fr)_auto_36px]">
                      <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Package className="h-4 w-4 text-[var(--primary)]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[var(--foreground)] break-words sm:truncate">{p.display_name}</span>
                          {p.status === 'archived' && (
                            <Badge variant="neutral" size="sm">Archived</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {skuCount} SKU{skuCount === 1 ? '' : 's'}
                          {(p.keywords ?? []).length > 0 ? ` · ${(p.keywords ?? []).length} keyword${(p.keywords ?? []).length === 1 ? '' : 's'}` : ''}
                        </p>
                      </div>
                      <div className="col-start-2 row-start-2 text-left sm:col-start-3 sm:row-start-1 sm:text-right">
                        <p className="text-sm font-semibold text-[var(--foreground)] tabular-nums">{fmt(productGmv(p))}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">all-time GMV</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditing(p)}
                        title="Edit"
                        aria-label={`Edit ${p.display_name}`}
                        className="col-start-3 row-start-1 sm:col-start-4"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      )}
      {brand && <aside className={layout.panel}><h2>Product mapping</h2><p className="mt-2">Group related TikTok SKUs under one product. Creator tags use these mappings and the keywords you choose.</p><div className={layout.linkList}><p className="py-3">Edit a product to review its SKUs, name, and keywords.</p><p className="pt-3">Archived products remain available for historical reference. Use Show archived to review them.</p></div></aside>}
      </div>

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
          <div className="flex items-start justify-between gap-2 px-4 sm:px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <Package className="h-5 w-5 text-[var(--primary)]" />
              <h2 className="min-w-0 break-words text-base font-bold text-[var(--foreground)]">
                {product ? 'Edit product' : 'New product'}{brandName ? ` · ${brandName}` : ''}
              </h2>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close product editor">
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="p-4 sm:p-6 space-y-4">
            {error && (
              <div className="text-sm text-[var(--pulse-neg)] bg-[var(--pulse-neg-bg)] rounded-lg px-4 py-2">{error}</div>
            )}

            <div>
              <Label>
                Product name <span className="text-primary">*</span>
              </Label>
              <Input
                value={name}
                aria-label="Product name"
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Whitening Strips"
              />
            </div>

            {/* SKU picker */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <Label className="mb-0">
                  TikTok SKUs ({selected.size} selected)
                </Label>
                <div className="relative min-w-0 w-full sm:w-40">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter SKUs…"
                    aria-label="Filter TikTok SKUs"
                    className="min-h-11 w-full pl-7 pr-2 py-1 text-base sm:text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-[var(--primary)]/30"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Which of this brand&apos;s products this represents. Links the tag to real per-product GMV.
              </p>
              <div className="border border-border rounded-xl divide-y divide-border max-h-60 overflow-y-auto">
                {filteredSkus.length === 0 && (
                  <p className="text-xs text-muted-foreground px-4 py-3">No SKUs in this brand&apos;s data.</p>
                )}
                {filteredSkus.map((s) => {
                  const on = selected.has(s.product_id);
                  return (
                    <button
                      key={s.product_id}
                      aria-pressed={on}
                      onClick={() => toggle(s.product_id)}
                      className="min-h-11 w-full flex items-start gap-3 px-3 py-2 text-left hover:bg-muted transition-colors"
                    >
                      <span className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-border'}`}>
                        {on && <Check className="h-3 w-3 text-white" />}
                      </span>
                      <span className="min-w-0 flex-1 break-words text-xs text-[var(--foreground)]">{s.product_name || s.product_id}</span>
                      <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{fmt(s.gmv)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label>
                Name keywords <span className="font-normal text-muted-foreground normal-case">(optional)</span>
              </Label>
              <Input
                value={keywords}
                aria-label="Product name keywords"
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g. whitening strips, purple strips"
              />
              <p className="text-xs text-muted-foreground mt-1">Comma-separated. A fallback for matching products by name.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                variant="primary"
                onClick={save}
                disabled={saving}
                className="flex-1"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {product ? 'Save changes' : 'Create product'}
              </Button>
              {product && product.status !== 'archived' && (
                <Button
                  variant="outline"
                  onClick={archive}
                  disabled={saving}
                  title="Archive"
                >
                  <Archive className="h-4 w-4" /> Archive
                </Button>
              )}
              {product && product.status === 'archived' && (
                <Button
                  variant="outline"
                  onClick={async () => { setSaving(true); await fetch('/api/products/catalog', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: product.id, status: 'active' }) }); onSaved(); }}
                  disabled={saving}
                  title="Restore"
                >
                  <ArchiveRestore className="h-4 w-4" /> Restore
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
