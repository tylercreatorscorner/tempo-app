'use client';

import { useState, useMemo } from 'react';
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils/format';

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

// ─── Sortable Table Header ─────────────────────────────────────

function SortHeader({
  label,
  field,
  currentSort,
  currentDir,
  onSort,
  align = 'right',
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
      className={`px-4 py-3 font-medium cursor-pointer select-none hover:text-[#E91E8C] transition-colors ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          currentDir === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </span>
    </th>
  );
}

// ─── Search Input ──────────────────────────────────────────────

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full sm:w-72 pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/30 focus:border-[#E91E8C]"
      />
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────

export function AnalyticsTabs({ creators, products, videos }: Props) {
  const [tab, setTab] = useState<Tab>('creators');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('total_gmv');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function handleSort(field: string) {
    if (sortField === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  function handleTabChange(t: Tab) {
    setTab(t);
    setSearch('');
    setSortField('total_gmv');
    setSortDir('desc');
  }

  // Generic sort helper
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function sortData<T>(data: T[]): T[] {
    return [...data].sort((a, b) => {
      const aVal = ((a as any)[sortField] as number) ?? 0;
      const bVal = ((b as any)[sortField] as number) ?? 0;
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }

  const filteredCreators = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = q ? creators.filter((c) => c.creator_name.toLowerCase().includes(q)) : creators;
    return sortData(filtered);
  }, [creators, search, sortField, sortDir]);

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = q ? products.filter((p) => p.product_name.toLowerCase().includes(q)) : products;
    return sortData(filtered);
  }, [products, search, sortField, sortDir]);

  const filteredVideos = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = q
      ? videos.filter((v) => v.video_title.toLowerCase().includes(q) || v.creator_name.toLowerCase().includes(q))
      : videos;
    return sortData(filtered);
  }, [videos, search, sortField, sortDir]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'creators', label: 'Creators', count: creators.length },
    { key: 'products', label: 'Products', count: products.length },
    { key: 'videos', label: 'Videos', count: videos.length },
  ];

  return (
    <div>
      {/* Tab Bar */}
      <div className="flex gap-0 border-b border-gray-200 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => handleTabChange(t.key)}
            className={`relative px-6 py-3 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'text-[#E91E8C]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-gray-400">({formatNumber(t.count)})</span>
            {tab === t.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#E91E8C] rounded-t" />
            )}
          </button>
        ))}
      </div>

      {/* Creators Tab */}
      {tab === 'creators' && (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <SearchBar value={search} onChange={setSearch} placeholder="Search creators..." />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="px-4 py-3 text-left font-medium w-12">#</th>
                  <SortHeader label="Creator Handle" field="creator_name" currentSort={sortField} currentDir={sortDir} onSort={handleSort} align="left" />
                  <SortHeader label="Videos Posted" field="total_videos" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Total GMV" field="total_gmv" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Total Orders" field="total_orders" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Items Sold" field="total_items_sold" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Avg GMV/Video" field="avg_gmv_per_video" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {filteredCreators.slice(0, 100).map((c, i) => (
                  <tr key={`${c.creator_name}-${c.brand}-${i}`} className="border-b border-gray-50 hover:bg-pink-50/30 transition-colors">
                    <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-[#1A1B3A]">{c.creator_name}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(c.total_videos)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(c.total_gmv)}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(c.total_orders)}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(c.total_items_sold)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(c.avg_gmv_per_video)}</td>
                  </tr>
                ))}
                {filteredCreators.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No creators found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Products Tab */}
      {tab === 'products' && (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <SearchBar value={search} onChange={setSearch} placeholder="Search products..." />
          </div>
          {products.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500">
                    <th className="px-4 py-3 text-left font-medium w-12">#</th>
                    <SortHeader label="Product Name" field="product_name" currentSort={sortField} currentDir={sortDir} onSort={handleSort} align="left" />
                    <SortHeader label="Units Sold" field="total_items_sold" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label="GMV" field="total_gmv" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader label="Orders" field="total_orders" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.slice(0, 100).map((p, i) => (
                    <tr key={`${p.product_name}-${i}`} className="border-b border-gray-50 hover:bg-pink-50/30 transition-colors">
                      <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-[#1A1B3A] max-w-xs truncate">{p.product_name}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(p.total_items_sold)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(p.total_gmv)}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(p.total_orders)}</td>
                    </tr>
                  ))}
                  {filteredProducts.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">No products found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-gray-400">
              <p className="text-lg font-medium mb-2">Products</p>
              <p>Product performance data will appear here once available.</p>
            </div>
          )}
        </div>
      )}

      {/* Videos Tab */}
      {tab === 'videos' && (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <SearchBar value={search} onChange={setSearch} placeholder="Search videos or creators..." />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="px-4 py-3 text-left font-medium w-12">#</th>
                  <SortHeader label="Video Title" field="video_title" currentSort={sortField} currentDir={sortDir} onSort={handleSort} align="left" />
                  <SortHeader label="Creator" field="creator_name" currentSort={sortField} currentDir={sortDir} onSort={handleSort} align="left" />
                  <SortHeader label="GMV" field="total_gmv" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Orders" field="total_orders" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Days Active" field="days_active" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {filteredVideos.slice(0, 100).map((v, i) => (
                  <tr key={`${v.video_title}-${v.creator_name}-${i}`} className="border-b border-gray-50 hover:bg-pink-50/30 transition-colors">
                    <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-[#1A1B3A] max-w-xs truncate">{v.video_title}</td>
                    <td className="px-4 py-3 text-gray-600">{v.creator_name}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(v.total_gmv)}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(v.total_orders)}</td>
                    <td className="px-4 py-3 text-right">{v.days_active}d</td>
                  </tr>
                ))}
                {filteredVideos.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No videos found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
