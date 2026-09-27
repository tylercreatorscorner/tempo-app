import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { can } from '@/lib/auth/permissions';
import { createAdminClient } from '@/lib/supabase/server';
import { applicationBrand, isAssignedApplicationManager } from '@/lib/applications/access';
import { DEFAULT_QUESTIONS, questionsSchema } from '@/lib/applications/schema';

const requestSchema = z.object({
  brandId: z.uuid(),
  title: z.string().trim().min(3).max(100).default('Creator application'),
  introduction: z.string().trim().max(600).default(''),
  questions: questionsSchema.default(DEFAULT_QUESTIONS),
  active: z.boolean().default(true),
});

export async function POST(request: Request) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (scope.impersonating || !can(scope, 'roster', 'write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Check the form fields.' }, { status: 400 });
  const brand = await applicationBrand(scope, parsed.data.brandId);
  if (!brand) return NextResponse.json({ error: 'Brand unavailable.' }, { status: 403 });
  const assigned = await isAssignedApplicationManager(scope, brand);
  if (!assigned && !['owner','admin'].includes(scope.role)) return NextResponse.json({ error: 'Only the assigned manager can configure this form.' }, { status: 403 });

  const db = await createAdminClient();
  const { data: existing, error: existingError } = await db.from('creator_application_forms')
    .select('id,version').eq('tenant_id', scope.tenantId).eq('brand_id', brand.id).maybeSingle();
  if (existingError) return NextResponse.json({ error: 'Could not read the application form.' }, { status: 500 });
  const values = {
    title: parsed.data.title, introduction: parsed.data.introduction,
    questions: parsed.data.questions, active: parsed.data.active, updated_at: new Date().toISOString(),
  };
  const result = existing
    ? await db.from('creator_application_forms').update({ ...values, version: existing.version + 1 })
        .eq('id', existing.id).eq('tenant_id', scope.tenantId).eq('version', existing.version).select('id,version').single()
    : await db.from('creator_application_forms').insert({ ...values, tenant_id: scope.tenantId,
        brand_id: brand.id, created_by: scope.userId }).select('id,version').single();
  if (result.error || !result.data) return NextResponse.json({ error: 'Could not save. Reload and try again.' }, { status: 409 });
  return NextResponse.json({ id: result.data.id, version: result.data.version,
    url: `/apply/${result.data.id}` });
}
