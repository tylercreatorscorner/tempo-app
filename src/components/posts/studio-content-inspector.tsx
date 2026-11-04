'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Dialog } from 'radix-ui';
import { Check, Copy, ExternalLink, Play, RefreshCw, X } from 'lucide-react';
import { postAgeDays, type ContentPost } from '@/lib/posts/studio-content';
import { VideoThumbnail } from '@/components/dashboard/video-thumbnail';
import { TikTokPlayer } from '@/components/posts/tiktok-player';
import { formatCurrency, formatNumber, resolveWatchUrl } from '@/lib/utils/format';
import styles from './studio-content-inspector.module.css';

type Review = {
  id: string;
  reviewer_name: string | null;
  notes: string | null;
  updated_at: string;
};
type ReviewState = { source: ContentPost; status: 'loading' | 'ready' | 'unavailable'; reviews: Review[] };
type ContextProps = { post: ContentPost; start: string; end: string; reviewHref: string };

function calendarDate(value: string): string {
  const stamp = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(stamp) ? new Date(stamp).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }) : 'Date unavailable';
}

function publicationLabel(post: ContentPost, end: string): string {
  if (!post.post_date) return 'Publication date unavailable';
  const elapsed = postAgeDays(post.post_date, end);
  if (elapsed === null) return 'Publication date unavailable';
  return `Published ${calendarDate(post.post_date)}${post.post_date <= end ? ` · ${elapsed} days old` : ' · after selected period'}`;
}

function creatorHref(post: ContentPost, start: string, end: string): string {
  const params = new URLSearchParams({ brand: post.brand_slug, range: 'custom', start, end });
  if (post.creator_id) return `/creators/${encodeURIComponent(post.creator_id)}?${params}`;
  params.set('creator', post.creator_handle.replace(/^@/, ''));
  return `/posts?${params}`;
}

function useCoachingReviews(post: ContentPost) {
  const [state, setState] = useState<ReviewState>({ source: post, status: 'loading', reviews: [] });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    const timeout = setTimeout(() => {
      if (!current) return;
      controller.abort();
      setState(previous => ({ ...previous, source: post, status: 'unavailable' }));
    }, 12_000);
    const params = new URLSearchParams({ brand: post.brand_slug });
    fetch(`/api/posts/${encodeURIComponent(post.video_id)}/reviews?${params}`, { signal: controller.signal })
      .then(async response => {
        const body: unknown = await response.json();
        if (!response.ok || !body || typeof body !== 'object' || !('reviews' in body) || !Array.isArray(body.reviews)) {
          throw new Error('Coaching context unavailable');
        }
        const reviews = body.reviews.filter((value): value is Review => !!value && typeof value === 'object'
          && typeof value.id === 'string' && (value.notes === null || typeof value.notes === 'string')
          && (value.reviewer_name === null || typeof value.reviewer_name === 'string'));
        if (reviews.length !== body.reviews.length) throw new Error('Invalid coaching records');
        if (current && !controller.signal.aborted) setState({ source: post, status: 'ready', reviews });
      })
      .catch(() => { if (current && !controller.signal.aborted) setState(previous => ({ ...previous, source: post, status: 'unavailable' })); })
      .finally(() => clearTimeout(timeout));
    return () => { current = false; clearTimeout(timeout); controller.abort(); };
  }, [post, attempt]);
  const retry = () => {
    setState(previous => ({ ...previous, source: post, status: 'loading' }));
    setAttempt(value => value + 1);
  };
  // A refreshed dataset supplies a new row object. Retain this video's known
  // notes while announcing its refresh; a new identity remounts the caller.
  const status: ReviewState['status'] = state.source === post ? state.status : 'loading';
  return { reviews: state.reviews, status, retry };
}

