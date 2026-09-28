import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { can } from '@/lib/auth/permissions';
import { applicationBrand, isAssignedApplicationManager } from '@/lib/applications/access';
import { deliverCreatorApplicationDecision } from '@/lib/applications/decision-notifications';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.VERCEL_ENV !== 'production') {
    return NextResponse.json({ error: 'Decision delivery is enabled only in production.' }, { status: 409 });
  }
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (scope.impersonating || !can(scope, 'roster', 'write')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: 'Application unavailable.' }, { status: 404 });
  const db = await createAdminClient();
  const { data: application } = await db.from('creator_application_submissions')
    .select('brand_id,status').eq('id', id).eq('tenant_id', scope.tenantId).maybeSingle();
  if (!application || !['approved', 'declined'].includes(application.status)) {
    return NextResponse.json({ error: 'Application unavailable.' }, { status: 404 });
  }
  const brand = await applicationBrand(scope, application.brand_id);
  if (!brand || (!(await isAssignedApplicationManager(scope, brand)) && !['owner', 'admin'].includes(scope.role))) {
    return NextResponse.json({ error: 'Only this brand’s assigned manager can send the decision.' }, { status: 403 });
  }
  const { data: notification } = await db.from('creator_application_notifications')
    .select('id').eq('tenant_id', scope.tenantId).eq('submission_id', id)
    .eq('kind', application.status).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!notification) return NextResponse.json({ error: 'Decision message unavailable.' }, { status: 404 });
  const result = await deliverCreatorApplicationDecision(notification.id);
  return NextResponse.json({ status: result.status });
}
