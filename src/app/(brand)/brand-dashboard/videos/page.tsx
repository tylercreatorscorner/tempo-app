import { Search, ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { requireBrandPortalContext } from '@/lib/data/brand-portal';
import {
  getBrandPortalDashboard,
  type BrandPortalPeriod,
} from '@/lib/data/brand-portal-overview';
import { createAdminClient } from '@/lib/supabase/server';
import { BRAND_UUID_MAP } from '@/lib/utils/constants';
import { PeriodTabs } from '../period-tabs';
import { SortableHeader, type SortDir } from '../sortable-header';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

type SortColumn = 'title' | 'creator' | 'date' | 'gmv' | 'orders' | 'lifetime_gmv' | 'change';

interface PageProps {
  searchParams: Promise<{
    q?: string;
    period?: string;
    page?: string;
    sort?: string;
    dir?: string;
  }>;
}

export default async function BrandVideosPage({ searchParams }: PageProps) {
  const ctx = await requireBrandPortalContext();
  const params = await searchParams;
  const search = (params.q ?? '').trim().toLowerCase();
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
  const period: BrandPortalPeriod = (() => {
    switch (params.period) {
      case 'yesterday':
      case '30d':
      case 'this_month':
      case 'last_month':
        return params.period;
      default:
        return '7d';
    }
  })();
  const sortColumn: SortColumn = (() => {
    switch (params.sort) {
      case 'title':
      case 'creator':
      case 'date':
      case 'orders':
      case 'lifetime_gmv':
      case 'change':
        return params.sort;
      default:
        return 'gmv';
    }
  })();
  const sortDir: SortDir = params.dir === 'asc' ? 'asc' : 'desc';

  const accent = ctx.activeBrand.color || '#FF4D8D';
  const admin = await createAdminClient();
  const brandUuid = BRAND_UUID_MAP[ctx.activeBrand.slug] ?? ctx.activeBrand.id;
  const data = await getBrandPortalDashboard(
    admin,
    brandUuid,
    ctx.activeBrand.slug,
    ctx.activeBrand.display_name || ctx.activeBrand.name,
    period,
  );

  const filtered = search
    ? data.videos.filter(
        (v) =>
          v.title.toLowerCase().includes(search) ||
          v.creatorHandle.includes(search),
      )
    : [...data.videos];

  const sorted = filtered.sort((a, b) => {
    const av = sortValue(a, sortColumn);
    const bv = sortValue(b, sortColumn);
    if (typeof av === 'string' && typeof bv === 'string') {
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    const an = Number(av ?? 0);
    const bn = Number(bv ?? 0);
    return sortDir === 'asc' ? an - bn : bn - an;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * PAGE_SIZE;
  const visible = sorted.slice(startIdx, startIdx + PAGE_SIZE);

  function buildHref(opts: { page?: number; sort?: string; dir?: SortDir }) {
    const sp = new URLSearchParams();
    if (search) sp.set('q', search);
    sp.set('period', period);
    const finalSort = opts.sort ?? sortColumn;
    const finalDir = opts.dir ?? sortDir;
    if (finalSort !== 'gmv') sp.set('sort', finalSort);
    if (finalDir !== 'desc') sp.set('dir', finalDir);
    const finalPage = opts.page ?? 1;
    if (finalPage > 1) sp.set('page', String(finalPage));
    const qs = sp.toString();
    return `/brand-dashboard/videos${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1B3A]">Videos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} post{filtered.length === 1 ? '' : 's'} from your managed
            creators · {data.periodLabel}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <SearchBox initialQuery={params.q ?? ''} period={period} />
          <PeriodTabs current={period} accentColor={accent} />
        </div>
      </div>

      <p className="text-xs text-gray-400 -mt-3">
        GMV is the sales each post generated <strong>during the selected period</strong>.
        Lifetime GMV (totals since posting) is shown as a secondary number.
      </p>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        {visible.length === 0 ? (
          <p className="text-sm text-gray-400 px-4 py-12 text-center">
            {data.videos.length === 0
              ? 'No posts in this period.'
              : 'No videos match your search.'}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/50">
                    <SortableHeader
                      label="Video"
                      column="title"
                      activeColumn={sortColumn}
                      activeDir={sortDir}
                      buildHref={(c, d) => buildHref({ sort: c, dir: d })}
                      align="left"
                      className="px-4"
                    />
                    <SortableHeader
                      label="Creator"
                      column="creator"
                      activeColumn={sortColumn}
                      activeDir={sortDir}
                      buildHref={(c, d) => buildHref({ sort: c, dir: d })}
                      align="left"
                      className="hidden sm:table-cell"
                    />
                    <SortableHeader
                      label="Posted"
                      column="date"
                      activeColumn={sortColumn}
                      activeDir={sortDir}
                      buildHref={(c, d) => buildHref({ sort: c, dir: d })}
                      align="left"
                      className="hidden md:table-cell"
                    />
                    <SortableHeader
                      label="GMV (period)"
                      column="gmv"
                      activeColumn={sortColumn}
                      activeDir={sortDir}
                      buildHref={(c, d) => buildHref({ sort: c, dir: d })}
                      align="right"
                    />
                    <SortableHeader
                      label="vs Prior"
                      column="change"
                      activeColumn={sortColumn}
                      activeDir={sortDir}
                      buildHref={(c, d) => buildHref({ sort: c, dir: d })}
                      align="right"
                    />
                    <SortableHeader
                      label="Orders"
                      column="orders"
                      activeColumn={sortColumn}
                      activeDir={sortDir}
                      buildHref={(c, d) => buildHref({ sort: c, dir: d })}
                      align="right"
                    />
                    <SortableHeader
                      label="Lifetime GMV"
                      column="lifetime_gmv"
                      activeColumn={sortColumn}
                      activeDir={sortDir}
                      buildHref={(c, d) => buildHref({ sort: c, dir: d })}
                      align="right"
                      className="px-4 hidden lg:table-cell"
                    />
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {visible.map((v) => {
                    const href =
                      v.url ?? `https://www.tiktok.com/@${v.creatorHandle}/video/${v.videoId}`;
                    return (
                      <tr key={v.videoId} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-2.5">
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-[#1A1B3A] hover:underline truncate block max-w-[420px]"
                            title={v.title}
                          >
                            {v.title}
                          </a>
                          <p className="text-xs text-gray-500 mt-0.5 sm:hidden">
                            @{v.creatorHandle}
                            {v.postDate && (
                              <>
                                <span className="mx-1.5 text-gray-300">·</span>
                                {fmtDate(v.postDate)}
                              </>
                            )}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 hidden sm:table-cell">
                          <span className="text-sm" style={{ color: accent }}>
                            @{v.creatorHandle}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 hidden md:table-cell text-gray-500 text-xs">
                          {v.postDate ? fmtDate(v.postDate) : '—'}
                        </td>
                        <td className="text-right px-3 py-2.5 tabular-nums font-medium">
                          {fmtCurrency(v.periodGmv)}
                        </td>
                        <td className="text-right px-3 py-2.5">
                          <ChangePill curr={v.periodGmv} prior={v.priorGmv} />
                        </td>
                        <td className="text-right px-3 py-2.5 tabular-nums text-gray-700">
                          {fmtNumber(v.periodOrders)}
                        </td>
                        <td className="text-right px-4 py-2.5 tabular-nums text-gray-500 hidden lg:table-cell">
                          {fmtCurrency(v.lifetimeGmv)}
                        </td>
                        <td className="text-right pr-3">
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-300 hover:text-gray-600 inline-flex"
                            aria-label="Open on TikTok"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-50 text-xs text-gray-500">
                <span>
                  {startIdx + 1}–{Math.min(startIdx + PAGE_SIZE, sorted.length)} of {sorted.length}
                </span>
                <div className="flex items-center gap-1">
                  {safePage > 1 ? (
                    <Link
                      href={buildHref({ page: safePage - 1 })}
                      className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md hover:bg-gray-50 text-gray-700"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Prev
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 px-2 py-1 text-gray-300">
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Prev
                    </span>
                  )}
                  <span className="px-2 tabular-nums">
                    Page {safePage} of {totalPages}
                  </span>
                  {safePage < totalPages ? (
                    <Link
                      href={buildHref({ page: safePage + 1 })}
                      className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md hover:bg-gray-50 text-gray-700"
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 px-2 py-1 text-gray-300">
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function sortValue(
  v: import('@/lib/data/brand-portal-overview').BrandRosterVideo,
  col: SortColumn,
): number | string {
  switch (col) {
    case 'title':
      return v.title.toLowerCase();
    case 'creator':
      return v.creatorHandle;
    case 'date':
      return v.postDate?.getTime() ?? 0;
    case 'gmv':
      return v.periodGmv;
    case 'orders':
      return v.periodOrders;
    case 'lifetime_gmv':
      return v.lifetimeGmv;
    case 'change':
      return changePctOf(v.periodGmv, v.priorGmv) ?? -Infinity;
  }
}

function changePctOf(curr: number, prior: number): number | null {
  if (prior === 0) return curr > 0 ? null : 0;
  return ((curr - prior) / prior) * 100;
}

function ChangePill({ curr, prior }: { curr: number; prior: number }) {
  const pct = changePctOf(curr, prior);
  if (pct === null) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-emerald-600">
        <TrendingUp className="h-3 w-3" />
        New
      </span>
    );
  }
  if (Math.abs(pct) < 0.1) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-400">
        <Minus className="h-3 w-3" />
        0%
      </span>
    );
  }
  const positive = pct > 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${
        positive ? 'text-emerald-600' : 'text-rose-600'
      }`}
    >
      <Icon className="h-3 w-3" />
      {positive ? '+' : ''}
      {Math.abs(pct) >= 1000 ? `${(pct / 100).toFixed(0)}×` : `${pct.toFixed(1)}%`}
    </span>
  );
}

function SearchBox({
  initialQuery,
  period,
}: {
  initialQuery: string;
  period: BrandPortalPeriod;
}) {
  return (
    <form className="relative" method="GET">
      <input type="hidden" name="period" value={period} />
      <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        name="q"
        defaultValue={initialQuery}
        placeholder="Search videos…"
        className="bg-white border border-gray-100 rounded-lg pl-9 pr-3 py-2 text-sm shadow-sm w-full sm:w-56 focus:outline-none focus:border-gray-300 transition-colors"
      />
    </form>
  );
}

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function fmtNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
