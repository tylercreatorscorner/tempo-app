import { PortalMobileSort } from '@/components/layout/portal-mobile-sort';
import { PortalMetricStrip } from '@/components/layout/portal-metric-strip';
import portal from '@/components/layout/portal-workspace.module.css';
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

  const accent = ctx.activeBrand.color || '#6e4bcc';
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

  function creatorHref(handle: string) {
    const query = buildHref({page: safePage}).split('?')[1];
    return `/brand-dashboard/creators/${handle}?${query}`;
  }

  return (
    <div className={portal.page}>
      <div className={portal.pageHeader}>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Creators</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filtered.length} managed creator{filtered.length === 1 ? '' : 's'}
            {filtered.length !== data.creators.length && ` (filtered from ${data.creators.length})`}
            {' · '}
            {data.periodLabel}
          </p>
        </div>
      </div>

      <PortalMetricStrip items={[
        { label: 'Roster GMV', value: fmtCurrency(data.totalGmv), note: data.periodLabel },
        { label: 'Posts published', value: fmtNumber(data.totalPosts), note: 'Published in the selected period' },
        { label: 'Managed creators', value: fmtNumber(data.managedCount), note: 'Brand roster' },
        { label: 'Creator fees', value: fmtCurrency(data.monthlyRetainerTotal), note: 'Recorded agreement fees' },
      ]} />

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
          <SearchBox initialQuery={params.q ?? ''} period={period} sort={sortColumn} direction={sortDir} />
          <PeriodTabs current={period} accentColor={accent} />
        </div>
        <PortalMobileSort options={[{value:'creator',label:'Creator',asc:buildHref({sort:'creator',dir:'asc'}),desc:buildHref({sort:'creator',dir:'desc'})},{value:'gmv',label:'GMV',asc:buildHref({sort:'gmv',dir:'asc'}),desc:buildHref({sort:'gmv',dir:'desc'})},{value:'orders',label:'Orders',asc:buildHref({sort:'orders',dir:'asc'}),desc:buildHref({sort:'orders',dir:'desc'})},{value:'posts',label:'Posts published',asc:buildHref({sort:'posts',dir:'asc'}),desc:buildHref({sort:'posts',dir:'desc'})},{value:'retainer',label:'Recorded fee',asc:buildHref({sort:'retainer',dir:'asc'}),desc:buildHref({sort:'retainer',dir:'desc'})},{value:'roi',label:'ROI (30d)',asc:buildHref({sort:'roi',dir:'asc'}),desc:buildHref({sort:'roi',dir:'desc'})}]} active={sortColumn} direction={sortDir} />
        <div className="overflow-x-auto">
          <table role="table" className={`${portal.recordTable} w-full text-sm`} aria-label="Managed creators">
            <thead>
              <tr className={`${portal.desktopHeaders} bg-muted/30`}>
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
                {/* Published in the window, same field the Overview rail and
                    table use. A 0 here beside real GMV is honest: nothing went
                    up, and older posts kept selling. */}
                <SortableHeader
                  label="Posts published"
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
              <tr className={portal.phoneHeaders}><th scope="col">Creator</th><th scope="col">GMV</th><th scope="col">Orders</th><th scope="col">Posts published</th><th scope="col">Recorded fee</th><th scope="col">ROI (30d)</th><th scope="col">Open creator</th></tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className={`${portal.emptyRecord} px-4 py-12 text-center text-sm text-muted-foreground`}>
                    {data.creators.length === 0
                      ? 'No managed creators yet.'
                      : 'No creators match your search.'}
                  </td>
                </tr>
              ) : (
                visible.map((c) => (
                  <tr key={c.managedId} className="hover:bg-muted/30 transition-colors">
                    <td data-label="Creator" className="px-4 py-2.5">
                      {c.primaryHandle ? (
                        <Link
                          href={creatorHref(c.primaryHandle)}
                          className="inline-flex items-center gap-1.5 font-medium hover:underline"
                          style={{ color: 'var(--brand-ink)' }}
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
                      {/* Listed because they earned in the period before leaving;
                          their days after leaving are not counted. */}
                      {c.leftOn && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          · left{' '}
                          {new Date(`${c.leftOn}T12:00:00Z`).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            timeZone: 'UTC',
                          })}
                        </span>
                      )}
                    </td>
                    <td data-label="GMV" className="text-right px-3 py-2.5 tabular-nums font-medium">
                      {fmtCurrency(c.gmv)}
                    </td>
                    <td data-label="Orders" className="text-right px-3 py-2.5 tabular-nums text-foreground">
                      {fmtNumber(c.orders)}
                    </td>
                    <td data-label="Posts published" className="text-right px-3 py-2.5 tabular-nums text-foreground">
                      {fmtNumber(c.posts)}
                    </td>
                    <td data-label="Recorded fee" className="text-right px-3 py-2.5 tabular-nums text-foreground">
                      {c.retainer > 0 || c.hasVerifiedAgreement ? fmtCurrency(c.retainer) : <span className="text-muted-foreground">—</span>}{c.agreementPeriod && <span className="block text-[11px] text-muted-foreground">{c.agreementPeriod}</span>}
                    </td>
                    <td data-label="ROI (30d)" className="text-right px-4 py-2.5">
                      {c.hasVerifiedAgreement ? <span title="The rolling 30-day window does not establish agreement-period ROI">—<span className={`${portal.phoneOnly} text-xs font-normal text-muted-foreground`}> Rolling 30-day GMV does not establish agreement-period ROI.</span></span> : <RoiCell gmv30d={c.gmv30d} retainer={c.retainer} />}
                    </td>
                    <td className={`${portal.rowAction} text-right pr-3`}>
                      {c.primaryHandle && (
                        <Link
                          href={creatorHref(c.primaryHandle)}
                          className="text-muted-foreground hover:text-muted-foreground inline-flex"
                          aria-label="Open creator"
                        >
                          <span className={portal.phoneOnly}>Open creator</span><ChevronRight className="h-4 w-4" />
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
          <div className={`${portal.pagination} flex items-center justify-between px-4 py-3 border-t border-border/50 text-xs text-muted-foreground`}>
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
      return !c.hasVerifiedAgreement && c.retainer > 0 ? c.gmv30d / c.retainer : -1;
  }
}

function RoiCell({ gmv30d, retainer }: { gmv30d: number; retainer: number }) {
  if (!retainer || retainer <= 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const roi = gmv30d / retainer;
  let cls = 'bg-muted text-muted-foreground';
  if (roi >= 5) cls = 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400';
  else if (roi >= 2) cls = 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400';
  else cls = 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400';
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
  sort,
  direction,
}: {
  initialQuery: string;
  period: BrandPortalPeriod;
  sort: string;
  direction: SortDir;
}) {
  return (
    <form className="relative" method="GET">
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="sort" value={sort} />
      <input type="hidden" name="dir" value={direction} />
      <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        enterKeyHint="search"
        autoCapitalize="none"
        autoCorrect="off"
        aria-label="Search creators"
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
