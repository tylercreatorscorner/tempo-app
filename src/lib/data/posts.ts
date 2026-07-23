/**
 * Posts data fetcher.
 *
 * Powers the /posts page. The heavy lifting lives in three RPCs (migrations
 * 043/076/079/090):
 *
 *   - get_managed_posts            → one row per UNIQUE video_id, deduped
 *                                    across brands (a video_id is one video and
 *                                    must never count under two shops),
 *                                    filtered to active non-umbrella brands +
 *                                    the date window + (by default) managed
 *                                    creators, ordered by GMV desc, capped at
 *                                    p_limit.
 *   - get_managed_posts_totals     → the KPI aggregate over the FULL window
 *                                    (uncapped), so the headline numbers add up
 *                                    no matter how many rows the table renders.
 *   - get_video_reviews_in_window  → review aggregates for videos posted in
 *                                    the window (mig 090), replacing an
 *                                    un-paginated all-time video_reviews read
 *                                    that silently truncated at the PostgREST
 *                                    1000-row cap.
 *
 * Money (gmv/orders/items) is WINDOWED from video_performance (mig 079).
 * Engagement (views/likes/comments/shares) is ALSO windowed from
 * video_performance since mig 090 — per-day values ingested by mig 088,
 * aggregated MAX-per-day-then-SUM in SQL. NULL means "no engagement data in
 * this window" (typically uploads that predate the engagement ingest) and is
 * rendered as absent, never a fake 0.
 *
 * Filtered by post_date (when the video was originally posted) being in the
 * date range. Each unique video appears once.
 */
import { createAdminClient } from '@/lib/supabase/server';

export interface PostRow {
  video_id: string;
  video_title: string;
  video_url: string | null;
  creator_handle: string;
  brand_slug: string;
  brand_name: string;
  post_date: string | null;       // YYYY-MM-DD
  views: number | null;           // windowed; null = no engagement data
  likes: number | null;
  comments: number | null;
  shares: number | null;
  engagement_rate: number | null; // % — (likes + comments) / views × 100; null when views unknown
  gmv: number;                    // earned in the window (video_performance, mig 079)
  orders: number;
  items_sold: number;
  is_managed: boolean;
  // Review aggregates (get_video_reviews_in_window)
  review_count: number;
  avg_rating: number | null;      // null when no rated reviews exist
  flagged: boolean;               // any review tagged off-brand / needs-rework
  has_my_review: boolean;         // current user has reviewed this post
}

export type ReviewFilter = 'all' | 'unreviewed' | 'reviewed-by-me' | 'flagged';

export interface PostsResult {
  posts: PostRow[];
  totals: {
    postCount: number;            // distinct videos in the window (full scope)
    totalViews: number | null;    // null = no post in the window has engagement data
    totalLikes: number | null;
    totalComments: number | null;
    totalShares: number | null;
    viewsKnown: number;           // posts with engagement data — coverage for the KPI copy
    totalGmv: number;
    avgEngagement: number | null;
    // Review counts over the in-scope post set (before reviewFilter is applied)
    // so the filter pills can show how many posts each filter would surface.
    reviewedCount: number;
    unreviewedCount: number;
    flaggedCount: number;
    reviewedByMeCount: number;
  };
  // How many rows the RPC actually returned (deduped, before reviewFilter).
  // Equals totals.postCount in every normal window; only differs when a huge
  // (e.g. all-creators) window exceeds ROW_CAP.
  deliveredCount: number;
  // True when the window has more posts than we shipped — narrow the range
  // to see them all. Totals stay correct (computed in-DB over everything).
  capped: boolean;
  startDate: string;
  endDate: string;
}

// Safety bound on rows shipped to the browser in one request. Managed windows
// (the default) are well under this even at 90 days; only pathological
// all-creators ranges hit it, and when they do the KPI totals still reflect
// the full set (they come from the uncapped totals RPC).
const ROW_CAP = 20000;

interface RpcRow {
  video_id: string;
  video_title: string | null;
  video_url: string | null;
  creator_handle: string | null;
  brand_slug: string;
  brand_name: string | null;
  post_date: string | null;
  views: number | string | null;
  likes: number | string | null;
  comments: number | string | null;
  shares: number | string | null;
  gmv: number | string | null;
  orders: number | string | null;
  items_sold: number | string | null;
  is_managed: boolean | null;
}

