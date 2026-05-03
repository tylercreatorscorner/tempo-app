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
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download, Eye, Heart, Loader2, MessageCircle, Search, ExternalLink,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BRAND_COLORS } from '@/lib/utils/constants';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { BrandFilter } from '@/components/creators/brand-filter';
import { StatCard } from '@/components/dashboard/stat-card';
import { useVideoPanel } from '@/components/video/video-panel-context';
import { formatCurrency, formatNumber } from '@/lib/utils/format';

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
  };
  startDate: string;
  endDate: string;
}

type SortKey = 'gmv' | 'views' | 'likes' | 'comments' | 'engagement_rate' | 'post_date' | 'creator_handle';
type SortDir = 'asc' | 'desc';

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
  const { openVideo } = useVideoPanel();

  const [data, setData] = useState<PostsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('gmv');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Fetch on mount + whenever filters change
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
      .then(r => r.json())
      .then((d: PostsResponse | { error: string }) => {
        if (cancelled) return;
        if ('error' in d) setError(d.error);
        else setData(d);
      })
      .catch(() => { if (!cancelled) setError('Failed to load posts'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedBrand, startDate, endDate, managedOnly]);

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
    // Navigate to the per-post review page (with brand context).
    // The `openVideo` panel is still imported and could be wired to a small
    // inline preview button later if useful — for now, clicking a row goes
    // straight to the review page where reviews + KPIs live together.
    void openVideo;
    router.push(`/posts/${encodeURIComponent(p.video_id)}?brand=${encodeURIComponent(p.brand_slug)}`);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1A1B3A]">Posts</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Every video posted by{' '}
            <button
              onClick={toggleManaged}
              className={cn(
                'underline-offset-2 hover:underline transition-colors',
                managedOnly ? 'text-[#E91E8C] font-semibold' : 'text-gray-500',
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

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Posts"        value={data ? formatNumber(data.totals.postCount)    : '—'} />
        <StatCard label="Total Views"  value={data ? formatNumber(data.totals.totalViews)   : '—'} />
        <StatCard label="Total Likes"  value={data ? formatNumber(data.totals.totalLikes)   : '—'} />
        <StatCard label="Avg Engagement" value={data ? `${data.totals.avgEngagement.toFixed(2)}%` : '—'} />
        <StatCard label="Total GMV"    value={data ? formatCurrency(data.totals.totalGmv)   : '—'} />
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-[#1A1B3A]">All posts</h2>
            <span className="text-xs text-gray-400">
              {visiblePosts.length} of {data?.posts.length ?? 0}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title or creator..."
                className="text-sm bg-white border border-gray-200 rounded-xl pl-8 pr-3 py-1.5 w-64 focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/20 focus:border-[#E91E8C]"
              />
            </div>
            <button
              onClick={downloadCsv}
              disabled={!visiblePosts.length}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 disabled:opacity-40 transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          </div>
        </div>

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
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr><td colSpan={9} className="text-center text-gray-400 py-12 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading posts...
                </td></tr>
              ) : visiblePosts.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-gray-400 py-12">
                  <Eye className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                  <div className="text-sm font-medium">No posts in this window</div>
                  <div className="text-xs mt-1">Try a wider date range, different brand, or include unmanaged creators.</div>
                </td></tr>
              ) : (
                visiblePosts.map(p => <PostRowView key={p.video_id} post={p} onClick={handleRowClick} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Row + cells ────────────────────────────────────────────────────

function PostRowView({ post: p, onClick }: { post: PostRow; onClick: (p: PostRow) => void }) {
  const brandColor = BRAND_COLORS[p.brand_slug] ?? '#6B7280';
  const titleClipped = p.video_title.length > 90 ? p.video_title.slice(0, 90) + '…' : p.video_title;

  return (
    <tr
      onClick={() => onClick(p)}
      className="border-t border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors"
    >
      <td className="px-4 py-3 align-top">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#1A1B3A]">@{p.creator_handle}</span>
          {p.is_managed && <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 rounded px-1 py-0.5">Managed</span>}
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: brandColor }} />
          {p.brand_name}
        </span>
      </td>
      <td className="px-4 py-3 align-top max-w-md">
        <div className="flex items-start gap-2">
          <span className="text-sm text-[#1A1B3A] line-clamp-2" title={p.video_title}>{titleClipped}</span>
          {p.video_url && (
            <a
              href={p.video_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-gray-400 hover:text-[#E91E8C] mt-0.5 shrink-0"
              title="Open on TikTok"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </td>
      <td className="px-4 py-3 align-top text-xs text-gray-500 whitespace-nowrap">
        {p.post_date
          ? new Date(p.post_date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
          : '—'}
      </td>
      <td className="px-4 py-3 align-top text-right tabular-nums text-gray-700">{formatNumber(p.views)}</td>
      <td className="px-4 py-3 align-top text-right tabular-nums text-gray-700">
        <span className="inline-flex items-center gap-1 text-pink-700">
          <Heart className="h-3 w-3" />{formatNumber(p.likes)}
        </span>
      </td>
      <td className="px-4 py-3 align-top text-right tabular-nums text-gray-700">
        <span className="inline-flex items-center gap-1 text-blue-700">
          <MessageCircle className="h-3 w-3" />{formatNumber(p.comments)}
        </span>
      </td>
      <td className="px-4 py-3 align-top text-right tabular-nums text-gray-700">
        <span className={cn(
          'font-medium',
          p.engagement_rate >= 5 ? 'text-emerald-600' : p.engagement_rate >= 2 ? 'text-amber-600' : 'text-gray-500',
        )}>
          {p.engagement_rate.toFixed(2)}%
        </span>
      </td>
      <td className="px-4 py-3 align-top text-right tabular-nums font-bold text-[#E91E8C]">{formatCurrency(p.gmv)}</td>
    </tr>
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
        active ? 'text-[#E91E8C]' : 'text-gray-500 hover:text-gray-700',
      )}
    >
      {label}{arrow && <span className="ml-1">{arrow}</span>}
    </th>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">{children}</th>;
}
