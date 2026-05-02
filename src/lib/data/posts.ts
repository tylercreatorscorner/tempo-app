/**
 * Posts data fetcher.
 *
 * Powers the /posts page. Aggregates daily_video_stats over a date range
 * into one row per video — every video posted by a managed creator with
 * its lifetime engagement (views/likes/comments) and revenue (GMV/orders).
 *
 * Why daily_video_stats and not video_performance?
 *   daily_video_stats has the engagement columns (impressions, likes,
 *   comments). video_performance has GMV/orders only. We use daily_video_stats
 *   as the source of truth and aggregate both engagement + revenue from it.
 *
 * Aggregation rules per video_id:
 *   - GMV, orders, items_sold       → SUM across days (daily snapshots add up)
 *   - impressions, likes, comments  → MAX across days (cumulative; latest
 *                                     snapshot = lifetime total at that point)
 *   - post_date                     → MIN (first time we saw it)
 *   - creator, title, url, brand    → from any row (consistent per video)
 *   - engagement_rate               → (likes + comments) / impressions × 100
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
  views: number;                  // = impressions
  likes: number;
  comments: number;
  engagement_rate: number;        // % — (likes + comments) / views × 100
  gmv: number;
  orders: number;
  items_sold: number;
  is_managed: boolean;            // true if creator is in managed_creators
}

export interface PostsResult {
  posts: PostRow[];
  totals: {
    postCount: number;
    totalViews: number;
    totalGmv: number;
    totalLikes: number;
    totalComments: number;
    avgEngagement: number;        // weighted by views
  };
  startDate: string;
  endDate: string;
}

interface RawRow {
  video_id: string;
  video_title: string | null;
  video_url: string | null;
  tiktok_username: string;
  brand_id: string;
  post_date: string | null;
  report_date: string;
  gmv: number | string;
  orders: number | string;
  items_sold: number | string;
  impressions: number | string;
  likes: number | string;
  comments: number | string;
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
  brand: string | null;       // brand SLUG, or null = all brands
  startDate: string;          // YYYY-MM-DD
  endDate: string;            // YYYY-MM-DD
  managedOnly?: boolean;      // default true — Tyler's spec is managed creators
  limit?: number;             // max posts to return (default 500)
}

export async function getPosts(opts: GetPostsOpts): Promise<PostsResult> {
  const supabase = await createAdminClient();
  const { brand, startDate, endDate, managedOnly = true, limit = 500 } = opts;

  // ── 1. Resolve brand list (active, non-umbrella). If brand filter given,
  //       restrict to just that one. We need brand_id (UUID) for the
  //       daily_video_stats filter — slug lookup via brands_v2.
  let brandQuery = supabase
    .from('brands_v2')
    .select('id, slug, name')
    .eq('is_archived', false);
  if (brand) brandQuery = brandQuery.eq('slug', brand);
  const { data: brandsRaw } = await brandQuery;
  const brands = (brandsRaw as Array<{ id: string; slug: string; name: string }> | null ?? [])
    .filter(b => b.slug !== 'leefar'); // umbrella exclusion (no data of its own)
  if (brands.length === 0) {
    return {
      posts: [], startDate, endDate,
      totals: { postCount: 0, totalViews: 0, totalGmv: 0, totalLikes: 0, totalComments: 0, avgEngagement: 0 },
    };
  }
  const brandIds = brands.map(b => b.id);
  const brandBySlug = new Map(brands.map(b => [b.slug, b]));
  const brandById  = new Map(brands.map(b => [b.id, b]));

  // ── 2. Pull all video stats over the period for these brands. Paginated to
  //       avoid the 1k row default cap.
  const allRows: RawRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('daily_video_stats')
      .select('video_id, video_title, video_url, tiktok_username, brand_id, post_date, report_date, gmv, orders, items_sold, impressions, likes, comments')
      .in('brand_id', brandIds)
      .gte('report_date', startDate)
      .lte('report_date', endDate)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data as RawRow[] | null) ?? [];
    if (batch.length === 0) break;
    allRows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  // ── 3. Build managed-creator handle set (per brand slug) so we can flag
  //       and optionally filter posts to managed creators only.
  const { data: managedRaw } = await supabase
    .from('managed_creators')
    .select('brand, account_1, account_2, account_3, account_4, account_5, account_6, account_7, account_8, account_9, account_10');
  const managedSet = new Set<string>();   // "handle|||brand_slug"
  for (const m of (managedRaw as Array<Record<string, string | null>> | null ?? [])) {
    const brandSlug = m.brand;
    if (!brandSlug) continue;
    for (const k of ['account_1','account_2','account_3','account_4','account_5','account_6','account_7','account_8','account_9','account_10'] as const) {
      const handle = normalizeHandle(m[k]);
      if (handle) managedSet.add(`${handle}|||${brandSlug}`);
    }
  }

  // ── 4. Aggregate by video_id. GMV/orders/items SUM, engagement MAX, post_date MIN.
  interface Agg {
    video_id: string;
    video_title: string;
    video_url: string | null;
    creator_handle: string;
    brand_id: string;
    post_date: string | null;
    gmv: number;
    orders: number;
    items_sold: number;
    impressions: number;       // MAX
    likes: number;             // MAX
    comments: number;          // MAX
  }

  const aggMap = new Map<string, Agg>();
  for (const row of allRows) {
    if (!row.video_id) continue;
    const handle = normalizeHandle(row.tiktok_username);
    if (!handle) continue;
    let agg = aggMap.get(row.video_id);
    if (!agg) {
      agg = {
        video_id: row.video_id,
        video_title: row.video_title ?? '(untitled)',
        video_url: row.video_url ?? null,
        creator_handle: handle,
        brand_id: row.brand_id,
        post_date: row.post_date,
        gmv: 0, orders: 0, items_sold: 0,
        impressions: 0, likes: 0, comments: 0,
      };
      aggMap.set(row.video_id, agg);
    }
    agg.gmv          += pNum(row.gmv);
    agg.orders       += pInt(row.orders);
    agg.items_sold   += pInt(row.items_sold);
    agg.impressions   = Math.max(agg.impressions, pInt(row.impressions));
    agg.likes         = Math.max(agg.likes,       pInt(row.likes));
    agg.comments      = Math.max(agg.comments,    pInt(row.comments));
    // Title/URL: prefer non-empty
    if (!agg.video_title || agg.video_title === '(untitled)') agg.video_title = row.video_title ?? agg.video_title;
    if (!agg.video_url) agg.video_url = row.video_url;
    // Post date: keep earliest non-null
    if (row.post_date && (!agg.post_date || row.post_date < agg.post_date)) {
      agg.post_date = row.post_date;
    }
  }

  // ── 5. Convert to final row shape with brand label + managed flag + engagement rate
  let posts: PostRow[] = Array.from(aggMap.values()).map(a => {
    const brand = brandById.get(a.brand_id);
    const brandSlug = brand?.slug ?? 'unknown';
    const isManaged = managedSet.has(`${a.creator_handle}|||${brandSlug}`);
    const engagement = a.impressions > 0
      ? ((a.likes + a.comments) / a.impressions) * 100
      : 0;
    return {
      video_id: a.video_id,
      video_title: a.video_title,
      video_url: a.video_url,
      creator_handle: a.creator_handle,
      brand_slug: brandSlug,
      brand_name: brand?.name ?? brandSlug,
      post_date: a.post_date,
      views: a.impressions,
      likes: a.likes,
      comments: a.comments,
      engagement_rate: engagement,
      gmv: a.gmv,
      orders: a.orders,
      items_sold: a.items_sold,
      is_managed: isManaged,
    };
  });

  // Filter to managed creators only if requested (default Tyler's spec)
  if (managedOnly) {
    posts = posts.filter(p => p.is_managed);
  }

  // Default sort by GMV desc, then cap at limit
  posts.sort((a, b) => b.gmv - a.gmv);
  posts = posts.slice(0, limit);

  // ── 6. Totals over the visible (post-filter, post-cap) set
  const totalViews = posts.reduce((s, p) => s + p.views, 0);
  const totalGmv = posts.reduce((s, p) => s + p.gmv, 0);
  const totalLikes = posts.reduce((s, p) => s + p.likes, 0);
  const totalComments = posts.reduce((s, p) => s + p.comments, 0);
  // Weighted engagement (by views) is more meaningful than a simple average
  const avgEngagement = totalViews > 0
    ? ((totalLikes + totalComments) / totalViews) * 100
    : 0;

  return {
    posts,
    totals: {
      postCount: posts.length,
      totalViews,
      totalGmv,
      totalLikes,
      totalComments,
      avgEngagement,
    },
    startDate, endDate,
  };
}
