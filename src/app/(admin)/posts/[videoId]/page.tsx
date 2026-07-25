import { cache } from 'react';
import { redirect, notFound } from 'next/navigation';
import { getWorkspaceScope, isBrandInScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';
import { getBrandRegistry } from '@/lib/data/brand-registry';
import { brandLabel } from '@/lib/data/brand-registry-core';
import { resolveWatchUrl } from '@/lib/utils/format';
import { PostReviewClient, type VideoMeta, type ReviewRow, type DailyPoint } from './post-review-client';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ videoId: string }>;
  searchParams: Promise<{ brand?: string; start?: string; end?: string }>;
}

interface VideoRow {
  video_id: string;
  brand: string;
  creator_name: string | null;
  video_name: string | null;
  video_link: string | null;
  post_date: string | null;
}

const BRAND_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Shared between generateMetadata and the page render — React cache() makes
// this one DB read per request, not two.
const getVideo = cache(async (videoId: string, brandFilter: string | null) => {
  const admin = await createAdminClient();
  let q = admin.from('videos')
    .select('video_id, brand, creator_name, video_name, video_link, post_date')
    .eq('video_id', videoId);
  if (brandFilter) q = q.eq('brand', brandFilter);
  const { data, error } = await q.limit(1).returns<VideoRow[]>();
  // A DB failure must NOT masquerade as a 404 — throw to the error boundary.
  if (error) throw new Error(`Failed to load video: ${error.message}`);
  return data?.[0] ?? null;
});

export async function generateMetadata({ params, searchParams }: Props) {
  const { videoId } = await params;
  const sp = await searchParams;
  if (!videoId || videoId.length > 256) return { title: 'Post — Tempo' };
  const brandFilter = sp.brand && BRAND_SLUG_RE.test(sp.brand) ? sp.brand : null;
  try {
    const video = await getVideo(videoId, brandFilter);
    const title = video?.video_name?.trim();
    return { title: title ? `${title} — Tempo` : 'Post — Tempo' };
  } catch {
    return { title: 'Post — Tempo' };
  }
}

interface LifetimeRpcRow {
  gmv: number | string | null;
  orders: number | string | null;
  items_sold: number | string | null;
  views: number | string | null;
  likes: number | string | null;
  comments: number | string | null;
  shares: number | string | null;
  first_earn_date: string | null;
  last_earn_date: string | null;
  days_active: number | string | null;
  daily: Array<{ d: string; gmv: number | string | null; views: number | string | null }> | null;
}

