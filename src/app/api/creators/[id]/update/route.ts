import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const creatorId = id; // UUID string now

  const body = await request.json();

  // Fields that go to creators_v2. These belong to the PERSON and are shared
  // across every brand they work, which is correct: one human, one phone number.
  const creatorFields = ['real_name', 'email', 'phone', 'notes'];
  /**
   * Fields that go to creator_brands, which holds ONE ROW PER CREATOR PER BRAND.
   *
   * ⚠️ These are per-brand by definition: a creator can be on a retainer for one
   * brand and affiliate-only on another. Writing them without a brand filter
   * overwrites every brand the creator works with a single value.
   *
   * That is exactly what this route used to do. The update was filtered on
   * creator_id and tenant_id only, and the brand narrowing existed solely as a
   * MANAGER permission check (`if (scopedBrandIds)`), so an admin, who has no
   * brandScope, silently wrote to all of them. Reported by the VA as edits
   * "mirrored across all of the creator's brands"; 34 multi-brand creators carry
   * the signature of it (every brand row written in the same instant).
   */
  const brandFields = ['role', 'status', 'retainer', 'monthly_post_requirement', 'retainer_start_date'];

  const creatorUpdates: Record<string, unknown> = {};
  const brandUpdates: Record<string, unknown> = {};

  for (const field of creatorFields) {
    if (field in body) creatorUpdates[field] = body[field];
  }
  for (const field of brandFields) {
    if (field in body) brandUpdates[field] = body[field];
  }
  // A finance-blind user must not set retainers. Drop the field (keep the rest
  // of the edit): their UI is served retainer-as-absence, so a save would
  // otherwise round-trip a destructive $0 over the real figure.
  // Creator cost, not agency finance. The creator page now DISPLAYS the
  // retainer, so a write path that strips it would make read and write disagree.
  if (!scope.canViewCreatorCost) delete brandUpdates.retainer;

  if (Object.keys(creatorUpdates).length === 0 && Object.keys(brandUpdates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  /**
   * A per-brand edit must name its brand. Fails LOUD rather than defaulting to
   * "all of them": silently widening the blast radius of a save is the bug this
   * replaces, and a caller that forgot the brand wants an error, not a
   * portfolio-wide overwrite.
   */
  const targetBrandId: string | null =
    typeof body.brand_id === 'string' && body.brand_id.trim() ? body.brand_id.trim() : null;
  if (Object.keys(brandUpdates).length > 0 && !targetBrandId) {
    return NextResponse.json(
      { error: 'brand_id is required when changing role, status or retainer, because those are set per brand.' },
      { status: 400 },
    );
  }

  const supabase = await createAdminClient();

  // The creator must belong to the caller's tenant (the service-role client
  // bypasses RLS, so this is enforced explicitly).
  const { data: creatorRow } = await supabase
    .from('creators_v2')
    .select('id')
    .eq('id', creatorId)
    .eq('tenant_id', scope.tenantId)
    .maybeSingle();
  if (!creatorRow) return NextResponse.json({ error: 'Creator not found' }, { status: 404 });

  // Scoped (manager): the creator must be linked to at least one of the
  // caller's brands, and brand-relationship edits are limited to those brands.
  const scopedBrandIds =
    scope.brandScope.kind === 'scoped' ? scope.brandScope.brandIds : null;
  if (scopedBrandIds) {
    const { data: link } = await supabase
      .from('creator_brands')
      .select('id')
      .eq('creator_id', creatorId)
      .in('brand_id', scopedBrandIds.length ? scopedBrandIds : ['00000000-0000-0000-0000-000000000000'])
      .limit(1);
    if (!link || link.length === 0) {
      return NextResponse.json(
        { error: 'Forbidden: creator not in your brands' }, { status: 403 });
    }
  }

  if (Object.keys(creatorUpdates).length > 0) {
    const { error } = await supabase
      .from('creators_v2')
      .update(creatorUpdates)
      .eq('id', creatorId)
      .eq('tenant_id', scope.tenantId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (Object.keys(brandUpdates).length > 0) {
    // A manager may only touch their own brands, so the named brand has to be
    // one of them. Checked before the write rather than relying on the filter
    // to quietly match nothing.
    if (scopedBrandIds && !scopedBrandIds.includes(targetBrandId!)) {
      return NextResponse.json(
        { error: 'Forbidden: that brand is not in your scope' }, { status: 403 });
    }

    const { error } = await supabase
      .from('creator_brands')
      // Stamped so creator_brand_audit_log records WHO, not just what. Added
      // last so it cannot be what makes brandUpdates non-empty above.
      .update({ ...brandUpdates, updated_by: scope.email })
      .eq('creator_id', creatorId)
      .eq('tenant_id', scope.tenantId)
      // THE FIX: one brand, never all of them.
      .eq('brand_id', targetBrandId!);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
