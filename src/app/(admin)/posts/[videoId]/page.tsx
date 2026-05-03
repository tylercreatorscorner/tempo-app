import { redirect, notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';
import { PostReviewClient, type VideoMeta } from './post-review-client';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ videoId: string }>;
  searchParams: Promise<{ brand?: string }>;
}

export default async function PostReviewPage({ params, searchParams }: Props) {
  const profile = await requireAdmin();
  if (!profile) redirect('/dashboard');

  const { videoId } = await params;
  const sp = await searchParams;

  const admin = await createAdminClient();

  // The videos table is keyed by (video_id, brand). If brand isn't in the URL
  // we'll just pick the first matching row — videos almost never appear under
  // multiple brands but if they do, the user can switch via ?brand=.
  let q = admin.from('videos')
    .select('video_id, brand, creator_name, video_name, video_link, post_date, impressions, likes, comments, total_gmv, affiliate_gmv, items_sold, orders')
    .eq('video_id', videoId);
  if (sp.brand) q = q.eq('brand', sp.brand);
  const { data: rows } = await q.limit(1);

  const video = (rows as Array<Record<string, unknown>> | null ?? [])[0];
  if (!video) notFound();

  // Resolve brand display name for the header
  const { data: brandRow } = await admin
    .from('brands_v2')
    .select('name')
    .eq('slug', String(video.brand))
    .maybeSingle();

  const meta: VideoMeta = {
    video_id: String(video.video_id),
    brand_slug: String(video.brand),
    brand_name: (brandRow as { name?: string } | null)?.name ?? String(video.brand),
    creator_handle: String(video.creator_name ?? '').replace(/^@/, ''),
    title: String(video.video_name ?? '(untitled)'),
    video_url: video.video_link ? String(video.video_link) : null,
    post_date: video.post_date ? String(video.post_date) : null,
    views: Number(video.impressions ?? 0),
    likes: Number(video.likes ?? 0),
    comments: Number(video.comments ?? 0),
    gmv: Number(video.affiliate_gmv ?? video.total_gmv ?? 0),
    orders: Number(video.orders ?? 0),
    items_sold: Number(video.items_sold ?? 0),
  };

  return <PostReviewClient meta={meta} />;
}
