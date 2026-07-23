'use client';

/**
 * Card layout for a single post on the Posts page. Used by the card-view
 * mode (default) — table-view falls back to the existing row component.
 *
 * Why cards: the Posts page is a creative-review surface as much as an
 * analytical one (review videos, leave notes, judge brand fit). Cards lead
 * with the REAL TikTok cover image, resolved client-side via the public
 * oEmbed endpoint (useTikTokThumbnail — the same hook behind the creator
 * portal's video surfaces). The fetch is gated on useInView so a 300-card
 * grid only resolves covers the user actually scrolls near; while loading
 * (or when TikTok has deleted the video) the brand-gradient placeholder
 * keeps the card intentional.
 *
 * Engagement values are nullable — null means "no engagement data in this
 * window" (uploads predating the mig-088 ingest) and renders as an em dash
 * placeholder, never a fake 0.
 */
import { ExternalLink, Eye, Heart, MessageCircle, MessageSquare, Star, AlertTriangle, PlayCircle, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { useTikTokThumbnail } from '@/hooks/use-tiktok-thumbnail';
import { useInView } from '@/hooks/use-in-view';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { Badge } from '@/components/ui/badge';

export interface PostCardData {
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

interface Props {
  post: PostCardData;
  onClick: (post: PostCardData) => void;
}

const fmtN = (n: number | null) => (n === null ? '—' : formatNumber(n));

export function PostCard({ post: p, onClick }: Props) {
  const brandMeta = useBrandMeta();
  const brandColor = brandMeta.color(p.brand_slug);
  // Lazy cover: only ask oEmbed once the card nears the viewport.
  const { ref, inView } = useInView<HTMLButtonElement>('400px');
  const { thumbnail } = useTikTokThumbnail(inView ? p.video_url : null);
  const hasThumb = !!thumbnail;

  return (
    <button
      ref={ref}
      onClick={() => onClick(p)}
      className="group text-left flex flex-col rounded-2xl bg-card border border-border shadow-sm hover:shadow-md hover:border-border transition-all overflow-hidden"
    >
      {/* Cover slot — 16:9 crop of TikTok's portrait cover. While the oEmbed
          resolves (or when the video is deleted/private) we paint a
          brand-tinted gradient with the title overlaid so the card still
          reads. */}
      <div
        className="relative aspect-video w-full overflow-hidden"
        style={!hasThumb ? {
          background: `linear-gradient(135deg, ${brandColor}33 0%, ${brandColor}88 100%)`,
        } : undefined}
      >
        {hasThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnail!}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-end p-4">
            <div className="text-white/90 text-sm font-semibold line-clamp-3 drop-shadow">{p.video_title}</div>
          </div>
        )}

        {/* Top-left: external TikTok link (stops propagation so click
            doesn't trigger card navigation). */}
        {p.video_url && (
          <a
            href={p.video_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] font-semibold text-white bg-black/50 backdrop-blur-sm hover:bg-black/70 rounded-full px-2 py-1 transition-colors"
            title="Open on TikTok"
            aria-label="Open on TikTok"
          >
            <ExternalLink className="h-3 w-3" />
            TikTok
          </a>
        )}

        {/* Top-right: review status chips. Stack vertically on narrow
            cards so they don't crowd the thumbnail. */}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          {p.flagged && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--pulse-warn)] bg-[var(--pulse-warn-bg)] backdrop-blur-sm ring-1 ring-[var(--pulse-warn)]/30 rounded-full px-2 py-0.5"
              title="Flagged: off-brand or needs rework"
            >
              <AlertTriangle className="h-3 w-3" />
              Flagged
            </span>
          )}
          {p.has_my_review && (
            <span
              className="inline-flex items-center text-[10px] font-bold text-[var(--primary)] bg-primary/10 backdrop-blur-sm ring-1 ring-primary/15 rounded-full px-2 py-0.5"
              title="You reviewed this"
            >
              YOU
            </span>
          )}
          {p.review_count > 0 && !p.has_my_review && !p.flagged && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-foreground bg-card/95 backdrop-blur-sm ring-1 ring-border rounded-full px-2 py-0.5"
              title={`${p.review_count} review${p.review_count > 1 ? 's' : ''}`}
            >
              <MessageSquare className="h-3 w-3" />
              {p.review_count}
            </span>
          )}
        </div>

        {/* Play indicator overlay on hover — visual affordance that the
            card is clickable / leads to the review page. */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
          <PlayCircle className="h-10 w-10 text-white drop-shadow" />
        </div>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        {/* Meta row: creator · brand · date */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
          <span className="font-semibold text-[var(--foreground)]">@{p.creator_handle}</span>
          {p.is_managed && <Badge variant="positive" size="sm">Managed</Badge>}
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: brandColor }} />
            {p.brand_name}
          </span>
          {p.post_date && (
            <>
              <span aria-hidden="true">·</span>
              <span className="whitespace-nowrap">
                {new Date(p.post_date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' })}
              </span>
            </>
          )}
        </div>

        {/* Title — only when the real cover is above (the placeholder
            already overlays the title). */}
        {hasThumb && (
          <h3 className="text-sm font-semibold text-[var(--foreground)] leading-snug line-clamp-2" title={p.video_title}>
            {p.video_title}
          </h3>
        )}

        {/* Avg rating bar — only when reviews exist */}
        {p.avg_rating !== null && (
          <div className="inline-flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map(n => (
              <Star
                key={n}
                aria-hidden="true"
                className={cn(
                  'h-3 w-3',
                  n <= Math.round(p.avg_rating!)
                    ? 'text-[var(--pulse-warn)] fill-[var(--pulse-warn)]'
                    : 'text-muted-foreground',
                )}
              />
            ))}
            <span className="text-[10px] text-muted-foreground ml-1 tabular-nums">{p.avg_rating.toFixed(1)}</span>
          </div>
        )}

        {/* KPI strip — null engagement renders as an em dash placeholder */}
        <div className="mt-auto pt-2 border-t border-border grid grid-cols-4 gap-2 text-[11px] text-muted-foreground">
          <div className="inline-flex items-center gap-1" title={p.views === null ? 'No view data in this window' : `${p.views.toLocaleString()} views`}>
            <Eye className="h-3 w-3 text-muted-foreground" />
            <span className="tabular-nums">{fmtN(p.views)}</span>
          </div>
          <div className="inline-flex items-center gap-1" title={p.likes === null ? 'No like data in this window' : `${p.likes.toLocaleString()} likes`}>
            <Heart className="h-3 w-3 text-primary" />
            <span className="tabular-nums">{fmtN(p.likes)}</span>
          </div>
          <div className="inline-flex items-center gap-1" title={p.comments === null ? 'No comment data in this window' : `${p.comments.toLocaleString()} comments`}>
            <MessageCircle className="h-3 w-3 text-muted-foreground" />
            <span className="tabular-nums">{fmtN(p.comments)}</span>
          </div>
          <div className="inline-flex items-center gap-1" title={p.shares === null ? 'No share data in this window' : `${p.shares.toLocaleString()} shares`}>
            <Share2 className="h-3 w-3 text-muted-foreground" />
            <span className="tabular-nums">{fmtN(p.shares)}</span>
          </div>
        </div>

        {/* Engagement + GMV — second line, accented */}
        <div className="flex items-center justify-between text-xs">
          <span
            className={cn(
              'font-semibold tabular-nums',
              p.engagement_rate === null
                ? 'text-muted-foreground'
                : p.engagement_rate >= 5
                  ? 'text-[var(--pulse-pos)]'
                  : p.engagement_rate >= 2
                    ? 'text-[var(--pulse-warn)]'
                    : 'text-muted-foreground',
            )}
            title="Engagement rate"
          >
            {p.engagement_rate === null ? '— eng' : `${p.engagement_rate.toFixed(2)}% eng`}
          </span>
          <span className="font-bold tabular-nums text-[var(--primary)]" title={`$${p.gmv.toLocaleString()} GMV`}>
            {formatCurrency(p.gmv)}
          </span>
        </div>
      </div>
    </button>
  );
}
