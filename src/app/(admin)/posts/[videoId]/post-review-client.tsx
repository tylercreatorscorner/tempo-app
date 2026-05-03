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
  Save, Star, Trash2, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRAND_COLORS } from '@/lib/utils/constants';
import { formatCurrency, formatNumber } from '@/lib/utils/format';

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
  const engagement = meta.views > 0 ? ((meta.likes + meta.comments) / meta.views) * 100 : 0;
  const brandColor = BRAND_COLORS[meta.brand_slug] ?? '#6B7280';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/posts" className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 mt-1">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: brandColor }} />
              {meta.brand_name}
            </span>
            <span>·</span>
            <span>@{meta.creator_handle}</span>
            {meta.post_date && (
              <>
                <span>·</span>
                <span>posted {new Date(meta.post_date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </>
            )}
          </div>
          <h1 className="text-xl font-bold text-[#1A1B3A] leading-snug">{meta.title}</h1>
        </div>
        {meta.video_url && (
          <a
            href={meta.video_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1A1B3A] hover:bg-[#2a2b4a] text-white text-xs font-semibold transition-colors shrink-0"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Watch on TikTok
          </a>
        )}
      </div>

      {/* KPI strip */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
          <Kpi icon={<Eye className="h-3.5 w-3.5" />}            label="Views"      value={formatNumber(meta.views)} />
          <Kpi icon={<Heart className="h-3.5 w-3.5" />}          label="Likes"      value={formatNumber(meta.likes)}     accent="pink" />
          <Kpi icon={<MessageCircle className="h-3.5 w-3.5" />}  label="Comments"   value={formatNumber(meta.comments)}  accent="blue" />
          <Kpi label="Engagement" value={`${engagement.toFixed(2)}%`} accent={engagement >= 5 ? 'green' : engagement >= 2 ? 'amber' : 'gray'} />
          <Kpi label="GMV"        value={formatCurrency(meta.gmv)} accent="pink" />
          <Kpi label="Orders"     value={formatNumber(meta.orders)} />
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* YOUR review (form) */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">Your review</div>
            <div className="text-sm text-gray-600 mt-0.5">
              {myReview
                ? `Last edited ${new Date(myReview.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                : 'You haven\'t reviewed this yet'}
            </div>
          </div>
          {myReview && (
            <button
              onClick={deleteReview}
              disabled={deleting}
              className="text-xs text-gray-400 hover:text-red-600 transition-colors flex items-center gap-1 disabled:opacity-40"
            >
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Delete
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Rating */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Rating</label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setDraftRating(n === draftRating ? null : n)}
                  className={cn(
                    'p-1 transition-transform hover:scale-110',
                    draftRating !== null && n <= draftRating ? 'text-amber-400' : 'text-gray-300',
                  )}
                  title={`${n} star${n > 1 ? 's' : ''}`}
                >
                  <Star className={cn('h-6 w-6', draftRating !== null && n <= draftRating && 'fill-amber-400')} />
                </button>
              ))}
              {draftRating !== null && (
                <button
                  onClick={() => setDraftRating(null)}
                  className="ml-2 text-xs text-gray-400 hover:text-gray-600"
                >
                  clear
                </button>
              )}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Tags</label>
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
                        ? 'bg-[#E91E8C] text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
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
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Notes</label>
            <textarea
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="What worked, what didn't, what would you tell the creator about their next post..."
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E91E8C]/20 focus:border-[#E91E8C] resize-y min-h-[100px]"
            />
            <div className="text-[11px] text-gray-400 mt-1 text-right">{draftNotes.length} / 4000</div>
          </div>

          <div className="flex items-center justify-end pt-1">
            <button
              onClick={saveReview}
              disabled={saving || (draftRating === null && !draftNotes.trim() && draftTags.length === 0)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#E91E8C] hover:bg-[#d1177d] text-white text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : <><Save className="h-4 w-4" />{myReview ? 'Update review' : 'Save review'}</>}
            </button>
          </div>
        </div>
      </div>

      {/* OTHER reviews */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">
            Team reviews · {otherReviews.length}
          </div>
        </div>
        {loading && reviews.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…
          </div>
        ) : otherReviews.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">No reviews from other team members yet.</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {otherReviews.map(r => <OtherReviewRow key={r.id} review={r} />)}
          </ul>
        )}
      </div>
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
    pink:  'text-[#E91E8C]',
    blue:  'text-blue-600',
    green: 'text-emerald-600',
    amber: 'text-amber-600',
    gray:  'text-[#1A1B3A]',
  } as const;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
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
        <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
          {(review.reviewer_name ?? '?').slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm font-semibold text-[#1A1B3A]">{review.reviewer_name ?? 'Unknown'}</div>
            <div className="text-[11px] text-gray-400">
              {new Date(review.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </div>
          {review.rating !== null && (
            <div className="flex items-center gap-0.5 mt-1">
              {[1, 2, 3, 4, 5].map(n => (
                <Star key={n} className={cn('h-3 w-3', n <= (review.rating ?? 0) ? 'text-amber-400 fill-amber-400' : 'text-gray-200')} />
              ))}
            </div>
          )}
          {review.tags && review.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {review.tags.map(t => (
                <span key={t} className="px-2 py-0.5 rounded-full bg-gray-100 text-[11px] text-gray-600">{t}</span>
              ))}
            </div>
          )}
          {review.notes && (
            <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap leading-relaxed">{review.notes}</p>
          )}
        </div>
      </div>
    </li>
  );
}
