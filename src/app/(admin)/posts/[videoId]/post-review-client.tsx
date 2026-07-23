'use client';

/**
 * Per-video review page — every team member can leave one review per video.
 *
 * Layout:
 *   - Header: back link + brand/creator/date + title + Watch on TikTok
 *   - Left rail: the real TikTok cover (oEmbed via useTikTokThumbnail),
 *     portrait crop, click-through to the video
 *   - Right: money strip (windowed tie-out + lifetime) + engagement strip
 *     (tracked days, nullable → "—") + daily GMV/views trend sparklines
 *   - YOUR review (form: rating 1-5, tags, notes) — upserts on save
 *   - OTHER reviews (read-only list)
 *
 * Reviews are stored in the `video_reviews` table — UNIQUE on
 * (video_id, brand, reviewer_user_id). Tags are stored as stable SLUGS
 * (see lib/data/review-tags) and rendered as labels. The initial review list
 * is server-rendered (no loading flash); mutations refetch.
 */
import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, ExternalLink, Loader2, PlayCircle, Save, Star, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { useTikTokThumbnail } from '@/hooks/use-tiktok-thumbnail';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { REVIEW_TAGS, reviewTagLabel } from '@/lib/data/review-tags';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { Sparkline } from '@/components/charts/sparkline';

export interface DailyPoint {
  d: string;                  // YYYY-MM-DD
  gmv: number;
  views: number | null;
}

export interface VideoMeta {
  video_id: string;
  brand_slug: string;
  brand_name: string;
  creator_handle: string;
  title: string;
  video_url: string | null;
  post_date: string | null;
  /** null = the stats RPC failed — render "—", never $0. */
  stats: {
    gmv: number;              // lifetime, windowed-source (video_performance)
    orders: number;
    items_sold: number;
    views: number | null;     // summed over tracked days; null = never carried
    likes: number | null;
    comments: number | null;
    shares: number | null;
    first_earn_date: string | null;
    last_earn_date: string | null;
    days_active: number;
  } | null;
  daily: DailyPoint[];
  /** The /posts window this page was opened from, for the tie-out figure. */
  window: { start: string; end: string; gmv: number } | null;
}

