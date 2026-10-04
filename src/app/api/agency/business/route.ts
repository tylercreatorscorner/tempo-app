import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';
import { canAccessAgency } from '@/lib/agency/access';
import { agencyMonthBounds, AgencyValidationError, validateClientSaveInput } from '@/lib/agency/model';

export const runtime = 'nodejs';
export const maxDuration = 60;
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const notInstalled = (error: { code?: string } | null) => Boolean(error && ['PGRST202', '42883', '42P01'].includes(error.code ?? ''));
function currentMonth() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${parts.find(part => part.type === 'year')!.value}-${parts.find(part => part.type === 'month')!.value}`;
}
function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function GET(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!canAccessAgency(scope)) return reply({ error: 'Agency access is restricted to authorized leadership.' }, scope ? 403 : 401);
  const month = request.nextUrl.searchParams.get('month') ?? '';
  if (!/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(month) || month >= currentMonth()) return reply({ error: 'Choose a completed reporting month.' }, 400);
  const period = agencyMonthBounds(month);
  const priorDate = new Date(`${month}-01T00:00:00Z`);
  priorDate.setUTCMonth(priorDate.getUTCMonth() - 1);
  const prior = agencyMonthBounds(priorDate.toISOString().slice(0, 7));
  try {
    const db = await createAdminClient();
    const [brandResult, clientResult, performanceResult] = await Promise.all([
      db.from('brands_v2').select('id,slug,name,display_name,logo_url,is_archived', { count: 'exact' })
        .eq('tenant_id', scope.tenantId).is('parent_brand_id', null).order('name').limit(10000),
      db.rpc('agency_business_list_clients', { p_tenant_id: scope.tenantId }),
      db.rpc('agency_business_month_performance', { p_tenant_id: scope.tenantId, p_month: period.start }),
    ]);
    if (brandResult.error || brandResult.count !== (brandResult.data ?? []).length) return reply({ error: 'Could not load the complete agency brand directory.' }, 503);
    if ((clientResult.error && !notInstalled(clientResult.error)) || (performanceResult.error && !notInstalled(performanceResult.error))) return reply({ error: 'Agency records could not be loaded. Please try again.' }, 503);
    const brands = (brandResult.data ?? []).map(row => ({ id: row.id, slug: row.slug, name: row.display_name || row.name, logoUrl: row.logo_url, archived: Boolean(row.is_archived) }));
    const brandIds = new Set(brands.map(brand => brand.id));
    const performance = (performanceResult.data ?? []).filter((row: { brand_id: string }) => brandIds.has(row.brand_id)).map((row: { brand_id: string; managed_gmv: unknown; prior_managed_gmv: unknown; complete: boolean; prior_complete: boolean; recorded_through: string | null }) => ({
      brandId: row.brand_id, managedGmv: numeric(row.managed_gmv), priorManagedGmv: numeric(row.prior_managed_gmv),
      complete: row.complete === true, priorComplete: row.prior_complete === true, recordedThrough: row.recorded_through,
    }));
    return reply({ month, periodStart: period.start, periodEnd: period.end, priorPeriodStart: prior.start, priorPeriodEnd: prior.end,
      clients: clientResult.error ? [] : clientResult.data ?? [], brands, performance,
      storageReady: !clientResult.error && !performanceResult.error, canEdit: canAccessAgency(scope, true) });
  } catch { return reply({ error: 'Agency workspace could not be loaded. Please try again.' }, 503); }
}

export async function POST(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!canAccessAgency(scope, true)) return reply({ error: 'You do not have permission to configure agency agreements.' }, scope ? 403 : 401);
  if (request.headers.get('origin') !== request.nextUrl.origin) return reply({ error: 'Invalid request origin.' }, 403);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply({ error: 'Send a JSON agreement.' }, 415);
  try {
    const raw = await request.text();
    if (raw.length > 100000) return reply({ error: 'Agreement is too large.' }, 413);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return reply({ error: 'Invalid agreement JSON.' }, 400); }
    const payload = validateClientSaveInput(parsed);
    const db = await createAdminClient();
    const { data, error } = await db.rpc('agency_business_save_client', { p_tenant_id: scope.tenantId, p_actor_id: scope.userId, p_payload: payload });
    if (error) {
      if (notInstalled(error)) return reply({ error: 'Client agreements are not available yet.' }, 503);
      if (error.message.includes('Agency client changed')) return reply({ error: 'This client was updated by someone else. Review the latest version before saving.' }, 409);
      if (error.message.includes('Agency brand already belongs')) return reply({ error: 'A selected brand is already linked to another client. Refresh the directory before changing its assignment.' }, 409);
      if (error.message.startsWith('Invalid agency')) return reply({ error: 'The agreement could not be saved. Check its brands, dates, and terms.' }, 400);
      return reply({ error: 'Agreement could not be saved. Please try again.' }, 503);
    }
    return reply(data);
  } catch (error) {
    if (error instanceof AgencyValidationError) return reply({ error: error.message }, 400);
    return reply({ error: 'Agreement could not be saved. Please try again.' }, 503);
  }
}
