'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { BRAND_COLORS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
import { Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Creator {
  creator_name: string;
  total_gmv: number;
  total_orders: number;
  total_items_sold: number;
  days_active: number;
  brand: string;
}

type SortKey = 'creator_name' | 'total_gmv' | 'total_orders' | 'total_items_sold' | 'days_active';

interface Props {
  creators: Creator[];
}

const PAGE_SIZE = 25;

export function CreatorsClient({ creators }: Props) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('total_gmv');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [brandFilter, setBrandFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    let result = creators;
    if (brandFilter !== 'all') {
      result = result.filter((c) => c.brand === brandFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.creator_name.toLowerCase().includes(q));
    }
    result.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return result;
  }, [creators, search, sortKey, sortDir, brandFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
    setPage(0);
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === 'asc' ? <ChevronUp className="h-3 w-3 inline ml-1" /> : <ChevronDown className="h-3 w-3 inline ml-1" />;
  };

  const brands = ['all', ...Array.from(new Set(creators.map((c) => c.brand)))];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search creators..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF4D8D]/30 focus:border-[#FF4D8D]"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {brands.map((b) => (
            <button
              key={b}
              onClick={() => { setBrandFilter(b); setPage(0); }}
              className={cn(
                'px-3 py-2 rounded-lg text-xs font-medium transition-colors border',
                brandFilter === b
                  ? 'border-[#FF4D8D] bg-pink-50 text-[#FF4D8D]'
                  : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
              )}
              style={b !== 'all' && brandFilter === b ? { borderColor: BRAND_COLORS[b], color: BRAND_COLORS[b], backgroundColor: `${BRAND_COLORS[b]}10` } : {}}
            >
              {b === 'all' ? 'All Brands' : BRAND_DISPLAY_NAMES[b] ?? b}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-gray-500">{filtered.length} creators found</p>

      {/* Table */}
      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-gray-500 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium w-12">#</th>
                <th className="px-4 py-3 text-left font-medium cursor-pointer select-none" onClick={() => toggleSort('creator_name')}>
                  Creator <SortIcon col="creator_name" />
                </th>
                <th className="px-4 py-3 text-left font-medium">Brand</th>
                <th className="px-4 py-3 text-right font-medium cursor-pointer select-none" onClick={() => toggleSort('total_gmv')}>
                  GMV <SortIcon col="total_gmv" />
                </th>
                <th className="px-4 py-3 text-right font-medium cursor-pointer select-none" onClick={() => toggleSort('total_orders')}>
                  Orders <SortIcon col="total_orders" />
                </th>
                <th className="px-4 py-3 text-right font-medium cursor-pointer select-none" onClick={() => toggleSort('total_items_sold')}>
                  Items <SortIcon col="total_items_sold" />
                </th>
                <th className="px-4 py-3 text-right font-medium cursor-pointer select-none" onClick={() => toggleSort('days_active')}>
                  Days Active <SortIcon col="days_active" />
                </th>
              </tr>
            </thead>
            <tbody>
              {paged.map((c, i) => (
                <tr key={`${c.creator_name}-${c.brand}-${i}`} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-400">{page * PAGE_SIZE + i + 1}</td>
                  <td className="px-4 py-3 font-medium text-[#1A1B3A]">
                    <Link href={`/creators/${encodeURIComponent(c.creator_name)}`} className="hover:text-[#FF4D8D] hover:underline transition-colors">
                      {c.creator_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-xs px-2 py-1 rounded-full font-medium"
                      style={{ backgroundColor: `${BRAND_COLORS[c.brand]}15`, color: BRAND_COLORS[c.brand] }}
                    >
                      {BRAND_DISPLAY_NAMES[c.brand] ?? c.brand}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-[#1A1B3A]">{formatCurrency(c.total_gmv)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{formatNumber(c.total_orders)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{formatNumber(c.total_items_sold)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{formatNumber(c.days_active)}</td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No creators found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="h-4 w-4 text-gray-600" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="h-4 w-4 text-gray-600" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
