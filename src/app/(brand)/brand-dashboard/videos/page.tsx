import { PortalMobileSort } from '@/components/layout/portal-mobile-sort';
import { PortalMetricStrip } from '@/components/layout/portal-metric-strip';
import portal from '@/components/layout/portal-workspace.module.css';
import { Search, ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { requireBrandPortalContext } from '@/lib/data/brand-portal';
import {
  getBrandPortalDashboard,
  type BrandPortalPeriod,
} from '@/lib/data/brand-portal-overview';
import { createAdminClient } from '@/lib/supabase/server';
import { getBrandRegistry, slugToUuid } from '@/lib/data/brand-registry';
import { resolveWatchUrl } from '@/lib/utils/format';
import { PeriodTabs } from '../period-tabs';
import { SortableHeader, type SortDir } from '../sortable-header';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

type SortColumn = 'title' | 'creator' | 'date' | 'gmv' | 'orders' | 'lifetime_gmv' | 'change' | 'views';

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
      case 'views':
        return params.sort;
      default:
        return 'gmv';
    }
  })();
  const sortDir: SortDir = params.dir === 'asc' ? 'asc' : 'desc';

  const accent = ctx.activeBrand.color || '#6e4bcc';
  const admin = await createAdminClient();
  const reg = await getBrandRegistry();
  const brandUuid = slugToUuid(reg, ctx.activeBrand.slug) ?? ctx.activeBrand.id;
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
    <div className={portal.page}>
      <div className={portal.pageHeader}>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Videos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filtered.length} post{filtered.length === 1 ? '' : 's'} from your managed
            creators · {data.periodLabel}
          </p>
        </div>

      </div>

      <p className="text-xs text-muted-foreground -mt-3">
        GMV is the sales each post generated <strong>during the selected period</strong>.
        Lifetime GMV (totals since posting) is shown as a secondary number.
      </p>

      <PortalMetricStrip items={[
        { label: 'Roster GMV', value: fmtCurrency(data.totalGmv), note: data.periodLabel },
        { label: 'Posts published', value: fmtNumber(data.totalPosts), note: 'Published in the selected period' },
        { label: 'Managed creators', value: fmtNumber(data.managedCount), note: 'Brand roster' },
        { label: 'Tracked posts', value: fmtNumber(data.videos.length), note: 'Before search filters' },
      ]} />

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
          <SearchBox initialQuery={params.q ?? ''} period={period} sort={sortColumn} direction={sortDir} />
          <PeriodTabs current={period} accentColor={accent} />
        </div>
        <PortalMobileSort options={[{value:'title',label:'Video',asc:buildHref({sort:'title',dir:'asc'}),desc:buildHref({sort:'title',dir:'desc'})},{value:'creator',label:'Creator',asc:buildHref({sort:'creator',dir:'asc'}),desc:buildHref({sort:'creator',dir:'desc'})},{value:'date',label:'Posting date',asc:buildHref({sort:'date',dir:'asc'}),desc:buildHref({sort:'date',dir:'desc'})},{value:'views',label:'Views',asc:buildHref({sort:'views',dir:'asc'}),desc:buildHref({sort:'views',dir:'desc'})},{value:'gmv',label:'Period GMV',asc:buildHref({sort:'gmv',dir:'asc'}),desc:buildHref({sort:'gmv',dir:'desc'})},{value:'change',label:'Change from prior',asc:buildHref({sort:'change',dir:'asc'}),desc:buildHref({sort:'change',dir:'desc'})},{value:'orders',label:'Orders',asc:buildHref({sort:'orders',dir:'asc'}),desc:buildHref({sort:'orders',dir:'desc'})},{value:'lifetime_gmv',label:'Lifetime GMV',asc:buildHref({sort:'lifetime_gmv',dir:'asc'}),desc:buildHref({sort:'lifetime_gmv',dir:'desc'})}]} active={sortColumn} direction={sortDir} />
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground px-4 py-12 text-center">
            {data.videos.length === 0
              ? 'No posts in this period.'
              : 'No videos match your search.'}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table role="table" className={`${portal.recordTable} w-full text-sm`} aria-label="Tracked videos">
                <thead>
                  <tr className={`${portal.desktopHeaders} bg-muted/30`}>
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
                      label="Views"
                      column="views"
                      activeColumn={sortColumn}
                      activeDir={sortDir}
                      buildHref={(c, d) => buildHref({ sort: c, dir: d })}
                      align="right"
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
                  <tr className={portal.phoneHeaders}><th scope="col">Video</th><th scope="col">Creator</th><th scope="col">Posted</th><th scope="col">Views</th><th scope="col">Period GMV</th><th scope="col">Change from prior</th><th scope="col">Orders</th><th scope="col">Lifetime GMV</th><th scope="col">Open on TikTok</th></tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {visible.map((v) => {
                    // v.url is daily_video_product_stats.video_url — an
                    // expiring signed CDN MEDIA link on 98% of rows, so it
                    // must never simply win over the derived permalink.
                    const href =
                      resolveWatchUrl(v.url, v.creatorHandle, v.videoId) ?? undefined;
                    return (
                      <tr key={v.videoId} className="hover:bg-muted/30 transition-colors">
                        <td data-label="Video" className="px-4 py-2.5">
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-foreground hover:underline truncate block max-w-[420px]"
                            title={v.title}
                          >
                            {v.title}
                          </a>
                          <p className="hidden text-xs text-muted-foreground mt-0.5">
                            @{v.creatorHandle}
                            {v.postDate && (
                              <>
                                <span className="mx-1.5 text-muted-foreground">·</span>
                                {fmtDate(v.postDate)}
                              </>
                            )}
                          </p>
                        </td>
                        <td data-label="Creator" className="px-3 py-2.5 hidden sm:table-cell">
                          <span className="text-sm" style={{ color: 'var(--brand-ink)' }}>
                            @{v.creatorHandle}
                          </span>
                        </td>
                        <td data-label="Posted" className="px-3 py-2.5 hidden md:table-cell text-muted-foreground text-xs">
                          {v.postDate ? fmtDate(v.postDate) : '—'}
                        </td>
                        <td data-label="Views" className="text-right px-3 py-2.5 tabular-nums text-foreground">
                          {v.impressions > 0 ? fmtCompact(v.impressions) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td data-label="Period GMV" className="text-right px-3 py-2.5 tabular-nums font-medium">
                          {fmtCurrency(v.periodGmv)}
                        </td>
                        <td data-label="Change from prior" className="text-right px-3 py-2.5">
                          <ChangePill curr={v.periodGmv} prior={v.priorGmv} />
                        </td>
                        <td data-label="Orders" className="text-right px-3 py-2.5 tabular-nums text-foreground">
                          {fmtNumber(v.periodOrders)}
                        </td>
                        <td data-label="Lifetime GMV" className="text-right px-4 py-2.5 tabular-nums text-muted-foreground hidden lg:table-cell">
                          {fmtCurrency(v.lifetimeGmv)}
                        </td>
                        <td className={`${portal.rowAction} text-right pr-3`}>
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-muted-foreground inline-flex"
                            aria-label="Open on TikTok"
                          >
                            <span className={portal.phoneOnly}>Open on TikTok</span><ExternalLink className="h-4 w-4" />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

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
    case 'views':
      return v.impressions;
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
      <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
        <TrendingUp className="h-3 w-3" />
        New
      </span>
    );
  }
  if (Math.abs(pct) < 0.1) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
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
        positive ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
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
        aria-label="Search videos"
        name="q"
        defaultValue={initialQuery}
        placeholder="Search videos…"
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

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString('en-US');
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