function CoachingContext({ post }: { post: ContentPost }) {
  const { reviews, status, retry } = useCoachingReviews(post);
  const notes = reviews.filter(review => review.notes?.trim());
  return <section className={styles.coaching} aria-label="Coaching context">
    <h3>Coaching context</h3>
    {status === 'loading' && <p className={styles.muted} role="status">{reviews.length ? 'Updating coaching context…' : 'Loading coaching context…'}</p>}
    {status === 'unavailable' && <div className={styles.reviewError}>
      <p>Coaching context could not be loaded.</p>
      <button type="button" className={styles.textButton} onClick={retry}><RefreshCw size={13} aria-hidden="true" />Retry</button>
    </div>}
    {notes.length > 0 && <div className={styles.notes}>
      {notes.slice(0, 2).map(review => <article key={review.id}>
        {review.reviewer_name && <strong>{review.reviewer_name}</strong>}
        <p>{review.notes}</p>
      </article>)}
      {notes.length > 2 && <p className={styles.muted}>Two most recent written notes. Open the full review for the rest.</p>}
    </div>}
    {status === 'ready' && !notes.length && <p className={styles.muted}>{reviews.length
      ? `${formatNumber(reviews.length)} recorded ${reviews.length === 1 ? 'review' : 'reviews'}; no written notes.`
      : 'No coaching notes recorded for this video.'}</p>}
  </section>;
}

function DeliveryContext({ post, start, end }: Pick<ContextProps, 'post' | 'start' | 'end'>) {
  const label = !post.post_date || postAgeDays(post.post_date, end) === null ? 'Publication date unavailable'
    : post.post_date >= start && post.post_date <= end ? 'Published in selected dates'
      : post.post_date < start ? 'Older content earning in this period' : 'Published after selected dates';
  return <div className={styles.delivery}>
    <span className={styles.badge}>{label}</span>
    <p className={styles.muted}>Qualifying delivery has not been verified.</p>
  </div>;
}

function CopyVideoLink({ url, disabled }: { url: string | null; disabled: boolean }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const operation = useRef(0);
  useEffect(() => () => { operation.current += 1; if (timer.current) clearTimeout(timer.current); }, []);
  async function copy() {
    if (!url || disabled) return;
    const current = ++operation.current;
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(url);
      if (current !== operation.current) return;
      setStatus('copied');
      timer.current = setTimeout(() => setStatus('idle'), 2400);
    } catch {
      if (current === operation.current) setStatus('failed');
    }
  }
  return <>
    <button type="button" className={styles.secondaryButton} disabled={disabled || !url} onClick={copy}>
      {status === 'copied' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      {status === 'copied' ? 'Link copied' : 'Copy video link'}
    </button>
    <span className={styles.copyStatus} role="status" aria-live="polite">{status === 'copied' ? 'Video link copied to clipboard.'
      : status === 'failed' ? 'Could not copy the link. Open it in TikTok to copy it manually.' : ''}</span>
  </>;
}

function InspectorBody({ post, start, end, reviewHref, onPreview, isUpdating = false }: ContextProps & { onPreview: () => void; isUpdating?: boolean }) {
  const url = resolveWatchUrl(post.video_url, post.creator_handle, post.video_id);
  const canPreview = /^\d+$/.test(post.video_id);
  const tags = post.creator_tags ?? [];
  return <section className={styles.inspector} aria-label="Selected video" aria-busy={isUpdating}>
    <div className={styles.poster}><VideoThumbnail url={url ?? ''} className={styles.cover} /></div>
    <div className={styles.details}>
      <h2 title={post.video_title}>{post.video_title || 'Untitled video'}</h2>
      <Link className={styles.creator} href={creatorHref(post, start, end)}>@{post.creator_handle.replace(/^@/, '')}</Link>
      <p className={styles.publication}>{publicationLabel(post, end)}</p>
      <p className={styles.period}>Sales during {calendarDate(start)} to {calendarDate(end)}</p>
      <div className={styles.sales}>
        <strong>{formatCurrency(post.gmv)} GMV</strong>
        <p>{formatNumber(post.orders)} orders · {formatNumber(post.items_sold)} units</p>
      </div>
      <div className={styles.relationship}>
        <span>{post.brand_name}</span><span>{post.is_managed ? 'Managed creator' : 'Outside managed roster'}</span>
      </div>
      {post.creator_context_status === 'ready' && tags.length > 0 && <div className={styles.tags} aria-label="Creator tags">{tags.map(tag => <span key={tag}>{tag}</span>)}</div>}
      <DeliveryContext post={post} start={start} end={end} />
      <CoachingContext key={`${post.brand_slug}:${post.video_id}`} post={post} />
      <div className={styles.actions}>
        <button type="button" className={styles.primaryButton} disabled={isUpdating || !canPreview} onClick={onPreview}><Play size={15} aria-hidden="true" />Open preview</button>
        <CopyVideoLink key={url} url={url} disabled={isUpdating} />
        <Link href={reviewHref} className={styles.textLink}>Open full review<ExternalLink size={13} aria-hidden="true" /></Link>
        {url && <a href={url} target="_blank" rel="noopener noreferrer" className={styles.textLink}>Open in TikTok<ExternalLink size={13} aria-hidden="true" /></a>}
      </div>
    </div>
  </section>;
}

