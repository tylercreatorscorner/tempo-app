import { Search, ExternalLink } from 'lucide-react';
import { requireBrandPortalContext } from '@/lib/data/brand-portal';
import {
  getBrandPortalDashboard,
  type BrandPortalPeriod,
} from '@/lib/data/brand-portal-overview';
import { createAdminClient } from '@/lib/supabase/server';
import { BRAND_UUID_MAP } from '@/lib/utils/constants';
import { PeriodTabs } from '../period-tabs';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ q?: string; period?: string }>;
}

export default async function BrandVideosPage({ searchParams }: PageProps) {
  const ctx = await requireBrandPortalContext();
  const params = await searchParams;
  const search = (params.q ?? '').trim().toLowerCase();
  const period: BrandPortalPeriod = (() => {
    switch (params.period) {
      case '30d':
      case 'this_month':
      case 'last_month':
        return params.period;
      default:
        return '7d';
    }
  })();

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
    : data.videos;

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1B3A]">Videos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {data.videos.length} post{data.videos.length === 1 ? '' : 's'} from your
            managed creators · {data.periodLabel}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <SearchBox initialQuery={params.q ?? ''} />
          <PeriodTabs current={period} accentColor={accent} />
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 px-4 py-12 text-center">
            {data.videos.length === 0
              ? 'No posts in this period.'
              : 'No videos match your search.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50/50">
                  <th className="text-left px-4 py-3">Video</th>
                  <th className="text-left px-3 py-3 hidden sm:table-cell">Creator</th>
                  <th className="text-left px-3 py-3 hidden md:table-cell">Posted</th>
                  <th className="text-right px-3 py-3">GMV</th>
                  <th className="text-right px-4 py-3">Orders</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((v) => {
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
                        {/* Mobile-only: show creator + date inline since columns are hidden */}
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
                        {fmtCurrency(v.gmv)}
                      </td>
                      <td className="text-right px-4 py-2.5 tabular-nums text-gray-700">
                        {fmtNumber(v.orders)}
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
        )}
      </div>
    </div>
  );
}

function SearchBox({ initialQuery }: { initialQuery: string }) {
  return (
    <form className="relative">
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
