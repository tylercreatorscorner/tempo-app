'use client';

import { useState, useMemo } from 'react';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Users, Package, Video, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { BRAND_DISPLAY_NAMES, BRAND_COLORS } from '@/lib/utils/constants';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────────────

interface Creator {
  creator_name: string;
  total_videos: number;
  total_gmv: number;
  total_orders: number;
  total_items_sold: number;
  avg_gmv_per_video: number;
  brand: string;
}

interface Product {
  product_name: string;
  total_items_sold: number;
  total_gmv: number;
  total_orders: number;
  brand: string;
}

interface Video {
  video_title: string;
  creator_name: string;
  total_gmv: number;
  total_orders: number;
  total_items_sold: number;
  days_active: number;
  brand: string;
}

interface Props {
  creators: Creator[];
  products: Product[];
  videos: Video[];
}

type Tab = 'creators' | 'products' | 'videos';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 50;

// ─── Sortable Table Header ─────────────────────────────────────

function SortHeader({
  label, field, currentSort, currentDir, onSort, align = 'right',
}: {
  label: string;
  field: string;
  currentSort: string;
  currentDir: SortDir;
  onSort: (field: string) => void;
  align?: 'left' | 'right';
}) {
  const isActive = currentSort === field;
  return (
    <th
      className={cn(
        'px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wider select-none',
        align === 'right' ? 'text-right' : 'text-left'
      )}
    >
      <button
        onClick={() => onSort(field)}
        className={cn(
          'inline-flex items-center gap-1.5 hover:text-gray-700 transition-colors',
          align === 'right' ? 'flex-row-reverse' : 'flex-row'
        )}
      >
        {label}
        {isActive ? (
          currentDir === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </button>
    </th>
  );
}

// ─── Brand Pill ────────────────────────────────────────────────

function BrandPill({ brand }: { brand: string }) {
  const color = BRAND_COLORS[brand] ?? '#6B7280';
  return (
    <span
      className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ backgroundColor: `${color}18`, color }}
    >
      {BRAND_DISPLAY_NAMES[brand] ?? brand}
    </span>
  );
}

// ─── Main Component ────────────────────────────────────────────

