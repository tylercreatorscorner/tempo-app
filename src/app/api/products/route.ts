/**
 * GET /api/products?brand=&start=&end=
 *
 * Returns aggregated product performance over a date range with WoW deltas.
 * Admin-only (matches the rest of the admin Products surface).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getProducts } from '@/lib/data/products';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = request.nextUrl;
  const brand = searchParams.get('brand');
  const start = searchParams.get('start');
  const end   = searchParams.get('end');
  if (!start || !end) {
    return NextResponse.json({ error: 'Missing start/end' }, { status: 400 });
  }

  try {
    const result = await getProducts({
      brand: brand && brand !== 'all' ? brand : null,
      startDate: start,
      endDate: end,
    });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load products';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
