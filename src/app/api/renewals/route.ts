/**
 * GET /api/renewals?brand=&product=
 *
 * Returns categorized renewal data (Cut / Watch / Keep + Stars) for retainer
 * creators. Powers the Renewals tab on /roster.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { can } from '@/lib/auth/permissions';
import { getRenewals, RenewalsAccessError } from '@/lib/data/renewals';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope || !scope.canViewCreatorCost || !can(scope,'roster','read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = request.nextUrl;
  const brand   = searchParams.get('brand');
  const product = searchParams.get('product');

  try {
    const result = await getRenewals({ scope, brand, product });
    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof RenewalsAccessError ? err.message : 'Renewal review could not be loaded. Please retry.' }, { status: err instanceof RenewalsAccessError ? 403 : 500 });
  }
}
