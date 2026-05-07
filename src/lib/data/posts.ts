/**
 * Posts data fetcher.
 *
 * Powers the /posts page. Reads directly from the `videos` table — the
 * canonical persistent catalog of every video, with engagement snapshots
 * (impressions/likes/comments) and revenue (total_gmv/affiliate_gmv).
 *
 * Why videos and not video_performance?
 *   - video_performance is daily × product (multiple rows per video) and
 *     has no engagement columns
 *   - daily_video_stats is mostly empty (sync trigger writes elsewhere)
 *   - videos is one row per (video_id, brand), populated by uploads, has
 *     all the engagement we need + GMV
 *
 * Filtered by post_date (when the video was originally posted) being in
 * the date range. Each video appears once.
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
  gmv: number;                    // affiliate_gmv (creator-attributed)
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
    postCount: number;
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
  startDate: string;
  endDate: string;
}

// Tags that surface a post in the "Flagged" review queue. Mirrors the
// presets in post-review-client.tsx — keep them in sync if presets change.
const FLAGGED_TAGS = new Set(['⚠️ off-brand', '✏️ needs rework']);

interface RawRow {
  video_id: string;
  video_name: string | null;
  video_link: string | null;
  creator_name: string;
  brand: string;
  post_date: string | null;
  impressions: number | string | null;
  likes: number | string | null;
  comments: number | string | null;
  total_gmv: number | string | null;
  affiliate_gmv: number | string | null;
  items_sold: number | string | null;
  orders: number | string | null;
}

function pNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isNaN(n) ? 0 : n;
}
function pInt(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? Math.round(v) : parseInt(String(v), 10);
  return Number.isNaN(n) ? 0 : n;
}
function normalizeHandle(h: string | null | undefined): string {
  if (!h) return '';
  return h.replace(/^@/, '').trim().toLowerCase();
}

const PAGE_SIZE = 1000;

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
}

export async function getPosts(opts: GetPostsOpts): Promise<PostsResult> {
  const supabase = await createAdminClient();
  const { brand, startDate, endDate, managedOnly = true, limit = 500, currentUserId, reviewFilter = 'all' } = opts;

  // ── 1. Resolve active brands (excluding archived + umbrella). videos uses
  //       brand text slug.
  let brandQuery = supabase
    .from('brands_v2')
    .select('slug, name, is_umbrella')
    .eq('is_archived', false);
  if (brand) brandQuery = brandQuery.eq('slug', brand);
  const { data: brandsRaw } = await brandQuery;
  // Exclude umbrella brands (e.g. Leefar with multiple TikTok shops) so
  // their stats don't double-count alongside the child shops they cover.
  // is_umbrella is the canonical flag on brands_v2 — replaces the old
  // hardcoded `slug !== 'leefar'` check so any future umbrella auto-excludes.
  const brands = (brandsRaw as Array<{ slug: string; name: string; is_umbrella: boolean | null }> | null ?? [])
    .filter(b => !b.is_umbrella);
  if (brands.length === 0) {
    return {
      posts: [], startDate, endDate,
      totals: {
        postCount: 0, totalViews: 0, totalGmv: 0, totalLikes: 0, totalComments: 0, avgEngagement: 0,
        reviewedCount: 0, unreviewedCount: 0, flaggedCount: 0, reviewedByMeCount: 0,
      },
    };
  }
  const brandSlugs = brands.map(b => b.slug);
  const brandBySlug = new Map(brands.map(b => [b.slug, b]));

  // ── 2. Pull videos with post_date in the window. Paginated to avoid the
  //       1k row default cap. The query is cheap because we have indexes
  //       on (brand) and post_date isn't huge per brand per week.
  const allRows: RawRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('videos')
      .select('video_id, video_name, video_link, creator_name, brand, post_date, impressions, likes, comments, total_gmv, affiliate_gmv, items_sold, orders')
      .in('brand', brandSlugs)
      .gte('post_date', startDate)
      .lte('post_date', endDate)
      .order('total_gmv', { ascending: false, nullsFirst: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data as RawRow[] | null) ?? [];
    if (batch.length === 0) break;
    allRows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
    // Cap upstream — we only care about top `limit` posts anyway, and pulling
    // 50k rows per request is wasteful when default sort is by GMV desc.
    if (allRows.length >= limit * 4) break;
  }

  // ── 3. Build managed-creator handle set to flag and (optionally) filter.
  const { data: managedRaw } = await supabase
    .from('managed_creators')
    .select('brand, account_1, account_2, account_3, account_4, account_5, account_6, account_7, account_8, account_9, account_10');
  const managedSet = new Set<string>();
  for (const m of (managedRaw as Array<Record<string, string | null>> | null ?? [])) {
    const brandSlug = m.brand;
    if (!brandSlug) continue;
    for (const k of ['account_1','account_2','account_3','account_4','account_5','account_6','account_7','account_8','account_9','account_10'] as const) {
      const handle = normalizeHandle(m[k]);
      if (handle) managedSet.add(`${handle}|||${brandSlug}`);
    }
  }

  // ── 4. Map raw rows to final shape — one row per video (no aggregation
  //       needed since videos table is already keyed by video_id+brand).
  let posts: PostRow[] = allRows
    .filter(r => r.video_id && r.creator_name)
    .map(r => {
      const handle = normalizeHandle(r.creator_name);
      const isManaged = managedSet.has(`${handle}|||${r.brand}`);
      const views    = pInt(r.impressions);
      const likes    = pInt(r.likes);
      const comments = pInt(r.comments);
      const engagement = engagementRate(views, likes, comments);
      // Prefer affiliate_gmv (creator-attributed) — it's the right lens for
      // the managed-creator view on this page. Falls back to total_gmv.
      const aff = pNum(r.affiliate_gmv);
      const gmv = aff > 0 ? aff : pNum(r.total_gmv);
      return {
        video_id: r.video_id,
        video_title: r.video_name ?? '(untitled)',
        video_url: r.video_link,
        creator_handle: handle,
        brand_slug: r.brand,
        brand_name: brandBySlug.get(r.brand)?.name ?? r.brand,
        post_date: r.post_date,
        views, likes, comments,
        engagement_rate: engagement,
        gmv,
        orders: pInt(r.orders),
        items_sold: pInt(r.items_sold),
        is_managed: isManaged,
        // Filled in by step 5 below (review join). Defaults so the type is
        // stable even when video_reviews is empty.
        review_count: 0,
        avg_rating: null,
        flagged: false,
        has_my_review: false,
      };
    });

  if (managedOnly) {
    posts = posts.filter(p => p.is_managed);
  }

  // Default sort by GMV desc (videos query already orders by total_gmv but
  // we use affiliate_gmv as the display GMV, so re-sort to be exact)
  posts.sort((a, b) => b.gmv - a.gmv);
  posts = posts.slice(0, limit);

  // ── 5. Review aggregates. One round-trip pulls every review for the in-scope
  //       video_ids; we group in JS so we don't pay for SQL array aggregation.
  //       Empty list short-circuits — getPosts on a brand with no posts in the
  //       window shouldn't fire a SELECT against video_reviews.
  if (posts.length > 0) {
    const videoIds = Array.from(new Set(posts.map(p => p.video_id)));
    const { data: reviewsRaw } = await supabase
      .from('video_reviews')
      .select('video_id, brand, reviewer_user_id, rating, tags')
      .in('video_id', videoIds);

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

  // Pre-filter review counts so the UI can show how many posts each pill
  // would surface (e.g. "Unreviewed (12)") without a second round-trip.
  const reviewedCount = posts.filter(p => p.review_count > 0).length;
  const unreviewedCount = posts.length - reviewedCount;
  const flaggedCount = posts.filter(p => p.flagged).length;
  const reviewedByMeCount = posts.filter(p => p.has_my_review).length;

  // Apply the review-queue filter last — totals above reflect the unfiltered
  // scope so pill counts stay stable when the user toggles between filters.
  if (reviewFilter === 'unreviewed') posts = posts.filter(p => p.review_count === 0);
  else if (reviewFilter === 'reviewed-by-me') posts = posts.filter(p => p.has_my_review);
  else if (reviewFilter === 'flagged') posts = posts.filter(p => p.flagged);

  // ── 6. Totals (over the displayed subset)
  const totalViews = posts.reduce((s, p) => s + p.views, 0);
  const totalGmv = posts.reduce((s, p) => s + p.gmv, 0);
  const totalLikes = posts.reduce((s, p) => s + p.likes, 0);
  const totalComments = posts.reduce((s, p) => s + p.comments, 0);
  const avgEngagement = engagementRate(totalViews, totalLikes, totalComments);

  return {
    posts,
    totals: {
      postCount: posts.length,
      totalViews, totalGmv, totalLikes, totalComments, avgEngagement,
      reviewedCount, unreviewedCount, flaggedCount, reviewedByMeCount,
    },
    startDate, endDate,
  };
}
