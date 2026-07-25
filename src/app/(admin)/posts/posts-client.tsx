'use client';

/**
 * Posts page — every video in the window, one dense sortable table.
 *
 * Rebuilt 2026-07-23 to the approved mockup:
 *   - The TABLE is the page. No cards mode, no view toggle, nothing between
 *     the KPI strip and the rows but a single toolbar.
 *   - Brand scoping is a DROPDOWN in the header (synced with the sidebar
 *     switcher via the shared ?brand= param) — the old pill wall is gone.
 *   - Default scope is ALL creators; Managed is the opt-in toggle.
 *   - Each row carries a small lazy TikTok cover. Clicking the cover opens
 *     the QUICK-WATCH modal: the video plays inside Tempo (official embed)
 *     and "Next post" steps down the current filtered list. Clicking
 *     anywhere else on the row opens the full review page.
 *   - The review queue (All / Unreviewed / Mine / Flagged) lives in the
 *     toolbar as filter chips with live counts — a pure client-side
 *     predicate over fields already on every row, zero refetches.
 *
 * Engagement (views/likes/comments/shares) is WINDOWED from
 * video_performance (migrations 088/090) and NULLABLE — null means "no
 * engagement data in this window" and renders as an em dash placeholder,
 * never a fake 0. Money is windowed per migration 079.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download, Eye, Loader2, Search, ExternalLink,
  AlertTriangle, MessageSquare, Star, Play,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { useInView } from '@/hooks/use-in-view';
import { useTikTokThumbnail } from '@/hooks/use-tiktok-thumbnail';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { StatCard } from '@/components/dashboard/stat-card';
import { QuickWatchModal } from '@/components/posts/quick-watch-modal';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { TableLoadBar } from '@/components/ui/table-load-bar';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
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
const RENDER_CHUNK = 300;

type SortKey = 'gmv' | 'views' | 'likes' | 'comments' | 'shares' | 'engagement_rate' | 'post_date';
type SortDir = 'asc' | 'desc';
type ReviewFilter = 'all' | 'unreviewed' | 'reviewed-by-me' | 'flagged';

const SORT_KEYS: SortKey[] = ['gmv', 'views', 'likes', 'comments', 'shares', 'engagement_rate', 'post_date'];
function isSortKey(v: string | null): v is SortKey {
  return v !== null && (SORT_KEYS as string[]).includes(v);
}

const REVIEW_FILTERS: ReviewFilter[] = ['all', 'unreviewed', 'reviewed-by-me', 'flagged'];
function isReviewFilter(v: string | null): v is ReviewFilter {
  return v !== null && (REVIEW_FILTERS as string[]).includes(v);
}

const fmtN = (n: number | null) => (n === null ? '—' : formatNumber(n));

export function PostsClient({
  brands, selectedBrand, startDate, endDate, managedOnly,
}: {
  brands: string[];
  selectedBrand: string | null;
  startDate: string;
  endDate: string;
  managedOnly: boolean;
}) {
  const router = useRouter();
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
      if (reviewFilter === 'all') params.delete('review'); else params.set('review', reviewFilter);
      const next = params.toString();
      const current = searchParams.toString();
      if (next !== current) {
        router.replace(next ? `?${next}` : '?', { scroll: false });
      }
    }, 250);
    return () => clearTimeout(t);
  }, [sortKey, sortDir, search, reviewFilter, router, searchParams]);

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
      // Unknown (null) engagement sorts below a real 0 in either direction.
      const av = a[sortKey] ?? -1;
      const bv = b[sortKey] ?? -1;
      return ((av as number) - (bv as number)) * dir;
    });
    return list;
  }, [data, search, sortKey, sortDir, reviewFilter]);

  // Reset the rendered window + close quick-watch whenever the matching set
  // changes, so neither points into a stale slice. Render-time adjust (not an
  // effect) per the same lint rule as the fetch-key reset above.
  const listKey = `${search}|${sortKey}|${sortDir}|${reviewFilter}|${data?.startDate ?? ''}|${data?.endDate ?? ''}|${data?.posts.length ?? -1}`;
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
    router.push(`?${params.toString()}`);
  }

  function setBasis(next: 'earned' | 'posted') {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'posted') params.set('basis', 'posted');
    else params.delete('basis');
    router.push(`?${params.toString()}`);
  }

  function setBrand(slug: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (slug === 'all') params.delete('brand');
    else params.set('brand', slug);
    router.push(`?${params.toString()}`);
  }

  function downloadCsv() {
    if (!visiblePosts.length) return;
    const headers = ['Creator', 'Brand', 'Title', 'Posted', 'Views', 'Likes', 'Comments', 'Shares', 'Engagement %', 'GMV', 'Orders', 'URL'];
    const rows = visiblePosts.map(p => [
      `@${p.creator_handle}`,
      p.brand_name,
      p.video_title,
      p.post_date ?? '',
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        wide
        eyebrow="Content"
        title="Posts"
        subtitle={dateBasis === 'earned'
          ? 'All GMV in the window, whenever the video was posted.'
          : 'Only videos posted in the window.'}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-44">
              <Select
                value={selectedBrand ?? 'all'}
                onChange={(e) => setBrand(e.target.value)}
                aria-label="Brand filter"
                className="py-1.5 text-xs"
              >
                <option value="all">All Brands</option>
                {brands.map(b => <option key={b} value={b}>{brandMeta.label(b)}</option>)}
              </Select>
            </div>
            <SegmentedControl
              ariaLabel="Creator scope"
              size="sm"
              value={managedOnly ? 'managed' : 'all'}
              onValueChange={(v) => setManaged(v as 'all' | 'managed')}
              options={[
                { value: 'all', label: 'All creators' },
                { value: 'managed', label: 'Managed' },
              ]}
            />
            <SegmentedControl
              ariaLabel="Date basis"
              size="sm"
              value={dateBasis}
              onValueChange={(v) => setBasis(v as 'earned' | 'posted')}
              options={[
                { value: 'earned', label: 'Earned in range' },
                { value: 'posted', label: 'Posted in range' },
              ]}
            />
            <DateRangePicker />
          </div>
        }
      />

      {error && (
        <div className="rounded-xl bg-[var(--pulse-neg-bg)] border border-[var(--pulse-neg)]/25 px-4 py-3 text-sm text-[var(--pulse-neg)]">{error}</div>
      )}

      {/* KPI strip. Engagement values are windowed (mig 090) and honest:
          "—" means no engagement data, never zero. */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <StatCard className="col-span-2" hero label="Total GMV" value={data ? formatCurrency(data.totals.totalGmv) : '—'}
          info={dateBasis === 'earned'
            ? 'All video-attributed GMV earned during the selected period, whenever the videos were posted. Excludes live-stream and product-showcase sales, which aren\'t tied to a specific video, so this runs below the creator-level total.'
            : 'GMV earned during the selected period by videos POSTED in the period. Evergreen videos posted earlier are excluded here; switch to Earned in range to include them.'} />
        <StatCard label={dateBasis === 'earned' ? 'Videos earning' : 'Posts'} value={data ? formatNumber(data.totals.postCount) : '—'} />
        <StatCard label="Total Views"  value={data ? fmtN(data.totals.totalViews)   : '—'}
          subValue={viewsCoverage}
          info="Views accrued during the selected period, from the daily Video Data uploads. Posts whose uploads predate engagement tracking show no view data and are excluded." />
        <StatCard label="Total Likes"  value={data ? fmtN(data.totals.totalLikes)   : '—'} />
        <StatCard label="Avg Engagement" value={data ? (data.totals.avgEngagement === null ? '—' : `${data.totals.avgEngagement.toFixed(2)}%`) : '—'}
          info="(Likes + comments) / views across posts with engagement data in the window." />
      </div>

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

      {/* Toolbar: review queue chips + search + CSV, one row. */}
      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <ReviewFilterPills active={reviewFilter} onChange={setReviewFilter} totals={data?.totals} />
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10" />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title or creator..."
              aria-label="Search posts"
              className="pl-8 py-1.5 text-sm w-full sm:w-64"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadCsv}
            disabled={!visiblePosts.length}
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        </div>
      </div>

      {/* The table IS the page. */}
      <TableCard className="relative">
        <TableLoadBar active={showBar} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <Th>Post</Th>
                <SortableTh label="Posted"       sortKey="post_date"      current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                <SortableTh label="Views"        sortKey="views"          current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                <SortableTh label="Likes"        sortKey="likes"          current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                <SortableTh label="Comments"     sortKey="comments"       current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                <SortableTh label="Shares"       sortKey="shares"         current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                <SortableTh label="Engagement"   sortKey="engagement_rate" current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                <SortableTh label="GMV"          sortKey="gmv"            current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                <Th align="right">Reviews</Th>
              </tr>
            </thead>
            <tbody className={cn(
              showBar && visiblePosts.length > 0 ? 'opacity-60 transition-opacity duration-200' : 'opacity-100',
            )}>
              {loading && !data ? (
                <tr><td colSpan={9} className="text-center text-muted-foreground py-12 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading posts...
                </td></tr>
              ) : visiblePosts.length === 0 ? (
                <tr><td colSpan={9} className="py-0"><PostsEmptyState reviewFilter={reviewFilter} /></td></tr>
              ) : (
                renderedPosts.map((p, i) => (
                  <PostRowView
                    key={`${p.video_id}|${p.brand_slug}`}
                    post={p}
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
          <span>Sorted by {sortKey === 'engagement_rate' ? 'engagement' : sortKey === 'post_date' ? 'post date' : sortKey}, earned in window</span>
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
function PostsEmptyState({ reviewFilter }: { reviewFilter: ReviewFilter }) {
  const copy = reviewFilter === 'all'
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
      description={reviewFilter === 'all'
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

// ── Row + cells ────────────────────────────────────────────────────

function PostRowView({
  post: p, onClick, onWatch,
}: {
  post: PostRow;
  onClick: (p: PostRow) => void;
  onWatch: () => void;
}) {
  const brandMeta = useBrandMeta();
  const brandColor = brandMeta.color(p.brand_slug);

  return (
    <tr
      onClick={() => onClick(p)}
      className="border-t border-border hover:bg-muted/50 cursor-pointer transition-colors"
    >
      <td className="px-4 py-2.5 align-middle max-w-md">
        <div className="flex items-center gap-2.5 min-w-0">
          <RowCover
            videoUrl={p.video_url}
            creatorHandle={p.creator_handle}
            videoId={p.video_id}
            brandColor={brandColor}
            onWatch={onWatch}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate text-[13px] font-medium text-[var(--foreground)]" title={p.video_title}>
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
              <span className="font-semibold">@{p.creator_handle}</span>
              {p.is_managed && <Badge variant="positive" size="sm">Managed</Badge>}
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: brandColor }} />
              <span className="truncate">{p.brand_name}</span>
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-2.5 align-middle text-right text-xs text-muted-foreground whitespace-nowrap">
        {p.post_date
          ? new Date(p.post_date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' })
          : '—'}
      </td>
      <td className="px-4 py-2.5 align-middle text-right tabular-nums text-foreground">{fmtN(p.views)}</td>
      <td className="px-4 py-2.5 align-middle text-right tabular-nums text-foreground">{fmtN(p.likes)}</td>
      <td className="px-4 py-2.5 align-middle text-right tabular-nums text-foreground">{fmtN(p.comments)}</td>
      <td className="px-4 py-2.5 align-middle text-right tabular-nums text-foreground">{fmtN(p.shares)}</td>
      <td className="px-4 py-2.5 align-middle text-right tabular-nums">
        <span className={cn(
          'font-medium',
          p.engagement_rate === null
            ? 'text-muted-foreground'
            : p.engagement_rate >= 5
              ? 'text-[var(--pulse-pos)]'
              : p.engagement_rate >= 2
                ? 'text-[var(--pulse-warn)]'
                : 'text-muted-foreground',
        )}>
          {p.engagement_rate === null ? '—' : `${p.engagement_rate.toFixed(2)}%`}
        </span>
      </td>
      <td className="px-4 py-2.5 align-middle text-right tabular-nums font-bold text-[var(--primary)]">{formatCurrency(p.gmv)}</td>
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
  // Counts come from the unfiltered scope so they stay stable as the user
  // switches between pills. Show "—" while data is in flight.
  const fmt = (n: number | undefined) => (n === undefined ? '—' : n.toLocaleString());
  const items: Array<{ key: ReviewFilter; label: string; count?: number; icon?: React.ReactNode }> = [
    { key: 'all',             label: 'All',        count: totals?.postCount },
    { key: 'unreviewed',      label: 'Unreviewed', count: totals?.unreviewedCount },
    { key: 'reviewed-by-me',  label: 'Mine',       count: totals?.reviewedByMeCount },
    { key: 'flagged',         label: 'Flagged',    count: totals?.flaggedCount, icon: <AlertTriangle className="h-3 w-3" /> },
  ];
  return (
    <div className="overflow-x-auto">
      <SegmentedControl
        ariaLabel="Review queue filter"
        size="sm"
        value={active}
        onValueChange={onChange}
        options={items.map(it => ({
          value: it.key,
          label: (
            <span className="inline-flex items-center gap-1.5">
              {it.icon}
              {it.label}
              <span className="text-[10px] tabular-nums text-muted-foreground">{fmt(it.count)}</span>
            </span>
          ),
        }))}
      />
    </div>
  );
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
  const arrow = active ? (dir === 'asc' ? '↑' : '↓') : '';
  return (
    <th
      onClick={() => onClick(sortKey)}
      className={cn(
        'px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none transition-colors whitespace-nowrap',
        align === 'right' ? 'text-right' : 'text-left',
        active ? 'text-[var(--primary)]' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}{arrow && <span className="ml-1">{arrow}</span>}
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
