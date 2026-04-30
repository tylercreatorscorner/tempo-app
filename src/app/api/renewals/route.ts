/**
 * GET /api/renewals?brand=&product=
 *
 * Returns categorized renewal data (Cut / Watch / Keep + Stars) for retainer
 * creators. Powers the Renewals tab on /roster.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getRenewals } from '@/lib/data/renewals';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = request.nextUrl;
  const brand   = searchParams.get('brand');
  const product = searchParams.get('product');

  try {
    const result = await getRenewals({ brand, product });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load renewals';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
