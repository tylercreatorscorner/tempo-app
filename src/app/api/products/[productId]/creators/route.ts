/**
 * GET /api/products/[productId]/creators?brand=&start=&end=
 *
 * Returns the creator breakdown for one product over a date range — top
 * creators by GMV, with their orders / items / video count for the period.
 * Lazy-loaded by the products table when the user expands a product row.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getProductCreatorBreakdown } from '@/lib/data/products';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { productId } = await params;
  const { searchParams } = request.nextUrl;
  const brand = searchParams.get('brand') || '';
  const start = searchParams.get('start');
  const end   = searchParams.get('end');
  if (!brand || !start || !end) {
    return NextResponse.json({ error: 'Missing brand/start/end' }, { status: 400 });
  }

  try {
    const creators = await getProductCreatorBreakdown({
      productId, brand, startDate: start, endDate: end,
    });
    return NextResponse.json({ creators });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load creator breakdown';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