interface ReviewRpcRow {
  video_id: string;
  brand: string;
  review_count: number | string | null;
  avg_rating: number | string | null;
  flagged: boolean | null;
  has_my_review: boolean | null;
}

function pNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isNaN(n) ? 0 : n;
}

/** Like pNum but preserves null — engagement values must never fake a 0. */
function pNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isNaN(n) ? null : n;
}

interface GetPostsOpts {
  brand: string | null;
  startDate: string;          // YYYY-MM-DD — filters by post_date
  endDate: string;            // YYYY-MM-DD
  managedOnly?: boolean;
  limit?: number;
  /** Required when reviewFilter='reviewed-by-me' or to compute has_my_review. */
  currentUserId?: string;
  /**
   * Surface filter for the review queue:
   *   - 'all'             → no extra filter (default)
   *   - 'unreviewed'      → posts with zero reviews
   *   - 'reviewed-by-me'  → posts the current user has reviewed
   *   - 'flagged'         → posts tagged with off-brand or needs-rework
   *
   * The client applies this same predicate locally on pill toggles (the fields
   * ride on every row); the server param exists for deep-linked first loads.
   */
  reviewFilter?: ReviewFilter;
  /**
   * When provided (non-null), restrict to these brand slugs only — used to
   * scope a manager to their own brands. null/undefined = all active brands
   * (owner/admin behavior, unchanged).
   */
  allowedBrandSlugs?: string[] | null;
}

function emptyResult(startDate: string, endDate: string): PostsResult {
  return {
    posts: [],
    totals: {
      postCount: 0,
      totalViews: null, totalLikes: null, totalComments: null, totalShares: null,
      viewsKnown: 0, totalGmv: 0, avgEngagement: null,
      reviewedCount: 0, unreviewedCount: 0, flaggedCount: 0, reviewedByMeCount: 0,
    },
    deliveredCount: 0,
    capped: false,
    startDate, endDate,
  };
}