export function ContentInspector({ post, start, end, reviewHref, onPreview, isUpdating = false }: {
  post: ContentPost | null; start: string; end: string; reviewHref: string;
  onPreview: () => void; isUpdating?: boolean;
}) {
  if (!post) return <section className={`${styles.inspector} ${styles.empty}`} aria-label="Selected video">
    <Play size={25} aria-hidden="true" /><h2>Select a video</h2><p>Review its sales, publication date and coaching context here.</p>
  </section>;
  return <InspectorBody key={`${post.brand_slug}:${post.video_id}`} post={post} start={start} end={end} reviewHref={reviewHref} onPreview={onPreview} isUpdating={isUpdating} />;
}

export function ContentPreview({ post, start, end, reviewHref, open, onOpenChange, onNext }: {
  post: ContentPost | null; start: string; end: string; reviewHref: string;
  open: boolean; onOpenChange: (open: boolean) => void; onNext?: () => void;
}) {
  const opener = useRef<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const url = post ? resolveWatchUrl(post.video_url, post.creator_handle, post.video_id) : null;
  return <Dialog.Root open={open && !!post} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className={styles.previewOverlay} />
      <Dialog.Content className={styles.previewPanel} data-lenis-prevent
        onOpenAutoFocus={event => {
          const focused = document.activeElement;
          opener.current = focused instanceof HTMLElement && focused !== document.body ? focused : null;
          event.preventDefault();
          closeButton.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
        }}>
        <Dialog.Title className="sr-only">Video preview</Dialog.Title>
        <Dialog.Description className="sr-only">Selected video playback, publication details and recorded sales in the selected reporting period.</Dialog.Description>
        <header className={styles.previewHeader}>
          <Dialog.Close ref={closeButton} className={styles.closeButton} aria-label="Close video preview"><X size={17} aria-hidden="true" /><span>Close preview</span></Dialog.Close>
        </header>
        {post && <div className={styles.previewLayout}>
          <div className={styles.playerArea}>
            <TikTokPlayer key={post.video_id} videoId={post.video_id} className={styles.player} />
            {url && <a href={url} className={styles.playerFallback} target="_blank" rel="noopener noreferrer">Open in TikTok<ExternalLink size={14} aria-hidden="true" /></a>}
          </div>
          <div className={styles.previewDetails}>
            <span className={styles.previewBadge}>Video preview</span>
            <h2>{post.video_title || 'Untitled video'}</h2>
            <Link href={creatorHref(post, start, end)} className={styles.creator}>@{post.creator_handle.replace(/^@/, '')}</Link>
            <p className={styles.period}>Sales during {calendarDate(start)} to {calendarDate(end)}</p>
            <div className={styles.sales}><strong>{formatCurrency(post.gmv)} GMV</strong><p>{formatNumber(post.orders)} orders · {formatNumber(post.items_sold)} units</p></div>
            <p className={styles.publication}>{publicationLabel(post, end)}</p>
            <DeliveryContext post={post} start={start} end={end} />
            <CoachingContext key={`${post.brand_slug}:${post.video_id}`} post={post} />
            <div className={styles.previewActions}>
              <Link href={reviewHref} className={styles.secondaryButton}>Open full review</Link>
              {onNext && <button type="button" className={styles.primaryButton} onClick={onNext}>Next video</button>}
            </div>
          </div>
        </div>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