export function AnalyticsTabs({ creators, products, videos }: Props) {
  const [tab, setTab] = useState<Tab>('creators');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('total_gmv');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  function handleSort(field: string) {
    if (sortField === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(1);
  }

  function handleTabChange(t: Tab) {
    setTab(t);
    setSearch('');
    setSortField('total_gmv');
    setSortDir('desc');
    setPage(1);
  }

  function handleSearch(v: string) {
    setSearch(v);
    setPage(1);
  }

  function sortData<T>(data: T[]): T[] {
    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortField];
      const bVal = (b as Record<string, unknown>)[sortField];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'desc' ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
      }
      const aNum = (aVal as number) ?? 0;
      const bNum = (bVal as number) ?? 0;
      return sortDir === 'desc' ? bNum - aNum : aNum - bNum;
    });
  }

  const filteredCreators = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = q ? creators.filter((c) => c.creator_name.toLowerCase().includes(q)) : creators;
    return sortData(filtered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creators, search, sortField, sortDir]);

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = q ? products.filter((p) => p.product_name.toLowerCase().includes(q)) : products;
    return sortData(filtered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, search, sortField, sortDir]);

  const filteredVideos = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = q
      ? videos.filter((v) => v.video_title.toLowerCase().includes(q) || v.creator_name.toLowerCase().includes(q))
      : videos;
    return sortData(filtered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos, search, sortField, sortDir]);

  const tabs: { key: Tab; label: string; count: number; icon: typeof Users }[] = [
    { key: 'creators', label: 'Creators', count: creators.length, icon: Users },
    { key: 'products', label: 'Products', count: products.length, icon: Package },
    { key: 'videos',   label: 'Videos',   count: videos.length,   icon: Video },
  ];

  // Pagination helpers per active tab
  const activeData = tab === 'creators' ? filteredCreators : tab === 'products' ? filteredProducts : filteredVideos;
  const totalPages = Math.max(1, Math.ceil(activeData.length / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageEnd   = pageStart + PAGE_SIZE;

  const placeholder = tab === 'creators'
    ? 'Search creators...'
    : tab === 'products'
    ? 'Search products...'
    : 'Search videos or creators...';

  return (
    <div className="space-y-4">
      {/* Tab bar — pill style matching My Creators */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {tabs.map(({ key, label, count, icon: Icon }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors',
              tab === key
                ? 'bg-white text-[#1A1B3A] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            <span className="text-[11px] text-gray-400 font-medium">{formatNumber(count)}</span>
          </button>
        ))}
      </div>

      {/* Card with search + table + pagination */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        {/* Search */}
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={placeholder}
              className="w-full sm:w-80 pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {tab === 'creators' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-12">#</th>
                  <SortHeader label="Creator" field="creator_name" currentSort={sortField} currentDir={sortDir} onSort={handleSort} align="left" />
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Brand</th>
                  <SortHeader label="Videos" field="total_videos" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="GMV" field="total_gmv" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Orders" field="total_orders" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Items" field="total_items_sold" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Avg / Video" field="avg_gmv_per_video" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredCreators.slice(pageStart, pageEnd).map((c, i) => (
                  <tr key={`${c.creator_name}-${c.brand}-${i}`} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-3.5 text-gray-300 tabular-nums">{pageStart + i + 1}</td>
                    <td className="px-5 py-3.5 font-medium text-[#1A1B3A]">@{c.creator_name}</td>
                    <td className="px-5 py-3.5"><BrandPill brand={c.brand} /></td>
                    <td className="px-5 py-3.5 text-right text-gray-500 tabular-nums">{formatNumber(c.total_videos)}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-[#1A1B3A] tabular-nums">{formatCurrency(c.total_gmv)}</td>
                    <td className="px-5 py-3.5 text-right text-gray-500 tabular-nums">{formatNumber(c.total_orders)}</td>
                    <td className="px-5 py-3.5 text-right text-gray-500 tabular-nums">{formatNumber(c.total_items_sold)}</td>
                    <td className="px-5 py-3.5 text-right text-gray-500 tabular-nums">{formatCurrency(c.avg_gmv_per_video)}</td>
                  </tr>
                ))}
                {filteredCreators.length === 0 && (
                  <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-400">No creators found</td></tr>
                )}
              </tbody>
            </table>
          )}

          {tab === 'products' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-12">#</th>
                  <SortHeader label="Product" field="product_name" currentSort={sortField} currentDir={sortDir} onSort={handleSort} align="left" />
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Brand</th>
                  <SortHeader label="Units Sold" field="total_items_sold" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="GMV" field="total_gmv" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Orders" field="total_orders" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredProducts.slice(pageStart, pageEnd).map((p, i) => (
                  <tr key={`${p.product_name}-${i}`} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-3.5 text-gray-300 tabular-nums">{pageStart + i + 1}</td>
                    <td className="px-5 py-3.5 font-medium text-[#1A1B3A] max-w-md truncate">{p.product_name}</td>
                    <td className="px-5 py-3.5"><BrandPill brand={p.brand} /></td>
                    <td className="px-5 py-3.5 text-right text-gray-500 tabular-nums">{formatNumber(p.total_items_sold)}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-[#1A1B3A] tabular-nums">{formatCurrency(p.total_gmv)}</td>
                    <td className="px-5 py-3.5 text-right text-gray-500 tabular-nums">{formatNumber(p.total_orders)}</td>
                  </tr>
                ))}
                {filteredProducts.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-gray-400">No products found</td></tr>
                )}
              </tbody>
            </table>
          )}

          {tab === 'videos' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-12">#</th>
                  <SortHeader label="Video" field="video_title" currentSort={sortField} currentDir={sortDir} onSort={handleSort} align="left" />
                  <SortHeader label="Creator" field="creator_name" currentSort={sortField} currentDir={sortDir} onSort={handleSort} align="left" />
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Brand</th>
                  <SortHeader label="GMV" field="total_gmv" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Orders" field="total_orders" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Days" field="days_active" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredVideos.slice(pageStart, pageEnd).map((v, i) => (
                  <tr key={`${v.video_title}-${v.creator_name}-${i}`} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-3.5 text-gray-300 tabular-nums">{pageStart + i + 1}</td>
                    <td className="px-5 py-3.5 font-medium text-[#1A1B3A] min-w-[200px] max-w-[360px] truncate">{v.video_title}</td>
                    <td className="px-5 py-3.5 text-gray-500 text-xs">@{v.creator_name}</td>
                    <td className="px-5 py-3.5"><BrandPill brand={v.brand} /></td>
                    <td className="px-5 py-3.5 text-right font-semibold text-[#1A1B3A] tabular-nums">{formatCurrency(v.total_gmv)}</td>
                    <td className="px-5 py-3.5 text-right text-gray-500 tabular-nums">{formatNumber(v.total_orders)}</td>
                    <td className="px-5 py-3.5 text-right text-gray-500 tabular-nums">{v.days_active}d</td>
                  </tr>
                ))}
                {filteredVideos.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-gray-400">No videos found</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {activeData.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 bg-gray-50/40">
            <p className="text-xs text-gray-400">
              {formatNumber(activeData.length)} total · page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
