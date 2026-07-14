'use client';

/**
 * Card layout for a single post on the Posts page. Used by the card-view
 * mode (default) — table-view falls back to the existing row component.
 *
 * Why cards: the Posts page is a creative-review surface as much as an
 * analytical one (review videos, leave notes, judge brand fit). Cards
 * give the title room to breathe and reserve space for a thumbnail
 * preview. The thumbnail slot reads from `thumbnail_url`; until that
 * column is populated by the backfill, we render a brand-gradient
 * placeholder with the title overlaid so the layout still feels
 * intentional.
 */
import { ExternalLink, Eye, Heart, MessageCircle, MessageSquare, Star, AlertTriangle, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { formatCurrency, formatNumber } from '@/lib/utils/format';

export interface PostCardData {
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
  // Optional — falls back to brand-gradient placeholder when null/empty.
  // Wired up in a follow-up PR once migration 039 (thumbnail_url) lands
  // and the backfill script runs.
  thumbnail_url?: string | null;
}

interface Props {
  post: PostCardData;
  onClick: (post: PostCardData) => void;
}

export function PostCard({ post: p, onClick }: Props) {
  const brandMeta = useBrandMeta();
  const brandColor = brandMeta.color(p.brand_slug);
  const hasThumb = !!p.thumbnail_url;

  return (
    <button
      onClick={() => onClick(p)}
      className="group text-left flex flex-col rounded-2xl bg-card border border-border shadow-sm hover:shadow-md hover:border-border transition-all overflow-hidden"
    >
      {/* Thumbnail slot — 16:9 to match TikTok's portrait-cover ratio.
          When thumbnail_url is empty, we paint a brand-tinted gradient
          and overlay the title so the card still reads. */}
      <div
        className="relative aspect-video w-full overflow-hidden"
        style={!hasThumb ? {
          background: `linear-gradient(135deg, ${brandColor}33 0%, ${brandColor}88 100%)`,
        } : undefined}
      >
        {hasThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.thumbnail_url!}
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
              className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50/95 backdrop-blur-sm ring-1 ring-amber-200 rounded-full px-2 py-0.5"
              title="Flagged: off-brand or needs rework"
            >
              <AlertTriangle className="h-3 w-3" />
              Flagged
            </span>
          )}
          {p.has_my_review && (
            <span
              className="inline-flex items-center text-[10px] font-bold text-[#E91E8C] bg-primary/10/95 backdrop-blur-sm ring-1 ring-primary/15 rounded-full px-2 py-0.5"
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
          {p.is_managed && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 rounded px-1 py-0.5">
              Managed
            </span>
          )}
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

        {/* Title — only show when we have a real thumbnail above. When
            we're using the gradient placeholder, the title is already
            overlaid so we don't need to repeat it. */}
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
                    ? 'text-amber-400 fill-amber-400'
                    : 'text-muted-foreground',
                )}
              />
            ))}
            <span className="text-[10px] text-muted-foreground ml-1 tabular-nums">{p.avg_rating.toFixed(1)}</span>
          </div>
        )}

        {/* KPI strip */}
        <div className="mt-auto pt-2 border-t border-border grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
          <div className="inline-flex items-center gap-1" title={`${p.views.toLocaleString()} views`}>
            <Eye className="h-3 w-3 text-muted-foreground" />
            <span className="tabular-nums">{formatNumber(p.views)}</span>
          </div>
          <div className="inline-flex items-center gap-1" title={`${p.likes.toLocaleString()} likes`}>
            <Heart className="h-3 w-3 text-primary" />
            <span className="tabular-nums">{formatNumber(p.likes)}</span>
          </div>
          <div className="inline-flex items-center gap-1" title={`${p.comments.toLocaleString()} comments`}>
            <MessageCircle className="h-3 w-3 text-blue-400" />
            <span className="tabular-nums">{formatNumber(p.comments)}</span>
          </div>
        </div>

        {/* Engagement + GMV — second line, accented */}
        <div className="flex items-center justify-between text-xs">
          <span
            className={cn(
              'font-semibold tabular-nums',
              p.engagement_rate >= 5 ? 'text-emerald-600' : p.engagement_rate >= 2 ? 'text-amber-600' : 'text-muted-foreground',
            )}
            title="Engagement rate"
          >
            {p.engagement_rate.toFixed(2)}% eng
          </span>
          <span className="font-bold tabular-nums text-[#E91E8C]" title={`$${p.gmv.toLocaleString()} GMV`}>
            {formatCurrency(p.gmv)}
          </span>
        </div>
      </div>
    </button>
  );
}
