'use client';

/**
 * Posts page — every video posted by a managed creator with engagement + revenue.
 *
 * Top-down: title + managed/all control + DateRangePicker → brand pills →
 * review-queue pills → KPI strip → card grid (default) or table.
 *
 * Engagement (views/likes/comments/shares) is WINDOWED from video_performance
 * (migrations 088/090) and NULLABLE — null means "no engagement data in this
 * window" and renders as an em dash placeholder, never a fake 0. Money is
 * windowed per migration 079. Cards resolve real TikTok covers lazily via
 * oEmbed (useTikTokThumbnail + useInView).
 *
 * The review-queue filter is a pure client-side predicate: every row already
 * carries review_count / flagged / has_my_review, so pill toggles never
 * refetch (the old behavior cost ~5 DB round-trips per toggle to return a
 * subset of rows the client was already holding).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download, Eye, Heart, Loader2, MessageCircle, Search, ExternalLink,
  AlertTriangle, MessageSquare, Star, LayoutGrid, List,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { BrandFilter } from '@/components/creators/brand-filter';
import { StatCard } from '@/components/dashboard/stat-card';
import { PostCard } from '@/components/posts/post-card';
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

// How many cards/rows to mount at once. The full result set (which can be
// thousands of posts) stays in memory for instant sort/search; we just grow
// the rendered slice as the user scrolls so we never mount thousands of DOM
// nodes up front.
const RENDER_CHUNK = 300;

type SortKey = 'gmv' | 'views' | 'likes' | 'comments' | 'shares' | 'engagement_rate' | 'post_date' | 'creator_handle';
type SortDir = 'asc' | 'desc';
type ReviewFilter = 'all' | 'unreviewed' | 'reviewed-by-me' | 'flagged';
type ViewMode = 'cards' | 'table';

const VIEW_MODES: ViewMode[] = ['cards', 'table'];
function isViewMode(v: string | null): v is ViewMode {
  return v !== null && (VIEW_MODES as string[]).includes(v);
}

const SORT_KEYS: SortKey[] = ['gmv', 'views', 'likes', 'comments', 'shares', 'engagement_rate', 'post_date', 'creator_handle'];
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
  // View mode defaults to 'cards' — the Posts page is primarily a creative-
  // review surface, and the table is the analytical fallback. Explicit
  // `?view=table` opts into the dense view. The choice is persisted in
  // the URL so refresh / share preserves it.
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const fromUrl = searchParams.get('view');
    return isViewMode(fromUrl) ? fromUrl : 'cards';
  });
  // How many of the matching posts are currently mounted. Grows as the user
  // scrolls (see the sentinel below) or clicks "Show more".
  const [renderLimit, setRenderLimit] = useState(RENDER_CHUNK);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Sync sort/search/review filter/view to URL (without re-triggering data
  // fetch unnecessarily) — debounced for search so we're not pushing a
  // history entry per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (sortKey === 'gmv') params.delete('sort'); else params.set('sort', sortKey);
      if (sortDir === 'desc') params.delete('dir'); else params.set('dir', sortDir);
      if (!search) params.delete('q'); else params.set('q', search);
      if (reviewFilter === 'all') params.delete('review'); else params.set('review', reviewFilter);
      if (viewMode === 'cards') params.delete('view'); else params.set('view', viewMode);
      const next = params.toString();
      const current = searchParams.toString();
      if (next !== current) {
        router.replace(next ? `?${next}` : '?', { scroll: false });
      }
    }, 250);
    return () => clearTimeout(t);
  }, [sortKey, sortDir, search, reviewFilter, viewMode, router, searchParams]);

  // Fetch on mount + whenever the DATA scope changes (brand/date/managed).
  // The review filter is deliberately NOT here — it is a pure predicate over
  // fields already on every row, applied client-side below.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (selectedBrand) params.set('brand', selectedBrand);
    params.set('start', startDate);
    params.set('end', endDate);
    if (!managedOnly) params.set('managed', 'false');
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
  }, [selectedBrand, startDate, endDate, managedOnly]);

  const brandsWithData = useMemo(() => {
    if (!data) return [] as string[];
    return Array.from(new Set(data.posts.map(p => p.brand_slug)));
  }, [data]);

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
      if (sortKey === 'creator_handle' || sortKey === 'post_date') {
        const av = String(a[sortKey] ?? '').toLowerCase();
        const bv = String(b[sortKey] ?? '').toLowerCase();
        return av < bv ? -dir : av > bv ? dir : 0;
      }
      // Unknown (null) engagement sorts below a real 0 in either direction.
      const av = a[sortKey] ?? -1;
      const bv = b[sortKey] ?? -1;
      return ((av as number) - (bv as number)) * dir;
    });
    return list;
  }, [data, search, sortKey, sortDir, reviewFilter]);

  // Reset the rendered window whenever the matching set changes, so we don't
  // stay scrolled deep into a stale slice after a new search/sort/filter.
  useEffect(() => { setRenderLimit(RENDER_CHUNK); }, [search, sortKey, sortDir, reviewFilter, data]);

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
      setSortDir(key === 'creator_handle' ? 'asc' : 'desc');
    }
  }

  function setManaged(next: 'managed' | 'all') {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'all') params.set('managed', 'false');
    else params.delete('managed');
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

  function handleRowClick(p: PostRow) {
    if (!p.video_id) return;
    // Carry the window through so the review page can tie its numbers to the
    // row that was clicked.
    const qs = new URLSearchParams({ brand: p.brand_slug, start: startDate, end: endDate });
    router.push(`/posts/${encodeURIComponent(p.video_id)}?${qs.toString()}`);
  }

  const viewsCoverage = data && data.totals.totalViews !== null && data.totals.viewsKnown < data.totals.postCount
    ? `across ${formatNumber(data.totals.viewsKnown)} of ${formatNumber(data.totals.postCount)} posts`
    : undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        eyebrow="Content"
        title="Posts"
        subtitle="Every video in the window. Click a post to open its review page: rate it, tag it, leave notes."
        actions={
          <div className="flex items-center gap-2">
            <SegmentedControl
              ariaLabel="Creator scope"
              size="sm"
              value={managedOnly ? 'managed' : 'all'}
              onValueChange={(v) => setManaged(v as 'managed' | 'all')}
              options={[
                { value: 'managed', label: 'Managed' },
                { value: 'all', label: 'All creators' },
              ]}
            />
            <DateRangePicker />
          </div>
        }
      />

      {/* Brand pills */}
      <BrandFilter brands={brands} brandsWithData={brandsWithData} selectedBrand={selectedBrand} collapseNoData />

      {/* Review queue filter — pills with live counts so you can see at a
          glance how much work is queued. Counts come from `totals` and
          reflect the unfiltered scope, so flipping pills doesn't make the
          numbers shift around under your cursor. */}
      <ReviewFilterPills
        active={reviewFilter}
        onChange={setReviewFilter}
        totals={data?.totals}
      />

      {error && (
        <div className="rounded-xl bg-[var(--pulse-neg-bg)] border border-[var(--pulse-neg)]/25 px-4 py-3 text-sm text-[var(--pulse-neg)]">{error}</div>
      )}

      {/* KPI strip. Engagement values are windowed (mig 090) and honest:
          "—" means no engagement data, never zero. */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <StatCard className="col-span-2" hero label="Total GMV" value={data ? formatCurrency(data.totals.totalGmv) : '—'}
          info="GMV earned by these videos during the selected period, attributed to the video. Excludes live-stream and product-showcase sales, which aren't tied to a specific video, so this runs below the creator-level total." />
        <StatCard label="Posts"        value={data ? formatNumber(data.totals.postCount)    : '—'} />
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

      {/* Header bar — shared between card + table views. Title + count on
          the left, view toggle / sort dropdown / search / CSV on the right. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-[var(--foreground)]">All posts</h2>
          <span className="text-xs text-muted-foreground">
            {hasMore
              ? `Showing ${renderedPosts.length.toLocaleString()} of ${visiblePosts.length.toLocaleString()}`
              : `${visiblePosts.length.toLocaleString()} ${visiblePosts.length === 1 ? 'post' : 'posts'}`}
          </span>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* View toggle — small segmented control. Cards is the default; the
              icon ordering (grid → list) follows YouTube Studio / TikTok
              Studio convention. */}
          <ViewToggle value={viewMode} onChange={setViewMode} />
          {/* In card view we can't sort via table headers, so we surface a
              compact sort dropdown. In table view this stays mounted but
              hidden — the header arrows handle it there. */}
          {viewMode === 'cards' && (
            <SortDropdown sortKey={sortKey} sortDir={sortDir} onChange={(k, d) => { setSortKey(k); setSortDir(d); }} />
          )}
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

      {/* Body — cards (default) or table (analytical fallback) */}
      {viewMode === 'cards' ? (
        loading && !data ? (
          <CardLoadingGrid />
        ) : visiblePosts.length === 0 ? (
          <PostsEmptyState reviewFilter={reviewFilter} />
        ) : (
          <div className="relative">
            <TableLoadBar active={showBar} />
            <div className={cn(
              'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4',
              showBar && visiblePosts.length > 0 ? 'opacity-60 transition-opacity duration-200' : 'opacity-100',
            )}>
              {renderedPosts.map(p => <PostCard key={`${p.video_id}|${p.brand_slug}`} post={p} onClick={handleRowClick} />)}
            </div>
          </div>
        )
      ) : (
        <TableCard className="relative">
          <TableLoadBar active={showBar} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <SortableTh label="Creator"      sortKey="creator_handle" current={sortKey} dir={sortDir} onClick={changeSort} />
                  <Th>Brand</Th>
                  <Th>Post</Th>
                  <SortableTh label="Posted"       sortKey="post_date"      current={sortKey} dir={sortDir} onClick={changeSort} />
                  <SortableTh label="Views"        sortKey="views"          current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                  <SortableTh label="Likes"        sortKey="likes"          current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                  <SortableTh label="Comments"     sortKey="comments"       current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                  <SortableTh label="Shares"       sortKey="shares"         current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                  <SortableTh label="Engagement"   sortKey="engagement_rate" current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                  <SortableTh label="GMV"          sortKey="gmv"            current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                  <Th>Reviews</Th>
                </tr>
              </thead>
              <tbody className={cn(
                showBar && visiblePosts.length > 0 ? 'opacity-60 transition-opacity duration-200' : 'opacity-100',
              )}>
                {loading && !data ? (
                  <tr><td colSpan={11} className="text-center text-muted-foreground py-12 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading posts...
                  </td></tr>
                ) : visiblePosts.length === 0 ? (
                  <tr><td colSpan={11} className="py-0"><PostsEmptyState reviewFilter={reviewFilter} /></td></tr>
                ) : (
                  renderedPosts.map(p => <PostRowView key={`${p.video_id}|${p.brand_slug}`} post={p} onClick={handleRowClick} />)
                )}
              </tbody>
            </table>
          </div>
        </TableCard>
      )}

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
    </div>
  );
}