export async function getPosts(opts: GetPostsOpts): Promise<PostsResult> {
  const supabase = await createAdminClient();
  const { brand, startDate, endDate, managedOnly = true, limit = ROW_CAP, currentUserId, reviewFilter = 'all', allowedBrandSlugs } = opts;

  // ── 1. Resolve the brand-slug allow-list. Active, non-umbrella brands
  //       (umbrella brands like Leefar are excluded so they don't
  //       double-count alongside the child shops they cover). Optional
  //       single-brand filter + manager scoping. Empty → fail closed.
  let brandQuery = supabase
    .from('brands_v2')
    .select('slug, is_umbrella')
    .eq('is_archived', false);
  if (brand) brandQuery = brandQuery.eq('slug', brand);
  const { data: brandsRaw } = await brandQuery;
  let brandSlugs = (brandsRaw as Array<{ slug: string; is_umbrella: boolean | null }> | null ?? [])
    .filter(b => !b.is_umbrella)
    .map(b => b.slug);
  if (allowedBrandSlugs != null) {
    const allowed = new Set(allowedBrandSlugs);
    brandSlugs = brandSlugs.filter(s => allowed.has(s));
  }
  if (brandSlugs.length === 0) return emptyResult(startDate, endDate);

  // ── 2. Deduped rows (capped) + full-window totals + review aggregates, in
  //       parallel. All three are SQL-side (managed join, dedupe, review
  //       grouping) — 3 round-trips regardless of window size.
  const [rowsRes, totalsRes, reviewsRes] = await Promise.all([
    supabase.rpc('get_managed_posts', {
      p_brand_slugs: brandSlugs,
      p_start_date: startDate,
      p_end_date: endDate,
      p_managed_only: managedOnly,
      p_limit: limit,
    }),
    supabase.rpc('get_managed_posts_totals', {
      p_brand_slugs: brandSlugs,
      p_start_date: startDate,
      p_end_date: endDate,
      p_managed_only: managedOnly,
    }),
    supabase.rpc('get_video_reviews_in_window', {
      p_brand_slugs: brandSlugs,
      p_start_date: startDate,
      p_end_date: endDate,
      p_user_id: currentUserId ?? null,
    }),
  ]);
  if (rowsRes.error) throw rowsRes.error;
  if (totalsRes.error) throw totalsRes.error;
  // Reviews are load-bearing for the queue pills — a failed read must surface
  // as an error, never as a fake "inbox zero".
  if (reviewsRes.error) throw reviewsRes.error;

  const rpcRows = (rowsRes.data as RpcRow[] | null) ?? [];
  const tot = ((totalsRes.data as Array<Record<string, unknown>> | null) ?? [])[0] ?? {};
  const postCount     = pNum(tot.post_count);
  const totalViews    = pNumOrNull(tot.total_views);
  const totalLikes    = pNumOrNull(tot.total_likes);
  const totalComments = pNumOrNull(tot.total_comments);
  const totalShares   = pNumOrNull(tot.total_shares);
  const viewsKnown    = pNum(tot.views_known);
  const totalGmv      = pNum(tot.total_gmv);

  const reviewByKey = new Map<string, ReviewRpcRow>();
  for (const r of (reviewsRes.data as ReviewRpcRow[] | null) ?? []) {
    reviewByKey.set(`${r.video_id}|||${r.brand}`, r);
  }

  // ── 3. Map RPC rows → PostRow. Engagement stays nullable end-to-end.
  let posts: PostRow[] = rpcRows.map(r => {
    const views = pNumOrNull(r.views);
    const likes = pNumOrNull(r.likes);
    const comments = pNumOrNull(r.comments);
    const shares = pNumOrNull(r.shares);
    const review = reviewByKey.get(`${r.video_id}|||${r.brand_slug}`);
    return {
      video_id: r.video_id,
      video_title: r.video_title ?? '(untitled)',
      video_url: r.video_url,
      creator_handle: r.creator_handle ?? '',
      brand_slug: r.brand_slug,
      brand_name: r.brand_name ?? r.brand_slug,
      post_date: r.post_date,
      views, likes, comments, shares,
      engagement_rate: views !== null && views > 0
        ? (((likes ?? 0) + (comments ?? 0)) / views) * 100
        : null,
      gmv: pNum(r.gmv),
      orders: pNum(r.orders),
      items_sold: pNum(r.items_sold),
      is_managed: !!r.is_managed,
      review_count: review ? pNum(review.review_count) : 0,
      avg_rating: review ? pNumOrNull(review.avg_rating) : null,
      flagged: !!review?.flagged,
      has_my_review: !!review?.has_my_review,
    };
  });

  const deliveredCount = posts.length;
  const capped = deliveredCount >= limit && postCount > deliveredCount;

  // Pre-filter review counts so the pills can show how many posts each filter
  // would surface. unreviewedCount is taken against the TRUE total so the
  // pill still matches the "Posts" KPI even in a capped window.
  const reviewedCount = posts.filter(p => p.review_count > 0).length;
  const flaggedCount = posts.filter(p => p.flagged).length;
  const reviewedByMeCount = posts.filter(p => p.has_my_review).length;
  const unreviewedCount = Math.max(postCount - reviewedCount, 0);

  // Apply the review-queue filter last — totals above reflect the unfiltered
  // scope so pill counts stay stable when the user toggles between filters.
  if (reviewFilter === 'unreviewed') posts = posts.filter(p => p.review_count === 0);
  else if (reviewFilter === 'reviewed-by-me') posts = posts.filter(p => p.has_my_review);
  else if (reviewFilter === 'flagged') posts = posts.filter(p => p.flagged);

  // Headline engagement over the posts whose views are known (the totals RPC
  // sums each metric over its non-null set; views is the denominator).
  const avgEngagement = totalViews !== null && totalViews > 0
    ? (((totalLikes ?? 0) + (totalComments ?? 0)) / totalViews) * 100
    : null;

  return {
    posts,
    totals: {
      postCount,
      totalViews, totalLikes, totalComments, totalShares, viewsKnown,
      totalGmv, avgEngagement,
      reviewedCount, unreviewedCount, flaggedCount, reviewedByMeCount,
    },
    deliveredCount,
    capped,
    startDate, endDate,
  };
}
