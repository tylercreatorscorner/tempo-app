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
  const brandFields = ['role', 'status'];

  const creatorUpdates: Record<string, unknown> = {};
  const brandUpdates: Record<string, unknown> = {};

  for (const field of creatorFields) {
    if (field in body) creatorUpdates[field] = body[field];
  }
  for (const field of brandFields) {
    if (field in body) brandUpdates[field] = body[field];
  }
  /**
   * retainer, monthly_post_requirement and retainer_start_date USED to be
   * accepted here and written to creator_brands. They are gone deliberately.
   *
   * managed_creators is the source of truth for creator cost (the dashboard,
   * earnings and roster all read it; creator_brands.retainer is a separate,
   * incompletely backfilled field that nothing financial consults). So a
   * retainer sent here would have saved successfully and changed nothing
   * anybody looks at, which is worse than refusing it. The roster row owns
   * those fields, via /api/roster/[id], where they are already per-contract and
   * change-logged.
   *
   * The finance gate that used to sit here went with them: there is no longer a
   * money field on this route to gate.
   */

  /**
   * Notes are the awkward one, because there are TWO of them at different
   * grains and both are real:
   *   managed_creators.notes — PER BRAND (1,082 rows populated, and 209
   *                            creators already carry different notes on
   *                            different brands)
   *   creators_v2.notes      — PER PERSON (610 rows populated)
   * The panel only ever wrote the person-level one, so a note meant for one
   * brand showed up under all of them. `brand_notes` writes the per-brand one;
   * `notes` keeps writing the shared one. Both are kept: repointing the single
   * box would have orphaned 610 existing notes.
   */
  const brandNotes: string | null =
    'brand_notes' in body ? ((body.brand_notes as string) || null) : undefined as unknown as null;
  const hasBrandNotes = 'brand_notes' in body;

  if (Object.keys(creatorUpdates).length === 0 && Object.keys(brandUpdates).length === 0
      && !hasBrandNotes) {
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
  if ((Object.keys(brandUpdates).length > 0 || hasBrandNotes) && !targetBrandId) {
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

  /**
   * Per-brand notes live on the managed_creators contract row, which is keyed by
   * brand SLUG rather than uuid, so the id is resolved first. Scoped to the one
   * non-archived contract for this creator on this brand: the unique index
   * (creator_id, brand) where archived_at is null guarantees at most one.
   */
  if (hasBrandNotes && targetBrandId) {
    const { data: brandRow } = await supabase
      .from('brands_v2')
      .select('slug')
      .eq('id', targetBrandId)
      .maybeSingle();
    const slug = (brandRow as { slug?: string } | null)?.slug;
    if (slug) {
      const { error } = await supabase
        .from('managed_creators')
        // updated_by stamped so trg_log_managed_creator_change attributes the
        // note to a person rather than inheriting the previous actor.
        .update({ notes: brandNotes, updated_by: scope.email })
        .eq('creator_id', creatorId)
        .eq('brand', slug)
        .is('archived_at', null);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ success: true });
}