// ── View toggle (segmented control) ────────────────────────────────
function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <SegmentedControl
      ariaLabel="View mode"
      size="sm"
      value={value}
      onValueChange={onChange}
      options={[
        { value: 'cards', label: <LayoutGrid className="h-3.5 w-3.5" /> },
        { value: 'table', label: <List className="h-3.5 w-3.5" /> },
      ]}
    />
  );
}

// ── Sort dropdown (card view only) ─────────────────────────────────
function SortDropdown({
  sortKey, sortDir, onChange,
}: {
  sortKey: SortKey;
  sortDir: SortDir;
  onChange: (key: SortKey, dir: SortDir) => void;
}) {
  const SORT_LABELS: Record<SortKey, string> = {
    gmv: 'GMV',
    views: 'Views',
    likes: 'Likes',
    comments: 'Comments',
    shares: 'Shares',
    engagement_rate: 'Engagement',
    post_date: 'Posted',
    creator_handle: 'Creator',
  };
  return (
    <div className="flex items-center gap-2">
      <div className="w-36">
        <Select
          value={sortKey}
          onChange={(e) => onChange(e.target.value as SortKey, sortDir)}
          aria-label="Sort by"
          className="py-1.5 text-xs"
        >
          {SORT_KEYS.map(k => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
        </Select>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange(sortKey, sortDir === 'asc' ? 'desc' : 'asc')}
        title={sortDir === 'asc' ? 'Ascending. Click for descending.' : 'Descending. Click for ascending.'}
        aria-label="Toggle sort direction"
      >
        {sortDir === 'asc' ? '↑' : '↓'}
      </Button>
    </div>
  );
}

// ── Card loading skeleton ──────────────────────────────────────────
function CardLoadingGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-card border border-border shadow-[var(--pulse-elev-1)] overflow-hidden animate-pulse">
          <div className="aspect-video bg-muted" />
          <div className="p-4 space-y-3">
            <div className="h-3 w-2/3 bg-muted rounded" />
            <div className="h-3 w-full bg-muted rounded" />
            <div className="h-3 w-1/2 bg-muted rounded" />
          </div>
        </div>
      ))}
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
        ? 'Try a wider date range, different brand, or include unmanaged creators.'
        : undefined}
    />
  );
}

