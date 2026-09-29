'use client';

/**
 * Video sales and engagement for a selected window. Date basis and creator
 * scope change the server query; age, search, review, and sorting are applied
 * to the loaded rows. Engagement is nullable because some videos lack daily
 * tracking data; missing values must not be displayed as zero.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download, Eye, Loader2, Search, ExternalLink,
  AlertTriangle, MessageSquare, Star, Play, ArrowDown, ArrowUp, X,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { useInView } from '@/hooks/use-in-view';
import { useTikTokThumbnail } from '@/hooks/use-tiktok-thumbnail';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { QuickWatchModal } from '@/components/posts/quick-watch-modal';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { TableLoadBar } from '@/components/ui/table-load-bar';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChoiceMenu } from '@/components/ui/choice-menu';
import { SegmentedControl } from '@/components/ui/segmented';
import { EmptyState } from '@/components/ui/empty-state';
import { TableCard } from '@/components/ui/table';

interface PostRow {
  video_id: string;
  video_title: string;
  video_url: string | null;
  creator_handle: string;
  brand_slug: string;
  brand_name: string;
  post_date: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  engagement_rate: number | null;
  gmv: number;
  orders: number;
  items_sold: number;
  is_managed: boolean;
  review_count: number;
  avg_rating: number | null;
  flagged: boolean;
  has_my_review: boolean;
}

interface PostsResponse {
  posts: PostRow[];
  totals: {
    postCount: number;
    totalViews: number | null;
    totalLikes: number | null;
    totalComments: number | null;
    totalShares: number | null;
    viewsKnown: number;
    totalGmv: number;
    avgEngagement: number | null;
    reviewedCount: number;
    unreviewedCount: number;
    flaggedCount: number;
    reviewedByMeCount: number;
  };
  // How many rows the server actually returned (deduped, pre review-filter).
  deliveredCount: number;
  // True when the window has more posts than were shipped (totals stay exact).
  capped: boolean;
  startDate: string;
  endDate: string;
}

// How many rows to mount at once. The full result set (which can be
// thousands of posts) stays in memory for instant sort/search; we just grow
// the rendered slice as the user scrolls so we never mount thousands of DOM
// nodes up front.
const RENDER_CHUNK = 120;

type SortKey = 'gmv' | 'orders' | 'items_sold' | 'views' | 'likes' | 'comments' | 'shares' | 'engagement_rate' | 'post_date' | 'post_age';
type MetricsView = 'sales' | 'engagement';
type SortDir = 'asc' | 'desc';
type ReviewFilter = 'all' | 'unreviewed' | 'reviewed-by-me' | 'flagged';
type AgeBucket = 'all' | '0-30' | '30-60' | '60-90' | '90-180' | '180+' | 'unknown';

const SORT_KEYS: SortKey[] = ['gmv', 'orders', 'items_sold', 'views', 'likes', 'comments', 'shares', 'engagement_rate', 'post_date', 'post_age'];
const AGE_BUCKETS: { value: AgeBucket; label: string }[] = [
  { value: 'all', label: 'All ages' }, { value: '0-30', label: '0–30d' },
  { value: '30-60', label: '30–60d' }, { value: '60-90', label: '60–90d' },
  { value: '90-180', label: '90–180d' }, { value: '180+', label: '180d+' },
  { value: 'unknown', label: 'No date' },
];
function postAgeDays(postDate: string | null, windowEnd: string): number | null {
  if (!postDate) return null;
  const days = Math.floor((Date.parse(`${windowEnd}T00:00:00Z`) - Date.parse(`${postDate}T00:00:00Z`)) / 86_400_000);
  return Number.isFinite(days) ? Math.max(0, days) : null;
}
function ageBucket(days: number | null): AgeBucket {
  if (days === null) return 'unknown';
  if (days < 30) return '0-30';
  if (days < 60) return '30-60';
  if (days < 90) return '60-90';
  if (days < 180) return '90-180';
  return '180+';
}
function isSortKey(v: string | null): v is SortKey {
  return v !== null && (SORT_KEYS as string[]).includes(v);
}

const REVIEW_FILTERS: ReviewFilter[] = ['all', 'unreviewed', 'reviewed-by-me', 'flagged'];
function isReviewFilter(v: string | null): v is ReviewFilter {
  return v !== null && (REVIEW_FILTERS as string[]).includes(v);
}

const fmtN = (n: number | null) => (n === null ? '—' : formatNumber(n));

export function PostsClient({
  brands, selectedBrand, startDate, endDate, managedOnly, staleThrough,
}: {
  brands: string[];
  selectedBrand: string | null;
  staleThrough?: string | null;
  startDate: string;
  endDate: string;
  managedOnly: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const brandMeta = useBrandMeta();

  // Date basis (mig 095): 'earned' (default) = all GMV during the range, any
  // post date; 'posted' = only videos posted during the range (review lens).
  const dateBasis: 'earned' | 'posted' = searchParams.get('basis') === 'posted' ? 'posted' : 'earned';

  const [data, setData] = useState<PostsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Initialize sort + search from URL so refreshes / shares preserve state.
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [creator, setCreator] = useState(searchParams.get('creator') ?? '');
  const [age, setAge] = useState<AgeBucket>(() => AGE_BUCKETS.find(bucket => bucket.value === searchParams.get('age'))?.value ?? 'all');
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    const fromUrl = searchParams.get('sort');
    return isSortKey(fromUrl) ? fromUrl : 'gmv';
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => {
    return searchParams.get('dir') === 'asc' ? 'asc' : 'desc';
  });
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>(() => {
    const fromUrl = searchParams.get('review');
    return isReviewFilter(fromUrl) ? fromUrl : 'all';
  });
  const [metricsView, setMetricsView] = useState<MetricsView>('sales');
  // Quick-watch: index into the CURRENT filtered + sorted list, so "Next
  // post" steps down exactly what the user is looking at.
  const [watchIndex, setWatchIndex] = useState<number | null>(null);
  // How many of the matching posts are currently mounted. Grows as the user
  // scrolls (see the sentinel below) or clicks "Show more".
  const [renderLimit, setRenderLimit] = useState(RENDER_CHUNK);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Sync sort/search/review filter to URL (without re-triggering data fetch
  // unnecessarily) — debounced for search so we're not pushing a history
  // entry per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (sortKey === 'gmv') params.delete('sort'); else params.set('sort', sortKey);
      if (sortDir === 'desc') params.delete('dir'); else params.set('dir', sortDir);
      if (!search) params.delete('q'); else params.set('q', search);
      if (!creator) params.delete('creator'); else params.set('creator', creator);
      if (age === 'all') params.delete('age'); else params.set('age', age);
      if (reviewFilter === 'all') params.delete('review'); else params.set('review', reviewFilter);
      const next = params.toString();
      const current = searchParams.toString();
      if (next !== current) {
        router.replace(next ? `?${next}` : '?', { scroll: false });
      }
    }, 250);
    return () => clearTimeout(t);
  }, [sortKey, sortDir, search, creator, age, reviewFilter, router, searchParams]);

  // Fetch on mount + whenever the DATA scope changes (brand/date/managed).
  // The review filter is deliberately NOT here — it is a pure predicate over
  // fields already on every row, applied client-side below.
  //
  // loading/error reset happens DURING RENDER when the fetch key changes (the
  // sanctioned derive-state-from-props pattern) — not synchronously inside the
  // effect, which the react-hooks lint forbids for cascading-render reasons.
  const fetchKey = `${selectedBrand ?? ''}|${startDate}|${endDate}|${managedOnly}|${dateBasis}`;
  const [prevFetchKey, setPrevFetchKey] = useState<string | null>(null);
  if (fetchKey !== prevFetchKey) {
    setPrevFetchKey(fetchKey);
    setLoading(true);
    setError(null);
  }
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (selectedBrand) params.set('brand', selectedBrand);
    params.set('start', startDate);
    params.set('end', endDate);
    if (!managedOnly) params.set('managed', 'false');
    if (dateBasis === 'posted') params.set('basis', 'posted');
    fetch(`/api/posts?${params.toString()}`)
      .then(async (r) => {
        // Guard res.ok BEFORE trusting the body: a JSON-shaped error response
        // must never be handed to setData as if it were rows.
        const body = await r.json().catch(() => null) as PostsResponse | { error: string } | null;
        if (!r.ok) {
          throw new Error(body && typeof body === 'object' && 'error' in body ? body.error : `HTTP ${r.status}`);
        }
        if (!body || typeof body !== 'object' || 'error' in body) {
          throw new Error(body && 'error' in body ? body.error : 'Malformed response');
        }
        if (!cancelled) setData(body);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load posts');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedBrand, startDate, endDate, managedOnly, dateBasis]);

  const visiblePosts = useMemo(() => {
    if (!data) return [];
    let list = data.posts;
    // Review-queue filter — instant, in-memory.
    if (reviewFilter === 'unreviewed') list = list.filter(p => p.review_count === 0);
    else if (reviewFilter === 'reviewed-by-me') list = list.filter(p => p.has_my_review);
    else if (reviewFilter === 'flagged') list = list.filter(p => p.flagged);
    const creatorTerm = creator.trim().replace(/^@/, '').toLowerCase();
    if (creatorTerm) list = list.filter(p => p.creator_handle.toLowerCase() === creatorTerm);
    if (age !== 'all') list = list.filter(p => ageBucket(postAgeDays(p.post_date, endDate)) === age);
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter(p =>
        p.video_title.toLowerCase().includes(term) ||
        p.creator_handle.toLowerCase().includes(term)
      );
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      if (sortKey === 'post_date') {
        const av = String(a.post_date ?? '');
        const bv = String(b.post_date ?? '');
        return av < bv ? -dir : av > bv ? dir : 0;
      }
      if (sortKey === 'post_age') {
        const av = postAgeDays(a.post_date, endDate);
        const bv = postAgeDays(b.post_date, endDate);
        if (av === null) return bv === null ? 0 : 1;
        if (bv === null) return -1;
        return (av - bv) * dir;
      }
      // Unknown (null) engagement sorts below a real 0 in either direction.
      const av = a[sortKey] ?? -1;
      const bv = b[sortKey] ?? -1;
      return ((av as number) - (bv as number)) * dir;
    });
    return list;
  }, [data, search, creator, age, endDate, sortKey, sortDir, reviewFilter]);

  const ageStats = useMemo(() => {
    const stats = new Map<AgeBucket, { videos: number; gmv: number }>();
    const creatorTerm = creator.trim().replace(/^@/, '').toLowerCase();
    for (const post of data?.posts ?? []) {
      if (creatorTerm && post.creator_handle.toLowerCase() !== creatorTerm) continue;
      const bucket = ageBucket(postAgeDays(post.post_date, endDate));
      const entry = stats.get(bucket) ?? { videos: 0, gmv: 0 };
      entry.videos += 1;
      entry.gmv += post.gmv;
      stats.set(bucket, entry);
    }
    return stats;
  }, [data, creator, endDate]);
  const filteredGmv = useMemo(() => visiblePosts.reduce((sum, post) => sum + post.gmv, 0), [visiblePosts]);
  const hasTableFilters = Boolean(creator || search || age !== 'all' || reviewFilter !== 'all');

  // Reset the rendered window + close quick-watch whenever the matching set
  // changes, so neither points into a stale slice. Render-time adjust (not an
  // effect) per the same lint rule as the fetch-key reset above.
  const listKey = `${search}|${creator}|${age}|${sortKey}|${sortDir}|${reviewFilter}|${data?.startDate ?? ''}|${data?.endDate ?? ''}|${data?.posts.length ?? -1}`;
  const [prevListKey, setPrevListKey] = useState(listKey);
  if (listKey !== prevListKey) {
    setPrevListKey(listKey);
    setRenderLimit(RENDER_CHUNK);
    setWatchIndex(null);
  }

  const renderedPosts = useMemo(
    () => visiblePosts.slice(0, renderLimit),
    [visiblePosts, renderLimit],
  );
  const hasMore = renderedPosts.length < visiblePosts.length;

  // Thin load bar on refetch (brand/date/managed changes). Delayed so it
  // doesn't flash on fast loads; the skeletons still cover the first empty load.
  const showBar = useDelayedFlag(loading);

  // Auto-grow the rendered slice as the sentinel scrolls into view (infinite
  // scroll). The full list is already in memory — this only controls how many
  // DOM nodes are mounted.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) setRenderLimit(n => n + RENDER_CHUNK); },
      { rootMargin: '800px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, visiblePosts.length]);

  function changeSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function setManaged(next: 'all' | 'managed') {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'managed') params.set('managed', 'true');
    else params.delete('managed');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function setBasis(next: 'earned' | 'posted') {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'posted') params.set('basis', 'posted');
    else params.delete('basis');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function setBrand(slug: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (slug === 'all') params.delete('brand');
    else params.set('brand', slug);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function downloadCsv() {
    if (!visiblePosts.length) return;
    const headers = ['Creator', 'Brand', 'Title', 'Posted', 'Post age at window end (days)', 'Views', 'Likes', 'Comments', 'Shares', 'Engagement %', 'GMV', 'Orders', 'URL'];
    const rows = visiblePosts.map(p => [
      `@${p.creator_handle}`,
      p.brand_name,
      p.video_title,
      p.post_date ?? '',
      postAgeDays(p.post_date, endDate) ?? '',
      p.views ?? '',
      p.likes ?? '',
      p.comments ?? '',
      p.shares ?? '',
      p.engagement_rate === null ? '' : p.engagement_rate.toFixed(2),
      p.gmv.toFixed(2),
      p.orders,
      p.video_url ?? '',
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `posts-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function reviewHref(p: PostRow): string {
    const qs = new URLSearchParams({ brand: p.brand_slug, start: startDate, end: endDate });
    return `/posts/${encodeURIComponent(p.video_id)}?${qs.toString()}`;
  }

  function handleRowClick(p: PostRow) {
    if (!p.video_id) return;
    router.push(reviewHref(p));
  }

  const viewsCoverage = data && data.totals.totalViews !== null && data.totals.viewsKnown < data.totals.postCount
    ? `across ${formatNumber(data.totals.viewsKnown)} of ${formatNumber(data.totals.postCount)} posts`
    : undefined;

  const watching = watchIndex !== null ? visiblePosts[watchIndex] ?? null : null;
  const selectedAge = AGE_BUCKETS.find(bucket => bucket.value === age)?.label ?? 'All ages';
  const filterDescription = [
    age !== 'all' ? selectedAge : null,
    creator ? `@${creator.trim().replace(/^@/, '')}` : null,
    search ? 'search' : null,
    reviewFilter !== 'all' ? reviewFilter.replace('reviewed-by-me', 'my reviews') : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Content"
        title="Video performance"
        subtitle={dateBasis === 'earned'
          ? 'See which videos generated sales in the selected period, regardless of publish date.'
          : 'Review videos published in the selected period and the sales they generated.'}
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
            <div className="min-w-40 flex-1 lg:w-44 lg:flex-none">
              <ChoiceMenu compact triggerClassName="w-full" label="Brand filter" value={selectedBrand ?? 'all'} onChange={setBrand}
                options={[{ value: 'all', label: 'All Brands' }, ...brands.map(b => ({ value: b, label: brandMeta.label(b) }))]} />
            </div>
            <DateRangePicker staleThrough={staleThrough} />
          </div>
        }
      />

      {error && (
        <div className="rounded-xl bg-[var(--pulse-neg-bg)] border border-[var(--pulse-neg)]/25 px-4 py-3 text-sm text-[var(--pulse-neg)]">{error}</div>
      )}

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-label="Video performance overview">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Sales window</span>
            <SegmentedControl ariaLabel="Date basis" size="sm" value={dateBasis}
              onValueChange={(v) => setBasis(v as 'earned' | 'posted')}
              options={[{ value: 'earned', label: 'Sales earned' }, { value: 'posted', label: 'New posts only' }]} />
          </div>
          <SegmentedControl ariaLabel="Creator scope" size="sm" value={managedOnly ? 'managed' : 'all'}
            onValueChange={(v) => setManaged(v as 'all' | 'managed')}
            options={[{ value: 'all', label: 'All creators' }, { value: 'managed', label: 'Managed only' }]} />
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-5 sm:divide-y-0">
          <OverviewMetric label="Video GMV" value={data ? formatCurrency(data.totals.totalGmv) : '—'} prominent
            detail="Sales attributed to videos in this window" />
          <OverviewMetric label={dateBasis === 'earned' ? 'Videos earning' : 'Videos posted'} value={data ? formatNumber(data.totals.postCount) : '—'}
            detail="Across the selected brand and scope" />
          <OverviewMetric label="Views" value={data ? fmtN(data.totals.totalViews) : '—'} detail={viewsCoverage ?? 'Recorded during this window'} />
          <OverviewMetric label="Likes" value={data ? fmtN(data.totals.totalLikes) : '—'} detail="Recorded during this window" />
          <OverviewMetric label="Engagement" value={data ? (data.totals.avgEngagement === null ? '—' : `${data.totals.avgEngagement.toFixed(2)}%`) : '—'}
            detail="Likes and comments ÷ views" />
        </div>
        <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground sm:px-5">Video GMV excludes live and product showcase sales that cannot be attributed to an individual video.</p>
      </section>

      {/* Capped-window notice. The KPI totals above are always computed over
          the full window server-side; this only fires when the row payload
          itself was bounded (very large all-creators ranges). */}
      {data?.capped && (
        <div className="rounded-xl bg-[var(--pulse-warn-bg)] border border-[var(--pulse-warn)]/25 px-4 py-2.5 text-xs text-[var(--pulse-warn)]">
          Showing the top {data.deliveredCount.toLocaleString()} posts by GMV of{' '}
          {data.totals.postCount.toLocaleString()} in this range. The totals above
          still reflect all {data.totals.postCount.toLocaleString()}. Narrow the
          date range to load every post into the table.
        </div>
      )}

      <section className="rounded-2xl border border-border bg-card px-4 py-4 shadow-sm sm:px-5" aria-label="Find videos">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[180px] flex-1 text-xs font-semibold text-foreground sm:max-w-72">
            Search videos
            <span className="relative mt-1.5 block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Title or creator" aria-label="Search posts" className="h-9 w-full pl-9 text-sm" />
            </span>
          </label>
          <label className="min-w-[150px] flex-1 text-xs font-semibold text-foreground sm:max-w-48">
            Creator handle
            <Input value={creator} onChange={e => setCreator(e.target.value)} placeholder="Exact @handle" aria-label="Filter by exact creator handle" className="mt-1.5 h-9 w-full text-sm" />
          </label>
          <div className="min-w-[145px] flex-1 text-xs font-semibold text-foreground sm:max-w-48">
            <span>Video age</span>
            <div className="mt-1.5"><ChoiceMenu compact triggerClassName="w-full" label="Video age" value={age} onChange={v => setAge(v as AgeBucket)}
              options={AGE_BUCKETS.map(bucket => ({ value: bucket.value, label: bucket.label,
                description: bucket.value === 'all' || loading ? undefined : `${ageStats.get(bucket.value)?.videos ?? 0} videos · ${formatCurrency(ageStats.get(bucket.value)?.gmv ?? 0)} GMV`,
              }))} /></div>
          </div>
          {hasTableFilters && <Button variant="ghost" size="sm" className="h-9" onClick={() => { setSearch(''); setCreator(''); setAge('all'); setReviewFilter('all'); }}><X className="h-3.5 w-3.5" /> Clear</Button>}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Video age is measured at the end of the selected sales window. The sales shown were earned inside that window.</p>
        {hasTableFilters && !loading && data && <div role="status" className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-border pt-3 text-sm">
          <strong className="font-semibold text-foreground">{formatNumber(visiblePosts.length)} videos · {formatCurrency(filteredGmv)} video GMV</strong>
          <span className="text-xs text-muted-foreground">{filterDescription}. Overview above remains the full brand, date and creator scope.</span>
        </div>}
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <ReviewFilterPills active={reviewFilter} onChange={setReviewFilter} totals={data?.totals} />
        <div className="flex items-center gap-2">
          <SegmentedControl ariaLabel="Table metrics" size="sm" value={metricsView} onValueChange={v => setMetricsView(v as MetricsView)}
            options={[{ value: 'sales', label: 'Sales' }, { value: 'engagement', label: 'Engagement' }]} />
          <Button variant="outline" size="sm" onClick={downloadCsv} disabled={!visiblePosts.length}><Download className="h-3.5 w-3.5" /> CSV</Button>
        </div>
      </div>

      <TableCard className="relative">
        <TableLoadBar active={showBar} />
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Videos</h2>
            <p className="text-xs text-muted-foreground">{metricsView === 'sales' ? 'Orders, units and GMV earned in the selected window' : 'Audience activity recorded in the selected window'}</p>
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">{formatNumber(visiblePosts.length)} results</span>
        </div>
        <div className="space-y-0 md:hidden">
          {loading && !data ? <div className="px-5 py-10 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading videos...</div>
            : visiblePosts.length === 0 ? <PostsEmptyState reviewFilter={reviewFilter} filtered={Boolean(creator || search || age !== 'all')} />
              : renderedPosts.map((p, i) => <PostMobileCard key={`${p.video_id}|${p.brand_slug}`} post={p} windowEnd={endDate}
                  metricsView={metricsView} reviewHref={reviewHref(p)} onWatch={() => setWatchIndex(i)} />)}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left">
                <Th>Post</Th>
                <SortableTh label="Posted"       sortKey="post_date"      current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                <SortableTh label="Age"          sortKey="post_age"       current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                {metricsView === 'sales' ? <>
                  <SortableTh label="Orders" sortKey="orders" current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                  <SortableTh label="Units" sortKey="items_sold" current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                  <SortableTh label="GMV" sortKey="gmv" current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                </> : <>
                  <SortableTh label="Views" sortKey="views" current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                  <SortableTh label="Likes" sortKey="likes" current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                  <SortableTh label="Comments" sortKey="comments" current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                  <SortableTh label="Shares" sortKey="shares" current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                  <SortableTh label="Engagement" sortKey="engagement_rate" current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                </>}
                <Th align="right">Reviews</Th>
              </tr>
            </thead>
            <tbody className={cn(
              showBar && visiblePosts.length > 0 ? 'opacity-60 transition-opacity duration-200' : 'opacity-100',
            )}>
              {loading && !data ? (
                <tr><td colSpan={metricsView === 'sales' ? 7 : 9} className="text-center text-muted-foreground py-12 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading posts...
                </td></tr>
              ) : visiblePosts.length === 0 ? (
                <tr><td colSpan={metricsView === 'sales' ? 7 : 9} className="py-0"><PostsEmptyState reviewFilter={reviewFilter} filtered={Boolean(creator || search || age !== 'all')} /></td></tr>
              ) : (
                renderedPosts.map((p, i) => (
                  <PostRowView
                    key={`${p.video_id}|${p.brand_slug}`}
                    post={p}
                    metricsView={metricsView}
                    windowEnd={endDate}
                    onClick={handleRowClick}
                    onWatch={() => setWatchIndex(i)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          <span>
            {hasMore
              ? `Showing ${renderedPosts.length.toLocaleString()} of ${visiblePosts.length.toLocaleString()}. Scroll to load more.`
              : `${visiblePosts.length.toLocaleString()} ${visiblePosts.length === 1 ? 'post' : 'posts'}`}
          </span>
          <span>Sorted by {sortKey === 'engagement_rate' ? 'engagement' : sortKey === 'post_date' ? 'post date' : sortKey === 'post_age' ? 'post age' : sortKey === 'items_sold' ? 'units' : sortKey}, {dateBasis === 'earned' ? 'earned' : 'posted'} in window</span>
        </div>
      </TableCard>

      {/* Infinite-scroll sentinel + explicit fallback. The sentinel grows the
          mounted slice as it nears the viewport; the button is there for
          keyboard users and when the observer doesn't fire. */}
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRenderLimit(n => n + RENDER_CHUNK)}
          >
            Show more ({(visiblePosts.length - renderedPosts.length).toLocaleString()} more)
          </Button>
        </div>
      )}

      {/* Quick-watch: plays inside Tempo, steps down the current list. */}
      {watching && (
        <QuickWatchModal
          post={watching}
          reviewHref={reviewHref(watching)}
          onClose={() => setWatchIndex(null)}
          onNext={watchIndex !== null && watchIndex + 1 < visiblePosts.length
            ? () => setWatchIndex(watchIndex + 1)
            : null}
        />
      )}
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────
function PostsEmptyState({ reviewFilter, filtered }: { reviewFilter: ReviewFilter; filtered: boolean }) {
  const copy = filtered ? 'No videos match these filters' : reviewFilter === 'all'
    ? 'No posts in this window'
    : reviewFilter === 'unreviewed'
      ? 'Inbox zero: every post in this window has a review.'
      : reviewFilter === 'reviewed-by-me'
        ? 'You haven\'t reviewed anything in this window yet.'
        : 'Nothing flagged. Nice.';
  return (
    <EmptyState
      icon={<Eye className="h-8 w-8" />}
      title={copy}
      description={filtered ? 'Check the exact creator handle or select another video age.' : reviewFilter === 'all'
        ? 'Try a wider date range or a different brand.'
        : undefined}
    />
  );
}

// ── Row cover — lazy TikTok cover with a play affordance ───────────
function RowCover({
  videoUrl, creatorHandle, videoId, brandColor, onWatch,
}: {
  videoUrl: string | null;
  creatorHandle: string;
  videoId: string;
  brandColor: string;
  onWatch: () => void;
}) {
  const { ref, inView } = useInView<HTMLButtonElement>('300px');
  // Both arguments are gated on inView — the hook derives from the identity
  // fallback whenever the stored link isn't a canonical watch URL, so passing
  // it while off-screen would defeat the lazy load.
  const { thumbnail } = useTikTokThumbnail(
    inView ? videoUrl : null,
    inView ? { creatorName: creatorHandle, videoId } : undefined,
  );
  return (
    <button
      ref={ref}
      onClick={(e) => { e.stopPropagation(); onWatch(); }}
      title="Watch here"
      aria-label="Watch video"
      className="group/cover relative h-11 w-[34px] shrink-0 overflow-hidden rounded-md"
      style={!thumbnail ? { background: `linear-gradient(135deg, ${brandColor}33 0%, ${brandColor}88 100%)` } : undefined}
    >
      {thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnail} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity group-hover/cover:opacity-100">
        <Play className="h-3.5 w-3.5 text-white drop-shadow" />
      </span>
    </button>
  );
}

function PostMobileCard({ post: p, windowEnd, metricsView, reviewHref, onWatch }: {
  post: PostRow;
  windowEnd: string;
  metricsView: MetricsView;
  reviewHref: string;
  onWatch: () => void;
}) {
  const brandMeta = useBrandMeta();
  const age = postAgeDays(p.post_date, windowEnd);
  return <article className="border-b border-border px-4 py-3 last:border-b-0">
    <div className="flex items-start gap-3">
      <RowCover videoUrl={p.video_url} creatorHandle={p.creator_handle} videoId={p.video_id}
        brandColor={brandMeta.color(p.brand_slug)} onWatch={onWatch} />
      <div className="min-w-0 flex-1">
        <Link href={reviewHref} className="line-clamp-2 text-sm font-semibold leading-snug text-foreground hover:text-primary">{p.video_title}</Link>
        <p className="mt-1 truncate text-xs text-muted-foreground">@{p.creator_handle} · {p.brand_name}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{p.post_date ? new Date(`${p.post_date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' }) : 'No publish date'}{age === null ? '' : ` · ${age} days old`}</p>
      </div>
      <div className="shrink-0 text-right"><p className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(p.gmv)}</p><p className="text-[10px] text-muted-foreground">Video GMV</p></div>
    </div>
    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/70 pt-2.5 text-xs">
      {metricsView === 'sales' ? <div className="flex gap-4 text-muted-foreground">
        <span><strong className="tabular-nums text-foreground">{formatNumber(p.orders)}</strong> orders</span>
        <span><strong className="tabular-nums text-foreground">{formatNumber(p.items_sold)}</strong> units</span>
      </div> : <div className="flex gap-4 text-muted-foreground">
        <span><strong className="tabular-nums text-foreground">{fmtN(p.views)}</strong> views</span>
        <span><strong className="tabular-nums text-foreground">{p.engagement_rate === null ? '—' : `${p.engagement_rate.toFixed(2)}%`}</strong> engagement</span>
      </div>}
      <ReviewCell post={p} />
    </div>
  </article>;
}

// ── Row + cells ────────────────────────────────────────────────────

function PostRowView({
  post: p, windowEnd, metricsView, onClick, onWatch,
}: {
  post: PostRow;
  windowEnd: string;
  metricsView: MetricsView;
  onClick: (p: PostRow) => void;
  onWatch: () => void;
}) {
  const brandMeta = useBrandMeta();
  const brandColor = brandMeta.color(p.brand_slug);

  return (
    <tr
      onClick={() => onClick(p)}
      className="border-t border-border hover:bg-muted/40 cursor-pointer transition-colors"
    >
      <td className="max-w-[340px] px-4 py-2.5 align-middle sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <RowCover
            videoUrl={p.video_url}
            creatorHandle={p.creator_handle}
            videoId={p.video_id}
            brandColor={brandColor}
            onWatch={onWatch}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate text-[13px] font-semibold text-foreground" title={p.video_title}>
                {p.video_title}
              </span>
              {p.video_url && (
                <a
                  href={p.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="shrink-0 text-muted-foreground hover:text-[var(--primary)]"
                  title="Open on TikTok"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground/75">@{p.creator_handle}</span>
              <span aria-hidden="true">·</span>
              <span className="truncate">{p.brand_name}</span>
              {p.is_managed && <span className="rounded bg-primary/8 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Managed</span>}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-2.5 align-middle text-right text-xs text-muted-foreground whitespace-nowrap">
        {p.post_date
          ? new Date(p.post_date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' })
          : '—'}
      </td>
      <td className="px-4 py-2.5 align-middle text-right text-xs tabular-nums text-muted-foreground whitespace-nowrap">{postAgeDays(p.post_date, windowEnd) === null ? '—' : `${postAgeDays(p.post_date, windowEnd)}d`}</td>
      {metricsView === 'sales' ? <>
        <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{formatNumber(p.orders)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{formatNumber(p.items_sold)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-foreground">{formatCurrency(p.gmv)}</td>
      </> : <>
        <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{fmtN(p.views)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{fmtN(p.likes)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{fmtN(p.comments)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{fmtN(p.shares)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums font-medium text-foreground">{p.engagement_rate === null ? '—' : `${p.engagement_rate.toFixed(2)}%`}</td>
      </>}
      <td className="px-4 py-2.5 align-middle text-right">
        <ReviewCell post={p} />
      </td>
    </tr>
  );
}

// ── Review cell — count + avg rating + flag/me indicators ──────────
function ReviewCell({ post: p }: { post: PostRow }) {
  if (p.review_count === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        none
      </span>
    );
  }
  return (
    <div className="inline-flex items-center gap-2 text-xs">
      <span className="inline-flex items-center gap-1 text-foreground font-semibold tabular-nums">
        <MessageSquare className="h-3 w-3 text-muted-foreground" />
        {p.review_count}
      </span>
      {p.avg_rating !== null && (
        <span className="inline-flex items-center gap-0.5 tabular-nums">
          <Star className="h-3 w-3 fill-[var(--pulse-warn)] text-[var(--pulse-warn)]" />
          <span className="text-foreground font-medium">{p.avg_rating.toFixed(1)}</span>
        </span>
      )}
      {p.flagged && (
        <span title="Flagged: off-brand or needs rework" className="inline-flex items-center gap-0.5 text-[var(--pulse-warn)]">
          <AlertTriangle className="h-3 w-3" />
        </span>
      )}
      {p.has_my_review && (
        <span title="You reviewed this" className="text-[9px] font-bold uppercase tracking-wider text-[var(--primary)] bg-primary/10 ring-1 ring-primary/15 rounded px-1 py-0.5">
          you
        </span>
      )}
    </div>
  );
}

// ── Review filter pill bar ─────────────────────────────────────────
function ReviewFilterPills({
  active, onChange, totals,
}: {
  active: ReviewFilter;
  onChange: (next: ReviewFilter) => void;
  totals?: PostsResponse['totals'];
}) {
  const fmt = (n: number | undefined) => (n === undefined ? '—' : n.toLocaleString());
  const items: Array<{ key: ReviewFilter; label: string; count?: number }> = [
    { key: 'all',             label: 'All',        count: totals?.postCount },
    { key: 'unreviewed',      label: 'Unreviewed', count: totals?.unreviewedCount },
    { key: 'reviewed-by-me',  label: 'Mine',       count: totals?.reviewedByMeCount },
    { key: 'flagged',         label: 'Flagged',    count: totals?.flaggedCount },
  ];
  return (
    <div className="w-full text-xs font-semibold text-foreground sm:w-44">
      <span>Review status</span>
      <div className="mt-1.5"><ChoiceMenu compact triggerClassName="w-full" label="Review status" value={active} onChange={v => onChange(v as ReviewFilter)}
        options={items.map(it => ({ value: it.key, label: `${it.label} · ${fmt(it.count)}` }))} /></div>
    </div>
  );
}

function OverviewMetric({ label, value, detail, prominent = false }: {
  label: string;
  value: string;
  detail: string;
  prominent?: boolean;
}) {
  return <div className="min-w-0 px-4 py-4 sm:px-5">
    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
    <p className={cn('mt-1 tabular-nums font-semibold tracking-tight text-foreground', prominent ? 'text-2xl' : 'text-xl')}>{value}</p>
    <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={detail}>{detail}</p>
  </div>;
}

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
  return (
    <th
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={cn(
        'px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      <button type="button" onClick={() => onClick(sortKey)} aria-label={`Sort by ${label}`}
        className={cn('inline-flex items-center gap-1 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary', align === 'right' && 'ml-auto', active ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>
        {label}{active && (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={cn(
      'px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap',
      align === 'right' ? 'text-right' : 'text-left',
    )}>
      {children}
    </th>
  );
}