export interface ReviewRow {
  id: string;
  reviewer_user_id: string;
  reviewer_name: string | null;
  rating: number | null;
  notes: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

const fmtN = (n: number | null | undefined) => (n === null || n === undefined ? '—' : formatNumber(n));

function fmtShortDate(iso: string): string {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function PostReviewClient({
  meta, initialReviews, currentUserId,
}: {
  meta: VideoMeta;
  initialReviews: ReviewRow[];
  currentUserId: string;
}) {
  const brandMeta = useBrandMeta();
  const [reviews, setReviews] = useState<ReviewRow[]>(initialReviews);
  const [error, setError] = useState<string | null>(null);

  const myInitial = initialReviews.find(r => r.reviewer_user_id === currentUserId);

  // Local form state for YOUR review — hydrated from the SSR'd list.
  const [draftRating, setDraftRating] = useState<number | null>(myInitial?.rating ?? null);
  const [draftNotes, setDraftNotes] = useState(myInitial?.notes ?? '');
  const [draftTags, setDraftTags] = useState<string[]>(myInitial?.tags ?? []);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function refresh() {
    setError(null);
    try {
      const res = await fetch(`/api/posts/${encodeURIComponent(meta.video_id)}/reviews?brand=${encodeURIComponent(meta.brand_slug)}`);
      // res.ok first; parse defensively so an HTML error body can't throw a
      // raw SyntaxError into the banner.
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      const next: ReviewRow[] = j?.reviews ?? [];
      setReviews(next);
      const mine = next.find(r => r.reviewer_user_id === currentUserId);
      setDraftRating(mine?.rating ?? null);
      setDraftNotes(mine?.notes ?? '');
      setDraftTags(mine?.tags ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reviews');
    }
  }

  async function saveReview() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${encodeURIComponent(meta.video_id)}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: meta.brand_slug,
          rating: draftRating,
          notes: draftNotes || null,
          tags: draftTags,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function deleteReview() {
    setConfirmingDelete(false);
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${encodeURIComponent(meta.video_id)}/reviews?brand=${encodeURIComponent(meta.brand_slug)}`, {
        method: 'DELETE',
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  function toggleTag(slug: string) {
    setDraftTags(prev => prev.includes(slug) ? prev.filter(t => t !== slug) : [...prev, slug]);
  }

  const myReview = reviews.find(r => r.reviewer_user_id === currentUserId);
  const otherReviews = reviews.filter(r => r.reviewer_user_id !== currentUserId);
  const brandColor = brandMeta.color(meta.brand_slug);

  const s = meta.stats;
  const engagement = s && s.views !== null && s.views > 0
    ? (((s.likes ?? 0) + (s.comments ?? 0)) / s.views) * 100
    : null;

  const gmvSeries = meta.daily.map(p => p.gmv);
  const dayLabels = meta.daily.map(p => p.d);
  const viewsSeries = meta.daily.map(p => p.views ?? NaN); // Sparkline drops non-finite points
  const hasViewsSeries = meta.daily.some(p => p.views !== null && p.views > 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/posts" className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground mt-1">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: brandColor }} />
              {meta.brand_name}
            </span>
            <span>·</span>
            <span>@{meta.creator_handle}</span>
            {meta.post_date && (
              <>
                <span>·</span>
                <span>posted {new Date(meta.post_date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' })}</span>
              </>
            )}
          </div>
          <h1 className="text-2xl font-extrabold text-[var(--foreground)] leading-snug">{meta.title}</h1>
        </div>
        {meta.video_url && (
          <a
            href={meta.video_url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'shrink-0')}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Watch on TikTok
          </a>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-[var(--pulse-neg-bg)] border border-[var(--pulse-neg)]/25 px-4 py-3 text-sm text-[var(--pulse-neg)]">{error}</div>
      )}
      {!s && (
        <div className="rounded-xl bg-[var(--pulse-warn-bg)] border border-[var(--pulse-warn)]/25 px-4 py-3 text-sm text-[var(--pulse-warn)]">
          Performance stats couldn&apos;t be loaded. The figures below show a placeholder; refresh to retry.
        </div>
      )}

      {/* Cover + stats */}
      <div className="grid gap-5 lg:grid-cols-[240px_1fr] items-start">
        <CoverTile videoUrl={meta.video_url} title={meta.title} brandColor={brandColor} />

        <div className="space-y-5 min-w-0">
          <Card className="p-5">
            {/* Money row */}
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-3">Revenue</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {meta.window && (
                <Kpi
                  label={`GMV · ${fmtShortDate(meta.window.start)} to ${fmtShortDate(meta.window.end)}`}
                  value={s ? formatCurrency(meta.window.gmv) : '—'}
                  accent="primary"
                  info="Earned in the period selected on the Posts page: the figure on the row you clicked."
                />
              )}
              <Kpi
                label="Lifetime GMV"
                value={s ? formatCurrency(s.gmv) : '—'}
                accent={meta.window ? 'plain' : 'primary'}
                info={s?.first_earn_date && s.last_earn_date
                  ? `All tracked earnings: ${s.days_active} active day${s.days_active === 1 ? '' : 's'} between ${fmtShortDate(s.first_earn_date)} and ${fmtShortDate(s.last_earn_date)}.`
                  : 'All tracked earnings for this video.'}
              />
              <Kpi label="Orders" value={s ? formatNumber(s.orders) : '—'} />
              <Kpi label="Items sold" value={s ? formatNumber(s.items_sold) : '—'} />
            </div>

            {/* Engagement row — tracked days only, honest nulls */}
            <div className="mt-5 pt-4 border-t border-border">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-3 inline-flex items-center gap-1">
                Engagement · tracked days
                <InfoTooltip label="Summed from the daily Video Data uploads. Days uploaded before engagement tracking carry no data; a placeholder means no data, not zero." />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <Kpi label="Views"    value={s ? fmtN(s.views) : '—'} />
                <Kpi label="Likes"    value={s ? fmtN(s.likes) : '—'} accent="primary" />
                <Kpi label="Comments" value={s ? fmtN(s.comments) : '—'} />
                <Kpi label="Shares"   value={s ? fmtN(s.shares) : '—'} />
                <Kpi
                  label="Engagement"
                  value={engagement === null ? '—' : `${engagement.toFixed(2)}%`}
                  accent={engagement === null ? 'plain' : engagement >= 5 ? 'pos' : engagement >= 2 ? 'warn' : 'plain'}
                />
              </div>
            </div>
          </Card>

          {/* Daily trend — did it spike and die, or is it compounding? */}
          {gmvSeries.length > 1 && (
            <Card className="p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-3">
                Daily trend · {meta.daily.length} tracked days
              </div>
              <div className="flex flex-wrap gap-8">
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1">GMV / day</div>
                  <Sparkline
                    data={gmvSeries}
                    days={dayLabels}
                    width={280}
                    height={48}
                    format={(v) => formatCurrency(v)}
                  />
                </div>
                {hasViewsSeries && (
                  <div>
                    <div className="text-[11px] text-muted-foreground mb-1">Views / day</div>
                    <Sparkline
                      data={viewsSeries}
                      days={dayLabels}
                      width={280}
                      height={48}
                      color="var(--pulse-accent-2)"
                      format={(v) => formatNumber(Math.round(v))}
                    />
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* YOUR review (form) */}
      <Card>
        <CardHeader className="border-b border-border">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Your review</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              {myReview
                ? `Last edited ${new Date(myReview.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                : 'You haven\'t reviewed this yet'}
            </div>
          </div>
          {myReview && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingDelete(true)}
              disabled={deleting}
              className="text-muted-foreground hover:text-[var(--pulse-neg)]"
            >
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Delete
            </Button>
          )}
        </CardHeader>

        <CardContent className="space-y-4 pt-5">
          {/* Rating */}
          <div>
            <Label id={`rating-label-${meta.video_id}`}>Rating</Label>
            <div className="flex items-center gap-1" role="radiogroup" aria-labelledby={`rating-label-${meta.video_id}`}>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  role="radio"
                  aria-checked={draftRating === n}
                  aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  onClick={() => setDraftRating(n === draftRating ? null : n)}
                  className={cn(
                    'p-1 transition-transform hover:scale-110',
                    draftRating !== null && n <= draftRating ? 'text-[var(--pulse-warn)]' : 'text-muted-foreground',
                  )}
                  title={`${n} star${n > 1 ? 's' : ''}`}
                >
                  <Star className={cn('h-6 w-6', draftRating !== null && n <= draftRating && 'fill-[var(--pulse-warn)]')} />
                </button>
              ))}
              {draftRating !== null && (
                <button
                  onClick={() => setDraftRating(null)}
                  className="ml-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  clear
                </button>
              )}
            </div>
          </div>

