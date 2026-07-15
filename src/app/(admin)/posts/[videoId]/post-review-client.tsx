'use client';

/**
 * Per-video review page — every team member can leave one review per video.
 *
 * Layout:
 *   - Header: back link + title + brand pill + creator
 *   - KPI strip: views · likes · comments · engagement · GMV · orders
 *   - "Watch on TikTok" button if video_url present
 *   - YOUR review (form: rating 1-5, tags, notes) — upserts on save
 *   - OTHER reviews (read-only list)
 *
 * Reviews are stored in the `video_reviews` table — UNIQUE on
 * (video_id, brand, reviewer_user_id). Saving creates or updates your
 * one review. Deleting removes only your own.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, ExternalLink, Eye, Heart, Loader2, MessageCircle,
  Save, Star, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { engagementRate, formatCurrency, formatNumber } from '@/lib/utils/format';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface VideoMeta {
  video_id: string;
  brand_slug: string;
  brand_name: string;
  creator_handle: string;
  title: string;
  video_url: string | null;
  post_date: string | null;
  views: number;
  likes: number;
  comments: number;
  gmv: number;
  orders: number;
  items_sold: number;
}

interface ReviewRow {
  id: string;
  reviewer_user_id: string;
  reviewer_name: string | null;
  rating: number | null;
  notes: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

const TAG_PRESETS = ['🔥 banger', '✏️ needs rework', '📣 shoutout', '⚠️ off-brand', '💡 inspo'];

export function PostReviewClient({ meta }: { meta: VideoMeta }) {
  const brandMeta = useBrandMeta();
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Local form state for YOUR review
  const [draftRating, setDraftRating] = useState<number | null>(null);
  const [draftNotes, setDraftNotes] = useState('');
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${encodeURIComponent(meta.video_id)}/reviews?brand=${encodeURIComponent(meta.brand_slug)}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setReviews(j.reviews ?? []);
      setCurrentUserId(j.currentUserId ?? null);
      // Hydrate the form from your existing review (if any)
      const mine = (j.reviews as ReviewRow[]).find(r => r.reviewer_user_id === j.currentUserId);
      if (mine) {
        setDraftRating(mine.rating);
        setDraftNotes(mine.notes ?? '');
        setDraftTags(mine.tags ?? []);
      } else {
        setDraftRating(null);
        setDraftNotes('');
        setDraftTags([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }, [meta.video_id, meta.brand_slug]);

  useEffect(() => { refresh(); }, [refresh]);

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
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function deleteReview() {
    if (!confirm('Delete your review?')) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${encodeURIComponent(meta.video_id)}/reviews?brand=${encodeURIComponent(meta.brand_slug)}`, {
        method: 'DELETE',
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  function toggleTag(tag: string) {
    setDraftTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  const myReview = reviews.find(r => r.reviewer_user_id === currentUserId);
  const otherReviews = reviews.filter(r => r.reviewer_user_id !== currentUserId);
  const engagement = engagementRate(meta.views, meta.likes, meta.comments);
  const brandColor = brandMeta.color(meta.brand_slug);

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
          <h1 className="text-xl font-bold text-[var(--foreground)] leading-snug">{meta.title}</h1>
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

      {/* KPI strip */}
      <Card className="p-5">
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
          <Kpi icon={<Eye className="h-3.5 w-3.5" />}            label="Views"      value={formatNumber(meta.views)} />
          <Kpi icon={<Heart className="h-3.5 w-3.5" />}          label="Likes"      value={formatNumber(meta.likes)}     accent="pink" />
          <Kpi icon={<MessageCircle className="h-3.5 w-3.5" />}  label="Comments"   value={formatNumber(meta.comments)}  accent="blue" />
          <Kpi label="Engagement" value={`${engagement.toFixed(2)}%`} accent={engagement >= 5 ? 'green' : engagement >= 2 ? 'amber' : 'gray'} />
          <Kpi label="GMV"        value={formatCurrency(meta.gmv)} accent="pink" />
          <Kpi label="Orders"     value={formatNumber(meta.orders)} />
        </div>
      </Card>

      {error && (
        <div className="rounded-xl bg-[var(--pulse-neg-bg)] border border-[var(--pulse-neg)]/25 px-4 py-3 text-sm text-[var(--pulse-neg)]">{error}</div>
      )}

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
              onClick={deleteReview}
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
            <Label>Rating</Label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setDraftRating(n === draftRating ? null : n)}
                  className={cn(
                    'p-1 transition-transform hover:scale-110',
                    draftRating !== null && n <= draftRating ? 'text-amber-400' : 'text-muted-foreground',
                  )}
                  title={`${n} star${n > 1 ? 's' : ''}`}
                >
                  <Star className={cn('h-6 w-6', draftRating !== null && n <= draftRating && 'fill-amber-400')} />
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

          {/* Tags */}
          <div>
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-2">
              {TAG_PRESETS.map(tag => {
                const active = draftTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                      active
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-muted text-muted-foreground hover:bg-secondary',
                    )}
                  >
                    {tag}
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
        {loading && reviews.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…
          </div>
        ) : otherReviews.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">No reviews from other team members yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {otherReviews.map(r => <OtherReviewRow key={r.id} review={r} />)}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ── Smaller pieces ─────────────────────────────────────────────────

function Kpi({
  label, value, icon, accent = 'gray',
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  accent?: 'pink' | 'blue' | 'green' | 'amber' | 'gray';
}) {
  const colorMap = {
    pink:  'text-[var(--primary)]',
    blue:  'text-blue-600',
    green: 'text-emerald-600',
    amber: 'text-amber-600',
    gray:  'text-[var(--foreground)]',
  } as const;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
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
                <Star key={n} className={cn('h-3 w-3', n <= (review.rating ?? 0) ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground')} />
              ))}
            </div>
          )}
          {review.tags && review.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {review.tags.map(t => (
                <Badge key={t} variant="neutral" size="sm">{t}</Badge>
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
