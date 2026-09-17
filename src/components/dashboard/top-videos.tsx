import Link from 'next/link';
import { VideoThumbnail } from './video-thumbnail';
import { formatCurrency } from '@/lib/utils/format';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

export interface TopVideoRow {
  title: string;
  url: string;
  handle: string;
  brand: string;
  gmv: number;
  /** Windowed views (migration 088) — null until that window's daily files
   *  have been uploaded with engagement columns; rendered only when real. */
  views?: number | null;
}

/**
 * Top managed videos by GMV EARNED in the period (get_top_videos_by_window_gmv,
 * migration 079), deduped by the real videos.video_id. Covers load on visibility
 * with a play fallback when unavailable; each row links to the TikTok video.
 *
 * Views (migration 088) are WINDOWED — summed from the per-day engagement the
 * Video Data upload now ingests — so they sit honestly beside windowed GMV.
 * They render only when non-null (history has no engagement until re-uploaded).
 *
 * `failed` is separate from an empty list on purpose. "No managed videos in this
 * period" is a CLAIM about your data; if the query died we haven't earned it.
 * This card spent weeks asserting it on any window over ~a week, because the RPC
 * was timing out and the page read only `.data`.
 */
export function TopVideos({ videos, label, failed = false, brand }: { videos: TopVideoRow[]; label: string; failed?: boolean; brand?: string | null }) {
  const rows = videos.map((v, i) => {
            const sub = [
              `@${v.handle}`,
              v.brand,
              v.views != null && v.views > 0 ? `${v.views.toLocaleString()} views` : '',
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <a
                key={`${v.url}-${i}`}
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/60"
              >
                <span className="w-4 text-right text-xs font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                <VideoThumbnail url={v.url} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground transition-colors group-hover:text-[var(--primary)]">
                    {v.title || `@${v.handle}`}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{sub}</span>
                </span>
                <span className="text-sm font-bold tabular-nums text-foreground">{formatCurrency(v.gmv)}</span>
              </a>
            );
          });
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle eyebrow>Top Videos · {label}</CardTitle>
        <Link href={brand ? `/posts?brand=${encodeURIComponent(brand)}` : "/posts"} className="text-xs font-semibold text-[var(--primary)] hover:underline">
          View all →
        </Link>
      </CardHeader>

      {failed ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          Couldn&apos;t load videos — this is an error on our side, not an empty period.
        </div>
      ) : videos.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">No managed videos in this period.</div>
      ) : (
        <div className="divide-y divide-border">
          {rows.slice(0,5)}
          {rows.length > 5 && <details><summary className="cursor-pointer px-5 py-3 text-xs font-medium text-primary">Show {rows.length - 5} more</summary><div className="divide-y divide-border">{rows.slice(5)}</div></details>}
        </div>
      )}
    </Card>
  );
}