          {/* Tags — stored as slugs, rendered as labels */}
          <div>
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-2">
              {REVIEW_TAGS.map(tag => {
                const active = draftTags.includes(tag.slug);
                return (
                  <button
                    key={tag.slug}
                    onClick={() => toggleTag(tag.slug)}
                    aria-pressed={active}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                      active
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-muted text-muted-foreground hover:bg-secondary',
                    )}
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label>Notes</Label>
            <Textarea
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="What worked, what didn't, what would you tell the creator about their next post..."
              className="min-h-[100px]"
            />
            <div className="text-[11px] text-muted-foreground mt-1 text-right">{draftNotes.length} / 4000</div>
          </div>

          <div className="flex items-center justify-end pt-1">
            <Button
              onClick={saveReview}
              disabled={saving || (draftRating === null && !draftNotes.trim() && draftTags.length === 0)}
            >
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : <><Save className="h-4 w-4" />{myReview ? 'Update review' : 'Save review'}</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* OTHER reviews */}
      <Card>
        <CardHeader className="border-b border-border">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            Team reviews · {otherReviews.length}
          </div>
        </CardHeader>
        {otherReviews.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">No reviews from other team members yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {otherReviews.map(r => <OtherReviewRow key={r.id} review={r} />)}
          </ul>
        )}
      </Card>

