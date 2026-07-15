'use client';

/**
 * Products view — admin-only page at /products.
 *
 * Layout (top to bottom):
 *   Header (title + range picker)
 *   Brand filter pills (matches /creators)
 *   KPI strip — Total GMV, Orders, Items, # Products (each with WoW delta)
 *   Top 5 Products card
 *   Products table:
 *     - Sortable columns (GMV / Orders / Items / Videos / Creators)
 *     - Search box
 *     - CSV export
 *     - Click any row -> expands inline to show the creators driving that product
 *
 * Data:
 *   GET /api/products?brand=&start=&end=             - main aggregate fetch
 *   GET /api/products/[id]/creators?brand=&start=&end - lazy-loaded on row expand
 *
 * Pattern matches /analytics — same DateRangePicker + BrandFilter + StatCard
 * components — and /upload — same admin gating pattern (server component
 * redirect + client surface).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown, ChevronRight, Download, Loader2, Package, Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { TableLoadBar } from '@/components/ui/table-load-bar';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { BrandFilter } from '@/components/creators/brand-filter';
import { StatCard } from '@/components/ui/stat-card';
import { PageHeader, Eyebrow } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatNumber } from '@/lib/utils/format';

interface ProductRow {
  product_id: string;
  product_name: string;
  brand: string;
  product_category: string | null;
  gmv: number;
  refunds: number;
  orders: number;
  items_sold: number;
  items_refunded: number;
  videos: number;
  live_streams: number;
  est_commission: number;
  avg_creators_with_sales: number;
}

interface ProductsResponse {
  products: ProductRow[];
  kpis: {
    totalGmv: number;
    totalOrders: number;
    totalItems: number;
    productCount: number;
    gmvChangePct: number | null;
    ordersChangePct: number | null;
    itemsChangePct: number | null;
    productCountChangePct: number | null;
  };
  startDate: string;
  endDate: string;
}

interface CreatorBreakdownRow {
  tiktok_username: string;
  gmv: number;
  orders: number;
  items_sold: number;
  videos: number;
}

type SortKey = 'gmv' | 'orders' | 'items_sold' | 'videos' | 'avg_creators_with_sales' | 'product_name';
type SortDir = 'asc' | 'desc';

interface ProductsClientProps {
  brands: string[];
  selectedBrand: string | null;
  startDate: string;
  endDate: string;
}

export function ProductsClient({ brands, selectedBrand, startDate, endDate }: ProductsClientProps) {
  const brandMeta = useBrandMeta();
  const [data, setData] = useState<ProductsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // Gate the load bar behind a short delay so it doesn't flash on fast loads —
  // it only appears when a brand/range refetch genuinely drags.
  const showBar = useDelayedFlag(loading);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('gmv');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Fetch products on mount + whenever brand/range changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (selectedBrand) params.set('brand', selectedBrand);
    params.set('start', startDate);
    params.set('end', endDate);
    fetch(`/api/products?${params.toString()}`)
      .then(r => r.json())
      .then((d: ProductsResponse | { error: string }) => {
        if (cancelled) return;
        if ('error' in d) setError(d.error);
        else setData(d);
      })
      .catch(() => { if (!cancelled) setError('Failed to load products'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedBrand, startDate, endDate]);

  // Brands that have data in the current window — used for highlighting in BrandFilter
  const brandsWithData = useMemo(() => {
    if (!data) return [] as string[];
    return Array.from(new Set(data.products.map(p => p.brand)));
  }, [data]);

  // Filter + sort
  const visibleProducts = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    let list = data.products;
    if (term) {
      list = list.filter(p =>
        (p.product_name || '').toLowerCase().includes(term) ||
        (p.product_category || '').toLowerCase().includes(term)
      );
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      let av: string | number = a[sortKey] ?? 0;
      let bv: string | number = b[sortKey] ?? 0;
      if (sortKey === 'product_name') {
        av = String(av).toLowerCase();
        bv = String(bv).toLowerCase();
        return av < bv ? -dir : av > bv ? dir : 0;
      }
      return ((av as number) - (bv as number)) * dir;
    });
    return list;
  }, [data, search, sortKey, sortDir]);

  function changeSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'product_name' ? 'asc' : 'desc');
    }
  }

  function toggleExpand(productKey: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(productKey)) next.delete(productKey);
      else next.add(productKey);
      return next;
    });
  }

  function downloadCsv() {
    if (!visibleProducts.length) return;
    const headers = ['Product', 'Brand', 'Category', 'GMV', 'Orders', 'Items Sold', 'Refunds', 'Videos', 'Avg Creators / Day', 'Est. Commission'];
    const rows = visibleProducts.map(p => [
      p.product_name || 'Unknown',
      brandMeta.label(p.brand),
      p.product_category ?? '',
      p.gmv.toFixed(2),
      p.orders,
      p.items_sold,
      p.refunds.toFixed(2),
      p.videos,
      p.avg_creators_with_sales,
      p.est_commission.toFixed(2),
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isInitial = loading && !data;

  return (
    <div className="space-y-6">
      {/* Header row: title + date picker */}
      <PageHeader
        eyebrow="Performance"
        title="Products"
        subtitle={
          <>
            Per-product performance for{' '}
            <span className="font-medium text-foreground">
              {selectedBrand ? brandMeta.label(selectedBrand) : 'all brands'}
            </span>
            . Click any row to see the creators driving it.
          </>
        }
        actions={<DateRangePicker />}
      />

      {/* Brand pills */}
      <BrandFilter brands={brands} brandsWithData={brandsWithData} selectedBrand={selectedBrand} />

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-500">
          {error}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard
          className="col-span-2"
          hero
          label="Total GMV"
          value={data ? formatCurrency(data.kpis.totalGmv) : '—'}
          trend={data?.kpis.gmvChangePct ?? undefined}
        />
        <StatCard
          label="Active Products"
          value={data ? formatNumber(data.kpis.productCount) : '—'}
          trend={data?.kpis.productCountChangePct ?? undefined}
        />
        <StatCard
          label="Total Orders"
          value={data ? formatNumber(data.kpis.totalOrders) : '—'}
          trend={data?.kpis.ordersChangePct ?? undefined}
        />
        <StatCard
          label="Items Sold"
          value={data ? formatNumber(data.kpis.totalItems) : '—'}
          trend={data?.kpis.itemsChangePct ?? undefined}
        />
      </div>

      {/* Top 5 products */}
      <TopProductsCard products={data?.products ?? []} totalGmv={data?.kpis.totalGmv ?? 0} loading={isInitial} />

      {/* Table */}
      <Card className="relative overflow-hidden">
        {/* Indeterminate load bar — shows on first load AND every refetch
            (brand / date-range change). Gated by showBar (150ms delay) so
            fast loads don't flash it. */}
        <TableLoadBar active={showBar} />
        {/* Table toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-[var(--foreground)]">All Products</h2>
            <span className="text-xs text-muted-foreground">
              {visibleProducts.length} of {data?.products.length ?? 0}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products..."
                className="w-56 pl-8 py-1.5 text-sm"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadCsv}
              disabled={!visibleProducts.length}
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className={`overflow-x-auto transition-opacity duration-200 ${showBar && data ? 'opacity-60' : 'opacity-100'}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <SortableTh label="Product"  sortKey="product_name"             current={sortKey} dir={sortDir} onClick={changeSort} />
                <Th>Brand</Th>
                <SortableTh label="GMV"      sortKey="gmv"                      current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                <SortableTh label="Orders"   sortKey="orders"                   current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                <SortableTh label="Items"    sortKey="items_sold"               current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                <SortableTh label="Videos"   sortKey="videos"                   current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                <SortableTh label="Creators/Day" sortKey="avg_creators_with_sales" current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {isInitial ? (
                <tr><td colSpan={7} className="text-center text-muted-foreground py-12 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading products...
                </td></tr>
              ) : visibleProducts.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted-foreground py-12">
                  <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <div className="text-sm font-medium">No products in this window</div>
                  <div className="text-xs mt-1">Try a wider date range or different brand.</div>
                </td></tr>
              ) : (
                visibleProducts.map(p => {
                  const key = `${p.product_id}|||${p.brand}`;
                  const isExpanded = expanded.has(key);
                  const brandColor = brandMeta.color(p.brand);
                  return (
                    <ProductRowGroup
                      key={key}
                      productKey={key}
                      product={p}
                      brandColor={brandColor}
                      isExpanded={isExpanded}
                      onToggle={() => toggleExpand(key)}
                      startDate={startDate}
                      endDate={endDate}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Sortable column header ──────────────────────────────────────────

function SortableTh({
  label, sortKey, current, dir, onClick, align = 'left',
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = current === sortKey;
  const arrow = active ? (dir === 'asc' ? '↑' : '↓') : '';
  return (
    <th
      onClick={() => onClick(sortKey)}
      className={cn(
        'px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none transition-colors',
        align === 'right' ? 'text-right' : 'text-left',
        active ? 'text-[var(--primary)]' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {label}{arrow && <span className="ml-1">{arrow}</span>}
    </th>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{children}</th>
  );
}

// ── Product row + expanded creator breakdown ────────────────────────

function ProductRowGroup({
  productKey, product, brandColor, isExpanded, onToggle, startDate, endDate,
}: {
  productKey: string;
  product: ProductRow;
  brandColor: string;
  isExpanded: boolean;
  onToggle: () => void;
  startDate: string;
  endDate: string;
}) {
  const brandMeta = useBrandMeta();
  const [creators, setCreators] = useState<CreatorBreakdownRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Lazy fetch when first expanded; cache after that
  const fetchCreators = useCallback(async () => {
    if (creators !== null) return;
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams({
        brand: product.brand,
        start: startDate,
        end:   endDate,
      });
      const res = await fetch(`/api/products/${encodeURIComponent(product.product_id)}/creators?${params.toString()}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setCreators(j.creators);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [creators, product.brand, product.product_id, startDate, endDate]);

  useEffect(() => {
    if (isExpanded) fetchCreators();
  }, [isExpanded, fetchCreators]);

  const titleClipped = (product.product_name || '(unnamed)').length > 80
    ? (product.product_name || '').slice(0, 80) + '…'
    : (product.product_name || '(unnamed)');

  return (
    <>
      <tr
        onClick={onToggle}
        className={cn(
          'border-t border-border hover:bg-muted/50 cursor-pointer transition-colors',
          isExpanded && 'bg-primary/10'
        )}
      >
        <td className="px-4 py-3 align-top">
          <div className="flex items-start gap-2">
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />}
            <div className="min-w-0">
              <div className="font-medium text-[var(--foreground)] truncate" title={product.product_name}>{titleClipped}</div>
              {product.product_category && (
                <div className="text-[11px] text-muted-foreground mt-0.5">{product.product_category}</div>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 align-top">
          <Chip dotColor={brandColor}>{brandMeta.label(product.brand)}</Chip>
        </td>
        <td className="px-4 py-3 text-right font-bold text-[var(--primary)] tabular-nums">{formatCurrency(product.gmv)}</td>
        <td className="px-4 py-3 text-right text-foreground tabular-nums">{formatNumber(product.orders)}</td>
        <td className="px-4 py-3 text-right text-foreground tabular-nums">{formatNumber(product.items_sold)}</td>
        <td className="px-4 py-3 text-right text-foreground tabular-nums">{formatNumber(product.videos)}</td>
        <td className="px-4 py-3 text-right text-foreground tabular-nums">{formatNumber(product.avg_creators_with_sales)}</td>
      </tr>
      {isExpanded && (
        <tr className="bg-muted/30 border-t border-border">
          <td colSpan={7} className="px-4 pt-1 pb-4">
            <CreatorBreakdown loading={loading} err={err} creators={creators} productGmv={product.gmv} />
          </td>
        </tr>
      )}
    </>
  );
}

function CreatorBreakdown({
  loading, err, creators, productGmv,
}: {
  loading: boolean;
  err: string | null;
  creators: CreatorBreakdownRow[] | null;
  productGmv: number;
}) {
  if (loading && creators === null) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-2 px-2 py-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading creators...
      </div>
    );
  }
  if (err) {
    return <div className="text-xs text-red-600 px-2 py-3">Error: {err}</div>;
  }
  if (!creators || creators.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic px-2 py-3">
        No creator-attributed sales for this product in the selected period.
      </div>
    );
  }

  const top = creators.slice(0, 10);
  return (
    <div className="rounded-xl bg-card border border-border p-3 space-y-1">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 pb-2">
        Top Creators · {creators.length} total · {formatCurrency(productGmv)} product GMV
      </div>
      <div className="space-y-0.5">
        {top.map((c, i) => {
          const share = productGmv > 0 ? (c.gmv / productGmv) * 100 : 0;
          return (
            <div key={c.tiktok_username} className="flex items-center gap-3 text-xs px-2 py-1.5 hover:bg-muted rounded-lg transition-colors">
              <span className="w-6 text-muted-foreground font-medium tabular-nums">{i + 1}.</span>
              <span className="font-medium text-[var(--foreground)] flex-1 truncate">@{c.tiktok_username}</span>
              <span className="text-muted-foreground w-24 text-right tabular-nums">{formatNumber(c.videos)} {c.videos === 1 ? 'vid' : 'vids'}</span>
              <span className="text-muted-foreground w-24 text-right tabular-nums">{formatNumber(c.orders)} orders</span>
              <span className="font-bold text-[var(--primary)] w-24 text-right tabular-nums">{formatCurrency(c.gmv)}</span>
              <span className="text-[10px] text-muted-foreground w-12 text-right tabular-nums">{share.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
      {creators.length > 10 && (
        <div className="text-[11px] text-muted-foreground px-2 pt-1">
          Showing top 10 of {creators.length} creators
        </div>
      )}
    </div>
  );
}

// ── Top 5 Products card ─────────────────────────────────────────────

function TopProductsCard({
  products, totalGmv, loading,
}: {
  products: ProductRow[];
  totalGmv: number;
  loading: boolean;
}) {
  const brandMeta = useBrandMeta();
  const top = products.slice(0, 5);
  return (
    <Card>
      <CardHeader>
        <div>
          <Eyebrow gradient>Headliners</Eyebrow>
          <CardTitle className="mt-0.5">Top 5 products</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
      {loading ? (
        <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading...</div>
      ) : top.length === 0 ? (
        <div className="text-xs text-muted-foreground italic py-3">No products in this window.</div>
      ) : (
        <div className="space-y-2">
          {top.map((p, i) => {
            const share = totalGmv > 0 ? (p.gmv / totalGmv) * 100 : 0;
            const titleClipped = (p.product_name || '(unnamed)').length > 60
              ? (p.product_name || '').slice(0, 60) + '…'
              : (p.product_name || '(unnamed)');
            const brandColor = brandMeta.color(p.brand);
            return (
              <div key={`${p.product_id}|||${p.brand}`} className="flex items-center gap-3">
                <span className="w-6 text-xs text-muted-foreground font-bold tabular-nums">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--foreground)] truncate" title={p.product_name}>{titleClipped}</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: brandColor }} />
                    {brandMeta.label(p.brand)}
                  </div>
                  <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--primary)]" style={{ width: `${Math.min(100, share)}%` }} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-[var(--foreground)] tabular-nums">{formatCurrency(p.gmv)}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">{share.toFixed(1)}% of total</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </CardContent>
    </Card>
  );
}
