/**
 * GET /api/posts?brand=&start=&end=&managed=true|false
 *
 * Returns aggregated post-level data for the /posts page. Defaults to
 * managed creators only — pass managed=false to include unmanaged.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getPosts } from '@/lib/data/posts';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = request.nextUrl;
  const brand   = searchParams.get('brand');
  const start   = searchParams.get('start');
  const end     = searchParams.get('end');
  const managed = searchParams.get('managed');

  if (!start || !end) {
    return NextResponse.json({ error: 'Missing start/end' }, { status: 400 });
  }

  try {
    const result = await getPosts({
      brand: brand && brand !== 'all' ? brand : null,
      startDate: start,
      endDate: end,
      managedOnly: managed !== 'false',
    });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load posts';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