export default async function PostReviewPage({ params, searchParams }: Props) {
  // Same gate as the /posts list that links here: any Workspace user, scoped
  // to their brands. (The old requireAdmin() gate silently bounced managers
  // to /dashboard on every row click.)
  const scope = await getWorkspaceScope();
  if (!scope) redirect('/dashboard');

  const { videoId } = await params;
  const sp = await searchParams;

  // Lightweight sanity-check on URL params before hitting the DB. Supabase
  // parameterizes the query so this isn't an injection guard — it just stops
  // accidental garbage URLs from cluttering the logs with "no rows" errors.
  if (!videoId || videoId.length === 0 || videoId.length > 256) {
    notFound();
  }
  const brandFilter = sp.brand && BRAND_SLUG_RE.test(sp.brand) ? sp.brand : null;
  // Window carried over from the /posts row that linked here, so this page
  // can tie its numbers to the row the user clicked.
  const windowStart = sp.start && ISO_DATE_RE.test(sp.start) ? sp.start : null;
  const windowEnd = sp.end && ISO_DATE_RE.test(sp.end) ? sp.end : null;

  // The videos table is keyed by (video_id, brand). If brand isn't in the URL
  // we'll just pick the first matching row — videos almost never appear under
  // multiple brands but if they do, the user can switch via ?brand=.
  const video = await getVideo(videoId, brandFilter);
  if (!video) notFound();

  // Brand-scope check managers were previously missing entirely: a scoped
  // manager may only open videos under their own brands.
  if (!isBrandInScope(scope, { slug: video.brand })) redirect('/posts');

  const admin = await createAdminClient();

  const toNum = (v: number | string | null | undefined): number => {
    if (v === null || v === undefined || v === '') return 0;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isNaN(n) ? 0 : n;
  };
  const toNumOrNull = (v: number | string | null | undefined): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isNaN(n) ? null : n;
  };

  // Lifetime stats via RPC (mig 090): max-gmv-per-(product, day) dedup in SQL,
  // immune to the PostgREST 1000-row cap the old in-page .select() hit, plus
  // the per-day series for the trend chart. On error the client renders "—",
  // never a fake $0. Reviews are SSR'd alongside (kills the loading flash);
  // the registry ride-along resolves the display name per the house rule.
  const [statsRes, reviewsRes, registry] = await Promise.all([
    admin.rpc('get_video_lifetime_stats', { p_video_id: video.video_id, p_brand: video.brand }),
    // ALL brands of this video: reviews attach to the video identity (mig 094)
    // — a cross-store video's review must not vanish because the /posts row
    // linked here under the sibling brand.
    admin
      .from('video_reviews')
      .select('id, reviewer_user_id, reviewer_name, rating, notes, tags, created_at, updated_at')
      .eq('video_id', video.video_id)
      .order('updated_at', { ascending: false }),
    getBrandRegistry(),
  ]);

  let stats: LifetimeRpcRow | null = null;
  if (statsRes.error) {
    console.error('[posts/[videoId]] get_video_lifetime_stats failed:', statsRes.error.message);
  } else {
    stats = ((statsRes.data as LifetimeRpcRow[] | null) ?? [])[0] ?? null;
  }

  // A failed reviews read must THROW (error boundary), never render as an
  // empty review list: the client has no mount-time fetch anymore, so a
  // silently-empty initialReviews would show a blank form whose Save upserts
  // over the user's existing review without them ever seeing it.
  if (reviewsRes.error) {
    throw new Error(`Failed to load reviews: ${reviewsRes.error.message}`);
  }
  const initialReviews = (reviewsRes.data as ReviewRow[] | null) ?? [];

  const daily: DailyPoint[] = (stats?.daily ?? []).map(p => ({
    d: p.d,
    gmv: toNum(p.gmv),
    views: toNumOrNull(p.views),
  }));

  // Windowed GMV for the tie-out with the /posts row: sum the daily series
  // over the carried window (same dedup basis, zero extra round-trips).
  const windowGmv = windowStart && windowEnd
    ? daily.filter(p => p.d >= windowStart && p.d <= windowEnd).reduce((s, p) => s + p.gmv, 0)
    : null;

  const meta: VideoMeta = {
    video_id: video.video_id,
    brand_slug: video.brand,
    brand_name: brandLabel(registry, video.brand),
    creator_handle: (video.creator_name ?? '').replace(/^@/, ''),
    title: video.video_name ?? '(untitled)',
    // Never render videos.video_link raw: TikTok's export column became an
    // expiring signed CDN URL (~2-day life), so mig 110's dual-ingest wrote
    // links that 404 within two days. resolveWatchUrl prefers a canonical
    // stored link and otherwise rebuilds the permanent permalink from the
    // handle + video id (mig 119 repairs the stored rows; this is the guard).
    video_url: resolveWatchUrl(video.video_link, video.creator_name, video.video_id),
    post_date: video.post_date,
    // null = stats RPC failed (render "—"); money 0 = genuinely no earnings rows.
    stats: stats ? {
      gmv: toNum(stats.gmv),
      orders: Math.round(toNum(stats.orders)),
      items_sold: Math.round(toNum(stats.items_sold)),
      views: toNumOrNull(stats.views),
      likes: toNumOrNull(stats.likes),
      comments: toNumOrNull(stats.comments),
      shares: toNumOrNull(stats.shares),
      first_earn_date: stats.first_earn_date,
      last_earn_date: stats.last_earn_date,
      days_active: Math.round(toNum(stats.days_active)),
    } : null,
    daily,
    window: windowStart && windowEnd ? { start: windowStart, end: windowEnd, gmv: windowGmv ?? 0 } : null,
  };

  return <PostReviewClient meta={meta} initialReviews={initialReviews} currentUserId={scope.userId} />;
}