// ── Row + cells ────────────────────────────────────────────────────

function PostRowView({ post: p, onClick }: { post: PostRow; onClick: (p: PostRow) => void }) {
  const brandMeta = useBrandMeta();
  const brandColor = brandMeta.color(p.brand_slug);
  const titleClipped = p.video_title.length > 90 ? p.video_title.slice(0, 90) + '…' : p.video_title;

  return (
    <tr
      onClick={() => onClick(p)}
      className="border-t border-border hover:bg-muted/50 cursor-pointer transition-colors"
    >
      <td className="px-4 py-3 align-top">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--foreground)]">@{p.creator_handle}</span>
          {p.is_managed && <Badge variant="positive" size="sm">Managed</Badge>}
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: brandColor }} />
          {p.brand_name}
        </span>
      </td>
      <td className="px-4 py-3 align-top max-w-md">
        <div className="flex items-start gap-2">
          <span className="text-sm text-[var(--foreground)] line-clamp-2" title={p.video_title}>{titleClipped}</span>
          {p.video_url && (
            <a
              href={p.video_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-muted-foreground hover:text-[var(--primary)] mt-0.5 shrink-0"
              title="Open on TikTok"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </td>
      <td className="px-4 py-3 align-top text-xs text-muted-foreground whitespace-nowrap">
        {p.post_date
          ? new Date(p.post_date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit', timeZone: 'America/Chicago' })
          : '—'}
      </td>
      <td className="px-4 py-3 align-top text-right tabular-nums text-foreground">{fmtN(p.views)}</td>
      <td className="px-4 py-3 align-top text-right tabular-nums text-foreground">
        <span className="inline-flex items-center gap-1 text-primary">
          <Heart className="h-3 w-3" />{fmtN(p.likes)}
        </span>
      </td>
      <td className="px-4 py-3 align-top text-right tabular-nums text-foreground">
        <span className="inline-flex items-center gap-1">
          <MessageCircle className="h-3 w-3 text-muted-foreground" />{fmtN(p.comments)}
        </span>
      </td>
      <td className="px-4 py-3 align-top text-right tabular-nums text-foreground">{fmtN(p.shares)}</td>
      <td className="px-4 py-3 align-top text-right tabular-nums text-foreground">
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
      <td className="px-4 py-3 align-top text-right tabular-nums font-bold text-[var(--primary)]">{formatCurrency(p.gmv)}</td>
      <td className="px-4 py-3 align-top">
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
        <MessageSquare className="h-3 w-3" />
        none
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs">
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
    { key: 'all',             label: 'All',           count: totals?.postCount },
    { key: 'unreviewed',      label: 'Unreviewed',    count: totals?.unreviewedCount, icon: <MessageSquare className="h-3 w-3" /> },
    { key: 'reviewed-by-me',  label: 'Reviewed by me', count: totals?.reviewedByMeCount },
    { key: 'flagged',         label: 'Flagged',       count: totals?.flaggedCount, icon: <AlertTriangle className="h-3 w-3" /> },
  ];
  return (
    <div className="overflow-x-auto">
      <SegmentedControl
        ariaLabel="Review queue filter"
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
        'px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none transition-colors',
        align === 'right' ? 'text-right' : 'text-left',
        active ? 'text-[var(--primary)]' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}{arrow && <span className="ml-1">{arrow}</span>}
    </th>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{children}</th>;
}
