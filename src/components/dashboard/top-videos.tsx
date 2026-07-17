import Link from 'next/link';
import { Play } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

export interface TopVideoRow {
  title: string;
  url: string;
  handle: string;
  brand: string;
  gmv: number;
  views: number;
}

/**
 * Top managed videos by GMV for the period (get_managed_posts, deduped by the
 * real videos.video_id). No thumbnail is available from the RPC, so each row
 * uses a play tile and links out to the TikTok video.
 *
 * `failed` is separate from an empty list on purpose. "No managed videos in this
 * period" is a CLAIM about your data; if the query died we haven't earned it.
 * This card spent weeks asserting it on any window over ~a week, because
 * get_managed_posts was timing out and the page read only `.data`.
 */
export function TopVideos({ videos, label, failed = false }: { videos: TopVideoRow[]; label: string; failed?: boolean }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle eyebrow>Top Videos · {label}</CardTitle>
        <Link href="/posts" className="text-xs font-semibold text-[var(--primary)] hover:underline">
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
          {videos.map((v, i) => {
            const sub = [`@${v.handle}`, v.brand, v.views > 0 ? `${formatNumber(v.views)} views` : null]
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
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition-colors group-hover:text-[var(--primary)]">
                  <Play className="h-3.5 w-3.5 fill-current" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground transition-colors group-hover:text-[var(--primary)]">
                    {v.title || `@${v.handle}`}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{sub}</span>
                </span>
                <span className="text-sm font-bold tabular-nums text-foreground">{formatCurrency(v.gmv)}</span>
              </a>
            );
          })}
        </div>
      )}
    </Card>
  );
}
