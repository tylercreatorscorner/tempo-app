import Link from 'next/link';
import { Search, ChevronRight, ChevronLeft } from 'lucide-react';
import { requireBrandPortalContext } from '@/lib/data/brand-portal';
import {
  getBrandPortalDashboard,
  type BrandPortalPeriod,
} from '@/lib/data/brand-portal-overview';
import { createAdminClient } from '@/lib/supabase/server';
import { PeriodTabs } from '../period-tabs';
import { SortableHeader, type SortDir } from '../sortable-header';
import { readableOn } from '@/lib/utils/brand-color';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

type SortColumn = 'creator' | 'gmv' | 'orders' | 'posts' | 'retainer' | 'roi';

interface PageProps {
  searchParams: Promise<{
    q?: string;
    period?: string;
    page?: string;
    sort?: string;
    dir?: string;
  }>;
}

export default async function BrandCreatorsPage({ searchParams }: PageProps) {
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
      case 'creator':
      case 'orders':
      case 'posts':
      case 'retainer':
      case 'roi':
        return params.sort;
      default:
        return 'gmv';
    }
  })();
  const sortDir: SortDir = params.dir === 'asc' ? 'asc' : 'desc';

  const accent = ctx.activeBrand.color || '#FF4D8D';
  const admin = await createAdminClient();
  const brandUuid = ctx.activeBrand.id;
  const data = await getBrandPortalDashboard(
    admin,
    brandUuid,
    ctx.activeBrand.slug,
    ctx.activeBrand.display_name || ctx.activeBrand.name,
    period,
  );

  const filtered = search
    ? data.creators.filter(
        (c) =>
          c.primaryHandle.includes(search) ||
          c.handles.some((h) => h.includes(search)) ||
          (c.realName ?? '').toLowerCase().includes(search),
      )
    : [...data.creators];

  // Sort in-memory using the requested column
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

  function buildHref(opts: {
    page?: number;
    sort?: string;
    dir?: SortDir;
  }) {
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
    return `/brand-dashboard/creators${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Creators</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filtered.length} managed creator{filtered.length === 1 ? '' : 's'}
            {filtered.length !== data.creators.length && ` (filtered from ${data.creators.length})`}
            {' · '}
            {data.periodLabel}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <SearchBox initialQuery={params.q ?? ''} period={period} />
          <PeriodTabs current={period} accentColor={accent} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30">
                <SortableHeader
                  label="Creator"
                  column="creator"
                  activeColumn={sortColumn}
                  activeDir={sortDir}
                  buildHref={(c, d) => buildHref({ sort: c, dir: d })}
                  align="left"
                  className="px-4"
                />
                <SortableHeader
                  label="GMV"
                  column="gmv"
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
                  label="Posts"
                  column="posts"
                  activeColumn={sortColumn}
                  activeDir={sortDir}
                  buildHref={(c, d) => buildHref({ sort: c, dir: d })}
                  align="right"
                />
                <SortableHeader
                  label="Retainer"
                  column="retainer"
                  activeColumn={sortColumn}
                  activeDir={sortDir}
                  buildHref={(c, d) => buildHref({ sort: c, dir: d })}
                  align="right"
                />
                <SortableHeader
                  label="ROI (30d)"
                  column="roi"
                  activeColumn={sortColumn}
                  activeDir={sortDir}
                  buildHref={(c, d) => buildHref({ sort: c, dir: d })}
                  align="right"
                  className="px-4"
                />
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {data.creators.length === 0
                      ? 'No managed creators yet.'
                      : 'No creators match your search.'}
                  </td>
                </tr>
              ) : (
                visible.map((c) => (
                  <tr key={c.managedId} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5">
                      {c.primaryHandle ? (
                        <Link
                          href={`/brand-dashboard/creators/${c.primaryHandle}?period=${period}`}
                          className="inline-flex items-center gap-1.5 font-medium hover:underline"
                          style={{ color: readableOn(accent) }}
                          title={c.realName ?? undefined}
                        >
                          @{c.primaryHandle}
                        </Link>
                      ) : (
                        <span className="font-medium text-foreground">
                          {c.realName ?? '—'}
                        </span>
                      )}
                      {c.realName && c.primaryHandle && (
                        <span className="ml-2 text-xs text-muted-foreground">{c.realName}</span>
                      )}
                    </td>
                    <td className="text-right px-3 py-2.5 tabular-nums font-medium">
                      {fmtCurrency(c.gmv)}
                    </td>
                    <td className="text-right px-3 py-2.5 tabular-nums text-foreground">
                      {fmtNumber(c.orders)}
                    </td>
                    <td className="text-right px-3 py-2.5 tabular-nums text-foreground">
                      {fmtNumber(c.posts)}
                    </td>
                    <td className="text-right px-3 py-2.5 tabular-nums text-foreground">
                      {c.retainer > 0 ? fmtCurrency(c.retainer) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="text-right px-4 py-2.5">
                      <RoiCell gmv30d={c.gmv30d} retainer={c.retainer} />
                    </td>
                    <td className="text-right pr-3">
                      {c.primaryHandle && (
                        <Link
                          href={`/brand-dashboard/creators/${c.primaryHandle}?period=${period}`}
                          className="text-muted-foreground hover:text-muted-foreground inline-flex"
                          aria-label="Open creator"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 text-xs text-muted-foreground">
            <span>
              {startIdx + 1}–{Math.min(startIdx + PAGE_SIZE, sorted.length)} of {sorted.length}
            </span>
            <div className="flex items-center gap-1">
              {safePage > 1 ? (
                <Link
                  href={buildHref({ page: safePage - 1 })}
                  className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md hover:bg-muted/30 text-foreground"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </Link>
              ) : (
                <span className="inline-flex items-center gap-0.5 px-2 py-1 text-muted-foreground">
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
                  className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md hover:bg-muted/30 text-foreground"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <span className="inline-flex items-center gap-0.5 px-2 py-1 text-muted-foreground">
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Sort key extractor — handles the synthetic "roi" column as gmv30d / retainer
function sortValue(
  c: import('@/lib/data/brand-portal-overview').BrandRosterCreator,
  col: SortColumn,
): number | string {
  switch (col) {
    case 'creator':
      return (c.realName ?? c.primaryHandle ?? '').toLowerCase();
    case 'gmv':
      return c.gmv;
    case 'orders':
      return c.orders;
    case 'posts':
      return c.posts;
    case 'retainer':
      return c.retainer;
    case 'roi':
      return c.retainer > 0 ? c.gmv30d / c.retainer : -1;
  }
}

function RoiCell({ gmv30d, retainer }: { gmv30d: number; retainer: number }) {
  if (!retainer || retainer <= 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const roi = gmv30d / retainer;
  let cls = 'bg-muted text-muted-foreground';
  if (roi >= 5) cls = 'bg-emerald-50 text-emerald-700';
  else if (roi >= 2) cls = 'bg-amber-50 text-amber-700';
  else cls = 'bg-rose-50 text-rose-700';
  return (
    <span
      className={`inline-block px-2 py-0.5 text-[11px] rounded-full font-semibold tabular-nums ${cls}`}
      title={`${fmtCurrency(gmv30d)} GMV / ${fmtCurrency(retainer)} retainer`}
    >
      {roi.toFixed(1)}×
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
      <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        name="q"
        defaultValue={initialQuery}
        placeholder="Search creators…"
        className="bg-card border border-border rounded-lg pl-9 pr-3 py-2 text-sm shadow-sm w-full sm:w-56 focus:outline-none focus:border-border transition-colors"
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
