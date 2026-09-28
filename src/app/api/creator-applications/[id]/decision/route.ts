import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { applicationBrand, isAssignedApplicationManager } from '@/lib/applications/access';
import { deliverCreatorApplicationDecision } from '@/lib/applications/decision-notifications';

const bodySchema = z.object({
  expectedStatus: z.enum(['pending','needs_info']),
  decision: z.enum(['approved','declined','needs_info']),
  note: z.string().trim().max(2000).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (scope.impersonating) return NextResponse.json({ error: 'Exit view-as before deciding.' }, { status: 403 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid application.' }, { status: 400 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid decision.' }, { status: 400 });
  const db = await createAdminClient();
  const { data: application, error } = await db.from('creator_application_submissions')
    .select('id,brand_id').eq('id', id).eq('tenant_id', scope.tenantId).maybeSingle();
  if (error || !application) return NextResponse.json({ error: 'Application unavailable.' }, { status: 404 });
  const brand = await applicationBrand(scope, application.brand_id);
  if (!brand || !(await isAssignedApplicationManager(scope, brand))) {
    return NextResponse.json({ error: 'The current assigned manager must make this decision.' }, { status: 403 });
  }
  const common = { p_submission_id: id, p_tenant_id: scope.tenantId, p_actor_id: scope.userId,
    p_expected_status: parsed.data.expectedStatus, p_note: parsed.data.note ?? null };
  const { error: decisionError } = parsed.data.decision === 'approved'
    ? await db.rpc('approve_creator_application_with_hub', common)
    : await db.rpc('decide_creator_application', { ...common, p_new_status: parsed.data.decision });
  if (decisionError) return NextResponse.json({ error: parsed.data.decision === 'approved'
    ? 'Approval needs a published Hub with at least one required step. The decision was not saved; finish this brand’s Hub setup, then try again.'
    : 'The application or assignment changed. Reload and try again.' }, { status: 409 });
  let notificationStatus: 'sent' | 'pending' | 'failed' | null = null;
  if (parsed.data.decision !== 'needs_info') {
    const { data: notification } = await db.from('creator_application_notifications')
      .select('id').eq('submission_id', id).eq('tenant_id', scope.tenantId)
      .eq('kind', parsed.data.decision).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (notification) {
      notificationStatus = process.env.VERCEL_ENV === 'production'
        ? (await deliverCreatorApplicationDecision(notification.id)).status
        : 'pending';
    }
  }
  return NextResponse.json({ ok: true, notificationStatus });
}
