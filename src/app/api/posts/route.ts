/**
 * GET /api/posts?brand=&start=&end=&managed=true|false&review=all|unreviewed|reviewed-by-me|flagged
 *
 * Returns aggregated post-level data for the /posts page. Defaults to
 * managed creators only — pass managed=false to include unmanaged.
 *
 * The `review` param scopes the result to a review queue:
 *   - all (default)   → every post in the window
 *   - unreviewed      → posts with zero reviews
 *   - reviewed-by-me  → posts the current user has reviewed
 *   - flagged         → posts tagged off-brand or needs-rework
 *
 * Review aggregate counts (reviewedCount, unreviewedCount, etc.) in the
 * response totals always reflect the *unfiltered* in-scope set so the
 * pill counts stay stable as the user toggles between filters.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getPosts, type ReviewFilter } from '@/lib/data/posts';

export const runtime = 'nodejs';
export const maxDuration = 30;

const VALID_REVIEW_FILTERS: ReviewFilter[] = ['all', 'unreviewed', 'reviewed-by-me', 'flagged'];

export async function GET(request: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = request.nextUrl;
  const brand   = searchParams.get('brand');
  const start   = searchParams.get('start');
  const end     = searchParams.get('end');
  const managed = searchParams.get('managed');
  const reviewParam = searchParams.get('review');

  if (!start || !end) {
    return NextResponse.json({ error: 'Missing start/end' }, { status: 400 });
  }

  const reviewFilter: ReviewFilter = (VALID_REVIEW_FILTERS as string[]).includes(reviewParam ?? '')
    ? (reviewParam as ReviewFilter)
    : 'all';

  try {
    const result = await getPosts({
      brand: brand && brand !== 'all' ? brand : null,
      startDate: start,
      endDate: end,
      managedOnly: managed !== 'false',
      currentUserId: profile.user_id,
      reviewFilter,
    });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load posts';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
