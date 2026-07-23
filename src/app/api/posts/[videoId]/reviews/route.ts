/**
 * Video reviews — list / upsert / delete.
 *
 * GET    /api/posts/[videoId]/reviews?brand=catakor
 * POST   /api/posts/[videoId]/reviews     (body: { brand, rating?, notes?, tags? })
 *   Upsert by (video_id, brand, reviewer_user_id) — each user has at most
 *   one review per video.
 * DELETE /api/posts/[videoId]/reviews?brand=catakor
 *   Delete the current user's review for this video.
 *
 * All routes admin-gated.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope, type WorkspaceScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';
import { REVIEW_TAGS } from '@/lib/data/review-tags';

// Only known tag slugs may be stored — arbitrary strings would silently
// detach from the label mapping and the Flagged-queue slug matching.
const VALID_TAG_SLUGS = new Set<string>(REVIEW_TAGS.map(t => t.slug));

/** Managers may only review posts for brands in their access. */
function brandDenied(scope: WorkspaceScope, brand: string): NextResponse | null {
  if (
    scope.brandScope.kind === 'scoped' &&
    !scope.brandScope.brandSlugs.includes(brand)
  ) {
    return NextResponse.json({ error: 'Forbidden: brand not in your access' }, { status: 403 });
  }
  return null;
}

export const runtime = 'nodejs';

const TAG_MAX = 10;
const NOTES_MAX = 4000;

interface UpsertBody {
  brand?: string;
  rating?: number | null;
  notes?: string | null;
  tags?: string[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { videoId } = await params;
  const brand = request.nextUrl.searchParams.get('brand');
  if (!brand) return NextResponse.json({ error: 'Missing brand' }, { status: 400 });
  const denied = brandDenied(scope, brand);
  if (denied) return denied;

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from('video_reviews')
    .select('id, reviewer_user_id, reviewer_name, rating, notes, tags, created_at, updated_at')
    .eq('video_id', videoId)
    .eq('brand', brand)
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    reviews: data ?? [],
    currentUserId: scope.userId,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { videoId } = await params;
  let body: UpsertBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { brand, rating, notes, tags } = body;
  if (!brand) return NextResponse.json({ error: 'Missing brand' }, { status: 400 });
  const denied = brandDenied(scope, brand);
  if (denied) return denied;

  // Validation
  if (rating !== undefined && rating !== null) {
    if (typeof rating !== 'number' || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return NextResponse.json({ error: 'rating must be integer 1-5 or null' }, { status: 400 });
    }
  }
  if (notes !== undefined && notes !== null && (typeof notes !== 'string' || notes.length > NOTES_MAX)) {
    return NextResponse.json({ error: `notes must be string under ${NOTES_MAX} chars` }, { status: 400 });
  }
  let safeTags: string[] | undefined;
  if (tags !== undefined) {
    if (!Array.isArray(tags) || tags.length > TAG_MAX) {
      return NextResponse.json({ error: `tags must be array of ≤${TAG_MAX} strings` }, { status: 400 });
    }
    safeTags = tags.filter(t => typeof t === 'string' && VALID_TAG_SLUGS.has(t)).slice(0, TAG_MAX);
  }

  const admin = await createAdminClient();

  // The (video_id, brand) pair must exist — otherwise reviews could be
  // attached to arbitrary strings and never surface anywhere.
  const { data: videoRow, error: videoErr } = await admin
    .from('videos')
    .select('video_id')
    .eq('video_id', videoId)
    .eq('brand', brand)
    .limit(1)
    .maybeSingle();
  if (videoErr) return NextResponse.json({ error: videoErr.message }, { status: 500 });
  if (!videoRow) return NextResponse.json({ error: 'Video not found for this brand' }, { status: 404 });

  const { data, error } = await admin
    .from('video_reviews')
    .upsert({
      video_id: videoId,
      brand,
      reviewer_user_id: scope.userId,
      reviewer_name: scope.name ?? scope.email ?? 'unknown',
      rating: rating ?? null,
      notes: notes ?? null,
      tags: safeTags ?? [],
    }, { onConflict: 'video_id,brand,reviewer_user_id' })
    .select('id, reviewer_user_id, reviewer_name, rating, notes, tags, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ review: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { videoId } = await params;
  const brand = request.nextUrl.searchParams.get('brand');
  if (!brand) return NextResponse.json({ error: 'Missing brand' }, { status: 400 });
  const denied = brandDenied(scope, brand);
  if (denied) return denied;

  const admin = await createAdminClient();
  const { error } = await admin
    .from('video_reviews')
    .delete()
    .eq('video_id', videoId)
    .eq('brand', brand)
    .eq('reviewer_user_id', scope.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
