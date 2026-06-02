/**
 * Posts data fetcher.
 *
 * Powers the /posts page. The heavy lifting lives in two RPCs (migration
 * 043_posts_page_rpc):
 *
 *   - get_managed_posts        → one row per UNIQUE video_id, deduped across
 *                                brands (a video_id is one video and must
 *                                never count under two shops), filtered to
 *                                active non-umbrella brands + the date window
 *                                + (by default) managed creators, ordered by
 *                                GMV desc and capped at p_limit.
 *   - get_managed_posts_totals → the KPI aggregate over the FULL window
 *                                (uncapped), so the headline numbers add up
 *                                no matter how many rows the table renders.
 *
 * Why `videos` and not the v2 stats tables: engagement (impressions / likes /
 * comments) only exists on `videos`. daily_video_stats is empty and
 * daily_video_product_stats has GMV but no engagement.
 *
 * Filtered by post_date (when the video was originally posted) being in the
 * date range. Each unique video appears once.
 */
import { createAdminClient } from '@/lib/supabase/server';
import { engagementRate } from '@/lib/utils/format';

export interface PostRow {
  video_id: string;
  video_title: string;
  video_url: string | null;
  creator_handle: string;
  brand_slug: string;
  brand_name: string;
  post_date: string | null;       // YYYY-MM-DD
  views: number;                  // = impressions
  likes: number;
  comments: number;
  engagement_rate: number;        // % — (likes + comments) / views × 100
  gmv: number;                    // affiliate_gmv (creator-attributed), falls back to total_gmv
  orders: number;
  items_sold: number;
  is_managed: boolean;
  // Review aggregates (computed from video_reviews join)
  review_count: number;
  avg_rating: number | null;      // null when no rated reviews exist
  flagged: boolean;               // any review tagged "⚠️ off-brand" or "✏️ needs rework"
  has_my_review: boolean;         // current user has reviewed this post
}

export type ReviewFilter = 'all' | 'unreviewed' | 'reviewed-by-me' | 'flagged';

export interface PostsResult {
  posts: PostRow[];
  totals: {
    postCount: number;            // distinct videos in the window (full scope)
    totalViews: number;
    totalGmv: number;
    totalLikes: number;
    totalComments: number;
    avgEngagement: number;
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

// Tags that surface a post in the "Flagged" review queue. Mirrors the
// presets in post-review-client.tsx — keep them in sync if presets change.
const FLAGGED_TAGS = new Set(['⚠️ off-brand', '✏️ needs rework']);

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
  gmv: number | string | null;
  orders: number | string | null;
  items_sold: number | string | null;
  is_managed: boolean | null;
}

function pNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isNaN(n) ? 0 : n;
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
      postCount: 0, totalViews: 0, totalGmv: 0, totalLikes: 0, totalComments: 0, avgEngagement: 0,
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

  // ── 2. Deduped rows (capped) + full-window totals, in parallel. The RPCs
  //       do the managed-handle join and the dedupe-by-video_id in SQL.
  const [rowsRes, totalsRes] = await Promise.all([
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
  ]);
  if (rowsRes.error) throw rowsRes.error;
  if (totalsRes.error) throw totalsRes.error;

  const rpcRows = (rowsRes.data as RpcRow[] | null) ?? [];
  const tot = ((totalsRes.data as Array<Record<string, unknown>> | null) ?? [])[0] ?? {};
  const postCount    = pNum(tot.post_count);
  const totalViews   = pNum(tot.total_views);
  const totalLikes   = pNum(tot.total_likes);
  const totalComments = pNum(tot.total_comments);
  const totalGmv     = pNum(tot.total_gmv);

  // ── 3. Map RPC rows → PostRow. Engagement uses the shared util so the
  //       per-row % and the headline avg are computed identically.
  let posts: PostRow[] = rpcRows.map(r => {
    const views = pNum(r.views);
    const likes = pNum(r.likes);
    const comments = pNum(r.comments);
    return {
      video_id: r.video_id,
      video_title: r.video_title ?? '(untitled)',
      video_url: r.video_url,
      creator_handle: r.creator_handle ?? '',
      brand_slug: r.brand_slug,
      brand_name: r.brand_name ?? r.brand_slug,
      post_date: r.post_date,
      views, likes, comments,
      engagement_rate: engagementRate(views, likes, comments),
      gmv: pNum(r.gmv),
      orders: pNum(r.orders),
      items_sold: pNum(r.items_sold),
      is_managed: !!r.is_managed,
      // Filled in by step 4 (review join). Defaults keep the type stable
      // when video_reviews is empty.
      review_count: 0,
      avg_rating: null,
      flagged: false,
      has_my_review: false,
    };
  });

  const deliveredCount = posts.length;
  const capped = deliveredCount >= limit && postCount > deliveredCount;

  // ── 4. Review aggregates. video_reviews is keyed (video_id, brand) and is
  //       small (hand-entered creative reviews), so we pull it by brand —
  //       far cheaper than an .in() over thousands of video_ids — and group
  //       in JS. Short-circuits when there are no posts.
  if (posts.length > 0) {
    const { data: reviewsRaw } = await supabase
      .from('video_reviews')
      .select('video_id, brand, reviewer_user_id, rating, tags')
      .in('brand', brandSlugs);

    interface ReviewRow {
      video_id: string;
      brand: string;
      reviewer_user_id: string | null;
      rating: number | null;
      tags: string[] | null;
    }
    interface Aggregate {
      count: number;
      ratings: number[];
      tags: Set<string>;
      reviewers: Set<string>;
    }
    const aggregateByKey = new Map<string, Aggregate>();
    for (const r of (reviewsRaw as ReviewRow[] | null) ?? []) {
      const key = `${r.video_id}|||${r.brand}`;
      const agg = aggregateByKey.get(key) ?? { count: 0, ratings: [], tags: new Set<string>(), reviewers: new Set<string>() };
      agg.count++;
      if (typeof r.rating === 'number') agg.ratings.push(r.rating);
      if (Array.isArray(r.tags)) for (const t of r.tags) agg.tags.add(t);
      if (r.reviewer_user_id) agg.reviewers.add(r.reviewer_user_id);
      aggregateByKey.set(key, agg);
    }

    if (aggregateByKey.size > 0) {
      posts = posts.map(p => {
        const agg = aggregateByKey.get(`${p.video_id}|||${p.brand_slug}`);
        if (!agg) return p;
        const flagged = [...agg.tags].some(t => FLAGGED_TAGS.has(t));
        const avg = agg.ratings.length > 0
          ? agg.ratings.reduce((a, b) => a + b, 0) / agg.ratings.length
          : null;
        return {
          ...p,
          review_count: agg.count,
          avg_rating: avg,
          flagged,
          has_my_review: currentUserId ? agg.reviewers.has(currentUserId) : false,
        };
      });
    }
  }

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

  const avgEngagement = engagementRate(totalViews, totalLikes, totalComments);

  return {
    posts,
    totals: {
      postCount,
      totalViews, totalGmv, totalLikes, totalComments, avgEngagement,
      reviewedCount, unreviewedCount, flaggedCount, reviewedByMeCount,
    },
    deliveredCount,
    capped,
    startDate, endDate,
  };
}
