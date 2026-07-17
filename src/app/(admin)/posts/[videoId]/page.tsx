import { redirect, notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';
import { PostReviewClient, type VideoMeta } from './post-review-client';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ videoId: string }>;
  searchParams: Promise<{ brand?: string }>;
}

interface VideoRow {
  video_id: string;
  brand: string;
  creator_name: string | null;
  video_name: string | null;
  video_link: string | null;
  post_date: string | null;
  impressions: number | string | null;
  likes: number | string | null;
  comments: number | string | null;
  total_gmv: number | string | null;
  affiliate_gmv: number | string | null;
  items_sold: number | string | null;
  orders: number | string | null;
}

const BRAND_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export default async function PostReviewPage({ params, searchParams }: Props) {
  const profile = await requireAdmin();
  if (!profile) redirect('/dashboard');

  const { videoId } = await params;
  const sp = await searchParams;

  // Lightweight sanity-check on URL params before hitting the DB. Supabase
  // parameterizes the query so this isn't an injection guard — it just stops
  // accidental garbage URLs from cluttering the logs with "no rows" errors.
  if (!videoId || videoId.length === 0 || videoId.length > 256) {
    notFound();
  }
  const brandFilter = sp.brand && BRAND_SLUG_RE.test(sp.brand) ? sp.brand : null;

  const admin = await createAdminClient();

  // The videos table is keyed by (video_id, brand). If brand isn't in the URL
  // we'll just pick the first matching row — videos almost never appear under
  // multiple brands but if they do, the user can switch via ?brand=.
  // Engagement (impressions/likes/comments) lives only here.
  let q = admin.from('videos')
    .select('video_id, brand, creator_name, video_name, video_link, post_date, impressions, likes, comments, total_gmv, affiliate_gmv, items_sold, orders')
    .eq('video_id', videoId);
  if (brandFilter) q = q.eq('brand', brandFilter);
  const { data: rows } = await q.limit(1).returns<VideoRow[]>();

  const video = rows?.[0];
  if (!video) notFound();

  const toNum = (v: number | string | null): number => {
    if (v === null || v === '') return 0;
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isNaN(n) ? 0 : n;
  };

  // GMV/orders/items — lifetime sum from video_performance (migration 079's
  // source), NOT videos.total_gmv, which is a frozen last-upload-CSV snapshot.
  // Deduped per (product_id, report_date) so a video selling several products,
  // or a cross-brand duplicate-ingest day, doesn't double-count — the same rule
  // the list RPC uses, so this detail page agrees with the row that linked here.
  const { data: perfRows } = await admin
    .from('video_performance')
    .select('report_date, product_id, gmv, orders, items_sold')
    .eq('video_id', video.video_id)
    .eq('brand', video.brand)
    .eq('period_type', 'daily');
  const seen = new Set<string>();
  let lifeGmv = 0, lifeOrders = 0, lifeItems = 0;
  for (const r of (perfRows as Array<{ report_date: string; product_id: string | null; gmv: number | string | null; orders: number | string | null; items_sold: number | string | null }> | null) ?? []) {
    const key = `${r.product_id ?? ''}|||${r.report_date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lifeGmv += toNum(r.gmv); lifeOrders += toNum(r.orders); lifeItems += toNum(r.items_sold);
  }

  // Resolve brand display name for the header
  const { data: brandRow } = await admin
    .from('brands_v2')
    .select('name')
    .eq('slug', video.brand)
    .maybeSingle<{ name: string }>();

  const meta: VideoMeta = {
    video_id: video.video_id,
    brand_slug: video.brand,
    brand_name: brandRow?.name ?? video.brand,
    creator_handle: (video.creator_name ?? '').replace(/^@/, ''),
    title: video.video_name ?? '(untitled)',
    video_url: video.video_link,
    post_date: video.post_date,
    views: Math.round(toNum(video.impressions)),
    likes: Math.round(toNum(video.likes)),
    comments: Math.round(toNum(video.comments)),
    gmv: lifeGmv,
    orders: Math.round(lifeOrders),
    items_sold: Math.round(lifeItems),
  };

  return <PostReviewClient meta={meta} />;
}
