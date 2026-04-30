/**
 * GET /api/earnings?month=YYYY-MM
 *
 * Returns monthly earnings breakdown — affiliate GMV by brand, marketing
 * GMV, commission, retainers, launch fees, total earnings, Tyler/Matt split.
 * Admin-only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getEarnings } from '@/lib/data/earnings';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const month = request.nextUrl.searchParams.get('month');
  if (!month) return NextResponse.json({ error: 'Missing month' }, { status: 400 });

  try {
    const result = await getEarnings(month);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to compute earnings';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
