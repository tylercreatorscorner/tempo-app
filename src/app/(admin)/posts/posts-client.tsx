'use client';

/**
 * Posts page — every video posted by a managed creator with engagement + revenue.
 *
 * Top-down: title + DateRangePicker → brand pills → managed/all toggle →
 * KPI strip → table.
 *
 * Table columns:
 *   Creator · Brand · Post (clickable to TikTok) · Posted · Views ·
 *   Likes · Comments · Engagement % · GMV
 *
 * Sortable on every metric. Click a row → opens the in-app video panel
 * (existing VideoPanelProvider used elsewhere).
 *
 * Note: shares isn't captured anywhere in our schema — TikTok exports
 * don't include it as a column. If we want shares, it's a column add to
 * daily_video_stats + an upload column-map update.
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

interface PostRow {
  video_id: string;
  video_title: string;
  video_url: string | null;
  creator_handle: string;
  brand_slug: string;
  brand_name: string;
  post_date: string | null;
  views: number;
  likes: number;
  comments: number;
  engagement_rate: number;
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
    totalViews: number;
    totalGmv: number;
    totalLikes: number;
    totalComments: number;
    avgEngagement: number;
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

type SortKey = 'gmv' | 'views' | 'likes' | 'comments' | 'engagement_rate' | 'post_date' | 'creator_handle';
type SortDir = 'asc' | 'desc';
type ReviewFilter = 'all' | 'unreviewed' | 'reviewed-by-me' | 'flagged';
type ViewMode = 'cards' | 'table';

const VIEW_MODES: ViewMode[] = ['cards', 'table'];
function isViewMode(v: string | null): v is ViewMode {
  return v !== null && (VIEW_MODES as string[]).includes(v);
}

const SORT_KEYS: SortKey[] = ['gmv', 'views', 'likes', 'comments', 'engagement_rate', 'post_date', 'creator_handle'];
function isSortKey(v: string | null): v is SortKey {
  return v !== null && (SORT_KEYS as string[]).includes(v);
}

const REVIEW_FILTERS: ReviewFilter[] = ['all', 'unreviewed', 'reviewed-by-me', 'flagged'];
function isReviewFilter(v: string | null): v is ReviewFilter {
  return v !== null && (REVIEW_FILTERS as string[]).includes(v);
}

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

  // Fetch on mount + whenever filters change. The reviewFilter is part of
  // the request because the server applies it before returning rows; the
  // pre-filter pill counts come back in `totals`.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (selectedBrand) params.set('brand', selectedBrand);
    params.set('start', startDate);
    params.set('end', endDate);
    if (!managedOnly) params.set('managed', 'false');
    if (reviewFilter !== 'all') params.set('review', reviewFilter);
    fetch(`/api/posts?${params.toString()}`)
      .then(r => r.json())
      .then((d: PostsResponse | { error: string }) => {
        if (cancelled) return;
        if ('error' in d) setError(d.error);
        else setData(d);
      })
      .catch(() => { if (!cancelled) setError('Failed to load posts'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedBrand, startDate, endDate, managedOnly, reviewFilter]);

  const brandsWithData = useMemo(() => {
    if (!data) return [] as string[];
    return Array.from(new Set(data.posts.map(p => p.brand_slug)));
  }, [data]);

  const visiblePosts = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    let list = data.posts;
    if (term) {
      list = list.filter(p =>
        p.video_title.toLowerCase().includes(term) ||
        p.creator_handle.toLowerCase().includes(term)
      );
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      let av: string | number = a[sortKey] ?? 0;
      let bv: string | number = b[sortKey] ?? 0;
      if (sortKey === 'creator_handle' || sortKey === 'post_date') {
        av = String(av ?? '').toLowerCase();
        bv = String(bv ?? '').toLowerCase();
        return av < bv ? -dir : av > bv ? dir : 0;
      }
      return ((av as number) - (bv as number)) * dir;
    });
    return list;
  }, [data, search, sortKey, sortDir]);

  // Reset the rendered window whenever the matching set changes, so we don't
  // stay scrolled deep into a stale slice after a new search/sort/filter.
  useEffect(() => { setRenderLimit(RENDER_CHUNK); }, [search, sortKey, sortDir, reviewFilter, data]);

  const renderedPosts = useMemo(
    () => visiblePosts.slice(0, renderLimit),
    [visiblePosts, renderLimit],
  );
  const hasMore = renderedPosts.length < visiblePosts.length;

  // Thin load bar on refetch (brand/date/managed/review changes). Delayed so it
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

  function toggleManaged() {
    const params = new URLSearchParams(searchParams.toString());
    if (managedOnly) params.set('managed', 'false');
    else params.delete('managed');
    router.push(`?${params.toString()}`);
  }

  function downloadCsv() {
    if (!visiblePosts.length) return;
    const headers = ['Creator', 'Brand', 'Title', 'Posted', 'Views', 'Likes', 'Comments', 'Engagement %', 'GMV', 'Orders', 'URL'];
    const rows = visiblePosts.map(p => [
      `@${p.creator_handle}`,
      p.brand_name,
      p.video_title,
      p.post_date ?? '',
      p.views,
      p.likes,
      p.comments,
      p.engagement_rate.toFixed(2),
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
    router.push(`/posts/${encodeURIComponent(p.video_id)}?brand=${encodeURIComponent(p.brand_slug)}`);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--foreground)]">Posts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Every video posted by{' '}
            <button
              onClick={toggleManaged}
              className={cn(
                'underline-offset-2 hover:underline transition-colors',
                managedOnly ? 'text-[var(--primary)] font-semibold' : 'text-muted-foreground',
              )}
              title="Toggle: managed creators only / all creators"
            >
              {managedOnly ? 'managed creators' : 'all creators (managed + organic)'}
            </button>
            {' '}— click any row to open the review page (rate + leave notes).
          </p>
        </div>
        <DateRangePicker />
      </div>

      {/* Brand pills */}
      <BrandFilter brands={brands} brandsWithData={brandsWithData} selectedBrand={selectedBrand} />

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
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-500">{error}</div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Posts"        value={data ? formatNumber(data.totals.postCount)    : '—'} />
        <StatCard label="Total Views"  value={data ? formatNumber(data.totals.totalViews)   : '—'} />
        <StatCard label="Total Likes"  value={data ? formatNumber(data.totals.totalLikes)   : '—'} />
        <StatCard label="Avg Engagement" value={data ? `${data.totals.avgEngagement.toFixed(2)}%` : '—'} />
        <StatCard label="Total GMV"    value={data ? formatCurrency(data.totals.totalGmv)   : '—'} />
      </div>

      {/* Capped-window notice. The KPI totals above are always computed over
          the full window server-side; this only fires when the row payload
          itself was bounded (very large all-creators ranges). */}
      {data?.capped && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 text-xs text-amber-500">
          Showing the top {data.deliveredCount.toLocaleString()} posts by GMV of{' '}
          {data.totals.postCount.toLocaleString()} in this range. The totals above
          still reflect all {data.totals.postCount.toLocaleString()} — narrow the
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
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title or creator..."
              aria-label="Search posts"
              className="text-sm bg-card border border-border rounded-xl pl-8 pr-3 py-1.5 w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)]"
            />
          </div>
          <button
            onClick={downloadCsv}
            disabled={!visiblePosts.length}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-border hover:bg-muted text-muted-foreground disabled:opacity-40 transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* Body — cards (default) or table (analytical fallback) */}
      {viewMode === 'cards' ? (
        loading && !data ? (
          <CardLoadingGrid />
        ) : visiblePosts.length === 0 ? (
          <EmptyState reviewFilter={reviewFilter} />
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
        <div className="relative rounded-2xl bg-card border border-border shadow-sm">
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
                  <SortableTh label="Engagement"   sortKey="engagement_rate" current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                  <SortableTh label="GMV"          sortKey="gmv"            current={sortKey} dir={sortDir} onClick={changeSort} align="right" />
                  <Th>Reviews</Th>
                </tr>
              </thead>
              <tbody className={cn(
                showBar && visiblePosts.length > 0 ? 'opacity-60 transition-opacity duration-200' : 'opacity-100',
              )}>
                {loading && !data ? (
                  <tr><td colSpan={10} className="text-center text-muted-foreground py-12 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading posts...
                  </td></tr>
                ) : visiblePosts.length === 0 ? (
                  <tr><td colSpan={10} className="py-0"><EmptyState reviewFilter={reviewFilter} /></td></tr>
                ) : (
                  renderedPosts.map(p => <PostRowView key={`${p.video_id}|${p.brand_slug}`} post={p} onClick={handleRowClick} />)
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Infinite-scroll sentinel + explicit fallback. The sentinel grows the
          mounted slice as it nears the viewport; the button is there for
          keyboard users and when the observer doesn't fire. */}
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center pt-2">
          <button
            onClick={() => setRenderLimit(n => n + RENDER_CHUNK)}
            className="text-xs font-semibold px-4 py-2 rounded-xl border border-border hover:bg-muted text-muted-foreground transition-colors"
          >
            Show more ({(visiblePosts.length - renderedPosts.length).toLocaleString()} more)
          </button>
        </div>
      )}
    </div>
  );
}

// ── View toggle (segmented control) ────────────────────────────────
function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="inline-flex rounded-xl border border-border bg-card overflow-hidden" role="group" aria-label="View mode">
      <button
        type="button"
        onClick={() => onChange('cards')}
        aria-pressed={value === 'cards'}
        title="Card view"
        className={cn(
          'px-2.5 py-1.5 text-xs font-semibold transition-colors',
          value === 'cards' ? 'bg-[var(--primary)] text-white' : 'text-muted-foreground hover:bg-muted',
        )}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onChange('table')}
        aria-pressed={value === 'table'}
        title="Table view"
        className={cn(
          'px-2.5 py-1.5 text-xs font-semibold transition-colors border-l border-border',
          value === 'table' ? 'bg-[var(--primary)] text-white' : 'text-muted-foreground hover:bg-muted',
        )}
      >
        <List className="h-3.5 w-3.5" />
      </button>
    </div>
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
    engagement_rate: 'Engagement',
    post_date: 'Posted',
    creator_handle: 'Creator',
  };
  return (
    <div className="inline-flex rounded-xl border border-border bg-card overflow-hidden">
      <select
        value={sortKey}
        onChange={(e) => onChange(e.target.value as SortKey, sortDir)}
        aria-label="Sort by"
        className="text-xs font-semibold pl-2.5 pr-1 py-1.5 bg-transparent focus:outline-none cursor-pointer text-foreground"
      >
        {SORT_KEYS.map(k => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
      </select>
      <button
        type="button"
        onClick={() => onChange(sortKey, sortDir === 'asc' ? 'desc' : 'asc')}
        title={sortDir === 'asc' ? 'Ascending — click for descending' : 'Descending — click for ascending'}
        aria-label="Toggle sort direction"
        className="px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted border-l border-border"
      >
        {sortDir === 'asc' ? '↑' : '↓'}
      </button>
    </div>
  );
}

// ── Card loading skeleton ──────────────────────────────────────────
function CardLoadingGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden animate-pulse">
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
function EmptyState({ reviewFilter }: { reviewFilter: ReviewFilter }) {
  const copy = reviewFilter === 'all'
    ? 'No posts in this window'
    : reviewFilter === 'unreviewed'
      ? 'Inbox zero — every post in this window has a review.'
      : reviewFilter === 'reviewed-by-me'
        ? 'You haven\'t reviewed anything in this window yet.'
        : 'Nothing flagged. Nice.';
  return (
    <div className="rounded-2xl bg-card border border-border shadow-sm text-center text-muted-foreground py-12 px-6">
      <Eye className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
      <div className="text-sm font-medium">{copy}</div>
      {reviewFilter === 'all' && (
        <div className="text-xs mt-1">Try a wider date range, different brand, or include unmanaged creators.</div>
      )}
    </div>
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
          {p.is_managed && <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-200 rounded px-1 py-0.5">Managed</span>}
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
      <td className="px-4 py-3 align-top text-right tabular-nums text-foreground">{formatNumber(p.views)}</td>
      <td className="px-4 py-3 align-top text-right tabular-nums text-foreground">
        <span className="inline-flex items-center gap-1 text-primary">
          <Heart className="h-3 w-3" />{formatNumber(p.likes)}
        </span>
      </td>
      <td className="px-4 py-3 align-top text-right tabular-nums text-foreground">
        <span className="inline-flex items-center gap-1 text-blue-500">
          <MessageCircle className="h-3 w-3" />{formatNumber(p.comments)}
        </span>
      </td>
      <td className="px-4 py-3 align-top text-right tabular-nums text-foreground">
        <span className={cn(
          'font-medium',
          p.engagement_rate >= 5 ? 'text-emerald-600' : p.engagement_rate >= 2 ? 'text-amber-600' : 'text-muted-foreground',
        )}>
          {p.engagement_rate.toFixed(2)}%
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
        <span className="inline-flex items-center gap-0.5 text-amber-500 tabular-nums">
          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
          <span className="text-foreground font-medium">{p.avg_rating.toFixed(1)}</span>
        </span>
      )}
      {p.flagged && (
        <span title="Flagged: off-brand or needs rework" className="inline-flex items-center gap-0.5 text-amber-600">
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
    <div className="flex flex-wrap items-center gap-2">
      {items.map(it => {
        const isActive = active === it.key;
        return (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors',
              isActive
                ? 'bg-[var(--primary)] text-white'
                : 'bg-card border border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {it.icon}
            {it.label}
            <span className={cn(
              'text-[10px] tabular-nums px-1.5 py-0.5 rounded-full',
              isActive ? 'bg-card/20' : 'bg-muted text-muted-foreground',
            )}>
              {fmt(it.count)}
            </span>
          </button>
        );
      })}
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
