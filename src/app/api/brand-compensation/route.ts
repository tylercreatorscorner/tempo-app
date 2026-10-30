import { NextRequest, NextResponse } from 'next/server';
import { getFinanceAccess } from '@/lib/finance/access';
import { getBrandRegistry } from '@/lib/data/brand-registry';
import { readCompensationForMonth, type CompensationFinancials } from '@/lib/finance/compensation-history';
import { compensationPatch, isEffectiveMonth, saveCompensation } from '@/lib/finance/save-compensation';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const finance = await getFinanceAccess('earnings', 'read', true);
  if (finance instanceof NextResponse) return finance;
  const brand = req.nextUrl.searchParams.get('brand');
  const payeeId = req.nextUrl.searchParams.get('team_member_id');
  const month = req.nextUrl.searchParams.get('month');
  if (!isEffectiveMonth(month)) return NextResponse.json({ error: 'A valid month (YYYY-MM) is required.' }, { status: 400 });
  if (brand && !finance.brandSlugs.includes(brand)) return NextResponse.json({ error: 'Brand unavailable.' }, { status: 403 });
  const slugs = brand ? [brand] : finance.brandSlugs;
  let query = finance.admin.from('team_members').select('id, name, email, is_archived').eq('tenant_id', finance.scope.tenantId);
  if (payeeId) query = query.eq('id', payeeId);
  const { data: payees, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (payeeId && !payees?.length) return NextResponse.json({ error: 'Payee unavailable.' }, { status: 403 });
  let identitiesQuery = finance.admin.from('brand_compensation').select('id, brand, team_member_id')
    .eq('tenant_id', finance.scope.tenantId).in('brand', slugs);
  if (payeeId) identitiesQuery = identitiesQuery.eq('team_member_id', payeeId);
  const { data: identities, error: identityError } = await identitiesQuery;
  if (identityError) return NextResponse.json({ error: identityError.message }, { status: 500 });
  const ids = new Map((identities ?? []).map(row => [`${row.team_member_id}:${row.brand}`, row.id]));
  try {
    const arrangements = (await Promise.all((payees ?? []).map(async payee => {
      const rows = await readCompensationForMonth(finance.admin, finance.scope.tenantId!, payee.id, slugs, month);
      // Captured legacy defaults are calculation compatibility, not configured
      // arrangements. Keep blank cells distinct from explicit zero terms.
      return rows.filter(row => row.active && (row.effective_month !== null || ['retainer', 'commission_rate', 'revenue_share_rate', 'marketing_commission_rate', 'product_retainer_amount', 'launch_fee', 'compensation_model'].some(field => row[field as keyof CompensationFinancials] != null)))
        .map(row => ({ ...row, id: ids.get(`${payee.id}:${row.brand}`) ?? null, team_member_id: payee.id, team_members: payee }));
    }))).flat();
    return NextResponse.json({ arrangements, month });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Compensation read failed.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const finance = await getFinanceAccess('earnings', 'configure', true);
  if (finance instanceof NextResponse) return finance;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { brand, team_member_id: payeeId, effectiveMonth } = body;
  if (typeof brand !== 'string' || !finance.brandSlugs.includes(brand)) return NextResponse.json({ error: 'Brand unavailable.' }, { status: 403 });
  if (typeof payeeId !== 'string') return NextResponse.json({ error: 'team_member_id is required.' }, { status: 400 });
  if (!isEffectiveMonth(effectiveMonth)) return NextResponse.json({ error: 'A valid effectiveMonth (YYYY-MM) is required.' }, { status: 400 });
  let patch: Record<string, unknown>;
  try { patch = compensationPatch(body); } catch (cause) { return NextResponse.json({ error: String((cause as Error).message) }, { status: 400 }); }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'No compensation fields supplied.' }, { status: 400 });
  const { data: payee, error } = await finance.admin.from('team_members').select('id').eq('id', payeeId).eq('tenant_id', finance.scope.tenantId).maybeSingle();
  if (error || !payee) return NextResponse.json({ error: 'Payee unavailable.' }, { status: 403 });
  try {
    const rows = await saveCompensation(finance.admin, {
      tenantId: finance.scope.tenantId!, actorId: finance.scope.userId, brand, teamMemberId: payeeId,
      effectiveMonth, patch, permittedSlugs: finance.brandSlugs, registry: await getBrandRegistry(),
      source: { endpoint: 'brand-compensation' },
    });
    return NextResponse.json({ arrangement: rows[0], arrangements: rows }, { status: 201 });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Compensation save failed.' }, { status: 500 });
  }
}
