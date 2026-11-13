import { reportGuard } from '@/lib/auth/client-report-access';
/**
 * PATCH /api/client-reports/[id] — edit a live report's notes and forward plan.
 *
 * 🚨 THERE WAS NO WAY TO CHANGE EITHER AFTER CREATION, and that had two costs.
 *
 * A refresh REBUILDS the snapshot and PRESERVES the notes, but notes quote
 * figures, so a refresh could leave a live page whose first sentence
 * contradicted its own headline. Seen on the Forchics August monthly: data
 * landed after generation, the refresh moved roster GMV 133,296 -> 137,508 and
 * store growth 4% -> 7%, and the preserved paragraph still said the old
 * numbers. Correcting it meant writing to the database by hand.
 *
 * And a plan could only ever be set at creation, so adding one to an existing
 * report meant minting a WHOLE NEW LINK. That is exactly how two live
 * Cata-Kor August monthlies came to exist.
 *
 * ⚠️ Deliberately NOT able to touch the snapshot, the token, viewed_at or
 * revoked_at. This edits the human commentary and nothing else; the figures
 * stay frozen, which is the promise the report page makes to the reader.
 *
 * ⚠️ Editing a report a client has ALREADY OPENED changes what they see on a
 * link they have. That is the point (a wrong number should be corrected) but
 * it is why this is a separate, explicit action rather than something a
 * refresh does on its own.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { loadCanonicalForReport, CanonicalReportUnavailableError } from '@/lib/data/client-report-canonical';
import { getWorkspaceScope, isBrandInScope } from '@/lib/auth/workspace-scope';

export const runtime = 'nodejs';

/** Same cap the create route applies, so an edit cannot exceed what a create
 *  would have accepted. */
const MAX_LEN = 2000;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const denied = reportGuard(scope, 'write');
  if (denied) return denied;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'Missing report id' }, { status: 400 });

  let body: { notes?: unknown; plan?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  /**
   * ⚠️ ABSENT AND EMPTY MEAN DIFFERENT THINGS. A key that is not in the body is
   * left alone; a key present but blank CLEARS the field. Without that
   * distinction there is no way to remove a plan that should not have been
   * written, and a caller sending only `notes` would silently wipe the plan.
   */
  const patch: { notes?: string | null; plan?: string | null } = {};

  if ('notes' in body) {
    if (typeof body.notes !== 'string') {
      return NextResponse.json({ error: '`notes` must be a string.' }, { status: 400 });
    }
    const v = body.notes.slice(0, MAX_LEN).trim();
    patch.notes = v || null;
  }
  if ('plan' in body) {
    if (typeof body.plan !== 'string') {
      return NextResponse.json({ error: '`plan` must be a string.' }, { status: 400 });
    }
    const v = body.plan.slice(0, MAX_LEN).trim();
    patch.plan = v || null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update. Send `notes`, `plan`, or both.' }, { status: 400 });
  }

  const supabase = await createAdminClient();

  // Scope check before the write, on the same rule the revoke route uses: a
  // brand-scoped manager must not be able to edit another brand's report by id.
  const { data: row, error: fetchErr } = await supabase
    .from('client_reports')
    .select('id,tenant_id,brand_slug,brand_name,period_start,period_end,period_label,report_type,snapshot,notes,plan,revoked_at')
    .eq('id', id).eq('tenant_id', scope.tenantId)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (
    row.brand_slug === 'all'
      ? scope.brandScope.kind !== 'all'
      : !isBrandInScope(scope, { slug: row.brand_slug })
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // A revoked link renders a notice instead of the report, so editing its copy
  // changes nothing anyone can read. Refuse rather than pretend it worked.
  if (row.revoked_at) {
    return NextResponse.json({ error: 'That link is revoked. Generate a new report instead.' }, { status: 409 });
  }

  try {
    const source = { ...row, tenant_id: scope.tenantId };
    const canonical = await loadCanonicalForReport(source, supabase);
    const base = canonical ?? row;
    // Recheck immediately before copying; a newly approved figure revision must
    // never be replaced by commentary copied from an older snapshot.
    const latest = await loadCanonicalForReport(source, supabase);
    if ((latest?.id ?? null) !== (canonical?.id ?? null)) {
      return NextResponse.json({ error: 'The approved report changed while saving. Reload it and retry your notes.' }, { status: 409 });
    }
    // Notes inherit financial approval precedence. A late commentary insert
    // cannot outrank a newer financial correction published concurrently.
    const approval = canonical ? {
      ...canonical.snapshot.reportCorrection,
      approvedAt: 'approvedAt' in canonical.snapshot.reportCorrection && typeof canonical.snapshot.reportCorrection.approvedAt === 'string'
        ? canonical.snapshot.reportCorrection.approvedAt : canonical.created_at,
    } : null;
    const { data: revision, error } = await supabase.from('client_reports').insert({
      tenant_id: scope.tenantId, brand_slug: base.brand_slug, brand_name: base.brand_name,
      period_start: base.period_start, period_end: base.period_end, period_label: base.period_label,
      report_type: base.report_type ?? 'performance', created_by: scope.email,
      notes: base.notes, plan: base.plan, ...patch,
      snapshot: { ...base.snapshot, ...(approval ? { reportCorrection: approval } : {}), revision: { previousReportId: base.id, createdAt: new Date().toISOString(), kind: 'copy' } },
    }).select('id,token').single();
    if (error || !revision) return NextResponse.json({ error: 'Report revision could not be created.' }, { status: 500 });
    return NextResponse.json({ ok: true, id: revision.id, token: revision.token, previousReportId: base.id, updated: Object.keys(patch) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The report revision could not be created.' }, { status: error instanceof CanonicalReportUnavailableError ? 503 : 500 });
  }
}
