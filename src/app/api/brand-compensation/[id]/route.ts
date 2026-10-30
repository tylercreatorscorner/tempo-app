import { NextRequest, NextResponse } from 'next/server';
import { getFinanceAccess } from '@/lib/finance/access';
import { getBrandRegistry } from '@/lib/data/brand-registry';
import { compensationPatch, isEffectiveMonth, saveCompensation } from '@/lib/finance/save-compensation';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

async function write(req: NextRequest, context: Context, active: boolean) {
  const finance = await getFinanceAccess('earnings', 'configure', true);
  if (finance instanceof NextResponse) return finance;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { effectiveMonth } = body;
  if (!isEffectiveMonth(effectiveMonth)) return NextResponse.json({ error: 'A valid effectiveMonth (YYYY-MM) is required.' }, { status: 400 });
  let patch: Record<string, unknown>;
  try { patch = active ? compensationPatch(body) : {}; } catch (cause) { return NextResponse.json({ error: (cause as Error).message }, { status: 400 }); }
  if (active && !Object.keys(patch).length) return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  const { id } = await context.params;
  const { data: current, error } = await finance.admin.from('brand_compensation')
    .select('brand, team_member_id').eq('id', id).eq('tenant_id', finance.scope.tenantId).in('brand', finance.brandSlugs).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: 'Arrangement unavailable.' }, { status: 404 });
  try {
    const rows = await saveCompensation(finance.admin, {
      tenantId: finance.scope.tenantId!, actorId: finance.scope.userId, brand: current.brand,
      teamMemberId: current.team_member_id, effectiveMonth, patch, active,
      permittedSlugs: finance.brandSlugs, registry: await getBrandRegistry(),
      source: { endpoint: 'brand-compensation/id', action: active ? 'update' : 'deactivate' },
    });
    return NextResponse.json(active ? { arrangement: rows[0] } : { ok: true, effectiveMonth });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Compensation save failed.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: Context) { return write(req, context, true); }
export async function DELETE(req: NextRequest, context: Context) { return write(req, context, false); }