      {/* Delete confirm — themed modal, not window.confirm. ModalOverlay's
          contract: the consumer supplies the centering wrapper, backdrop, and
          stopPropagation on the panel (same shape as the reporting
          ConfirmDeleteModal). */}
      {confirmingDelete && (
        <ModalOverlay onClose={() => setConfirmingDelete(false)}>
          <div className="absolute inset-0 flex items-center justify-center p-4" onClick={() => setConfirmingDelete(false)}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
            <div
              className="relative w-full max-w-sm rounded-2xl bg-card border border-border shadow-[var(--pulse-elev-2)] p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-sm font-bold text-[var(--foreground)]">Delete your review?</div>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Your rating, tags, and notes for this post will be removed. Other team members&apos; reviews are not affected.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
                <Button variant="danger" size="sm" onClick={deleteReview}>Delete review</Button>
              </div>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// ── Smaller pieces ─────────────────────────────────────────────────

/** Portrait TikTok cover with click-through; brand-gradient fallback. */
function CoverTile({ videoUrl, title, brandColor }: { videoUrl: string | null; title: string; brandColor: string }) {
  const { thumbnail } = useTikTokThumbnail(videoUrl);
  const inner = (
    <div
      className="group relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-border shadow-[var(--pulse-elev-1)]"
      style={!thumbnail ? { background: `linear-gradient(135deg, ${brandColor}33 0%, ${brandColor}88 100%)` } : undefined}
    >
      {thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnail} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" />
      ) : (
        <div className="absolute inset-0 flex items-end p-4">
          <div className="text-white/90 text-sm font-semibold line-clamp-4 drop-shadow">{title}</div>
        </div>
      )}
      {videoUrl && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/25">
          <PlayCircle className="h-12 w-12 text-white drop-shadow" />
        </div>
      )}
    </div>
  );
  if (!videoUrl) return inner;
  return (
    <a href={videoUrl} target="_blank" rel="noopener noreferrer" aria-label="Watch on TikTok" className="block">
      {inner}
    </a>
  );
}

function Kpi({
  label, value, info, accent = 'plain',
}: {
  label: string;
  value: string;
  info?: string;
  accent?: 'primary' | 'pos' | 'warn' | 'plain';
}) {
  const colorMap = {
    primary: 'text-[var(--primary)]',
    pos:     'text-[var(--pulse-pos)]',
    warn:    'text-[var(--pulse-warn)]',
    plain:   'text-[var(--foreground)]',
  } as const;
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <span className="truncate">{label}</span>
        {info && <InfoTooltip label={info} />}
      </div>
      <div className={cn('text-xl font-extrabold tabular-nums mt-1', colorMap[accent])}>{value}</div>
    </div>
  );
}

function OtherReviewRow({ review }: { review: ReviewRow }) {
  return (
    <li className="px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
          {(review.reviewer_name ?? '?').slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm font-semibold text-[var(--foreground)]">{review.reviewer_name ?? 'Unknown'}</div>
            <div className="text-[11px] text-muted-foreground">
              {new Date(review.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </div>
          {review.rating !== null && (
            <div className="flex items-center gap-0.5 mt-1">
              {[1, 2, 3, 4, 5].map(n => (
                <Star key={n} className={cn('h-3 w-3', n <= (review.rating ?? 0) ? 'text-[var(--pulse-warn)] fill-[var(--pulse-warn)]' : 'text-muted-foreground')} />
              ))}
            </div>
          )}
          {review.tags && review.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {review.tags.map(t => (
                <Badge key={t} variant="neutral" size="sm">{reviewTagLabel(t)}</Badge>
              ))}
            </div>
          )}
          {review.notes && (
            <p className="text-sm text-foreground mt-2 whitespace-pre-wrap leading-relaxed">{review.notes}</p>
          )}
        </div>
      </div>
    </li>
  );
}
