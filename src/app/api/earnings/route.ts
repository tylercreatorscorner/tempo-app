/**
 * GET /api/earnings?month=YYYY-MM
 *
 * Returns monthly earnings breakdown — affiliate GMV by brand, marketing
 * GMV, commission, retainers, launch fees, total earnings, Tyler/Matt split.
 * Admin-only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { getEarnings } from '@/lib/data/earnings';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const month = request.nextUrl.searchParams.get('month');
  if (!month) return NextResponse.json({ error: 'Missing month' }, { status: 400 });

  // Optional payee filter — defaults to first team member (Tyler) when unset.
  const teamMemberId = request.nextUrl.searchParams.get('team_member_id') ?? undefined;

  // Managers see only their brands' earnings; owner/admin see all.
  const brandFilterSlugs = scope.brandScope.kind === 'scoped'
    ? scope.brandScope.brandSlugs
    : null;

  try {
    const result = await getEarnings(month, teamMemberId, brandFilterSlugs);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to compute earnings';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
