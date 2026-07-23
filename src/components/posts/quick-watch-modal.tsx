'use client';

/**
 * Quick-watch — the in-platform player modal for /posts.
 *
 * Click a row's cover and the video plays INSIDE Tempo (official TikTok
 * embed) beside its stats; "Next post" steps through the caller's current
 * filtered + sorted list so the team can watch straight down the Unreviewed
 * queue without touching the table. "Open review" goes to the full review
 * page with the window carried through.
 */
import Link from 'next/link';
import { ExternalLink, X } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { Button, buttonVariants } from '@/components/ui/button';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { TikTokPlayer } from '@/components/posts/tiktok-player';
import { cn } from '@/lib/utils';

export interface QuickWatchPost {
  video_id: string;
  video_title: string;
  video_url: string | null;
  creator_handle: string;
  brand_slug: string;
  brand_name: string;
  post_date: string | null;
  views: number | null;
  likes: number | null;
  shares: number | null;
  gmv: number;
}

const fmtN = (n: number | null) => (n === null ? '—' : formatNumber(n));

export function QuickWatchModal({
  post, reviewHref, onClose, onNext,
}: {
  post: QuickWatchPost;
  /** Full review-page href with the window carried through. */
  reviewHref: string;
  onClose: () => void;
  /** Steps to the next post in the caller's current list; null on the last one. */
  onNext: (() => void) | null;
}) {
  const brandMeta = useBrandMeta();
  const brandColor = brandMeta.color(post.brand_slug);

  return (
    <ModalOverlay onClose={onClose}>
      <div className="absolute inset-0 flex items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
        <div
          className="relative grid w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--pulse-elev-2)] sm:grid-cols-[260px_1fr]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Player — keyed by video so Next swaps cleanly */}
          <div className="relative bg-black">
            <TikTokPlayer key={post.video_id} videoId={post.video_id} className="block h-full min-h-[420px] w-full border-0" />
          </div>

          {/* Details */}
          <div className="flex min-w-0 flex-col gap-2.5 p-5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-bold leading-snug text-[var(--foreground)] line-clamp-3">{post.video_title}</h3>
              <button
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-semibold text-[var(--foreground)]">@{post.creator_handle}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: brandColor }} />
                {post.brand_name}
              </span>
              {post.post_date && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{new Date(post.post_date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' })}</span>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
              <span><span className="font-bold text-foreground">{fmtN(post.views)}</span> views</span>
              <span><span className="font-bold text-foreground">{fmtN(post.likes)}</span> likes</span>
              <span><span className="font-bold text-foreground">{fmtN(post.shares)}</span> shares</span>
            </div>

            <div className="text-2xl font-extrabold tabular-nums text-[var(--primary)]">{formatCurrency(post.gmv)}</div>

            <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
              <Link href={reviewHref} className={buttonVariants({ variant: 'primary', size: 'sm' })}>
                Open review
              </Link>
              {onNext && (
                <Button variant="outline" size="sm" onClick={onNext}>
                  Next post
                </Button>
              )}
              {post.video_url && (
                <a
                  href={post.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open on TikTok"
                  aria-label="Open on TikTok"
                  className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-muted-foreground')}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
