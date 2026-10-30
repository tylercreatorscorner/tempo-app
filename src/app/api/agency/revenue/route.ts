import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';
import { canAccessAgency } from '@/lib/agency/access';
import { loadAgencyRevenue, revenuePeriod } from '@/lib/data/agency-revenue';

export const runtime = 'nodejs';
export const maxDuration = 60;
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!canAccessAgency(scope)) return reply({ error: 'Agency revenue is restricted to authorized leadership.' }, scope ? 403 : 401);
  let period: ReturnType<typeof revenuePeriod>;
  try { period = revenuePeriod(request.nextUrl.searchParams.get('month')); }
  catch { return reply({ error: 'Choose the current month or a past service month.' }, 400); }
  try { return reply(await loadAgencyRevenue(await createAdminClient(), scope.tenantId!, period)); }
  catch { return reply({ error: 'Complete agency revenue data could not be loaded. Please retry.' }, 503); }
}
