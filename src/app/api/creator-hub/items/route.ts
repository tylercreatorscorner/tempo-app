import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { can } from '@/lib/auth/permissions';
import { createAdminClient } from '@/lib/supabase/server';
import { applicationBrand, isAssignedApplicationManager } from '@/lib/applications/access';

const payloadSchema = z.object({
  brandId: z.uuid(),
  itemId: z.uuid().nullable().default(null),
  expectedVersion: z.number().int().positive().nullable().default(null),
  kind: z.enum(['video', 'reading', 'link', 'acknowledgement']),
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().max(5000).default(''),
  url: z.url().startsWith('https://').max(2000).nullable().default(null),
  required: z.boolean(),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
}).superRefine((value, context) => {
  if ((value.kind === 'video' || value.kind === 'link') && !value.url) {
    context.addIssue({ code: 'custom', message: 'A secure URL is required.', path: ['url'] });
  }
  if ((value.kind === 'reading' || value.kind === 'acknowledgement') && !value.body) {
    context.addIssue({ code: 'custom', message: 'Content is required.', path: ['body'] });
  }
  if ((value.itemId === null) !== (value.expectedVersion === null)) {
    context.addIssue({ code: 'custom', message: 'Item ID and expected version must be supplied together.' });
  }
});

export async function POST(request: Request) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (scope.impersonating || !can(scope, 'roster', 'write')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Check the Hub item fields.' }, { status: 400 });
  const brand = await applicationBrand(scope, parsed.data.brandId);
  if (!brand) return NextResponse.json({ error: 'Brand unavailable.' }, { status: 403 });
  const assigned = await isAssignedApplicationManager(scope, brand);
  if (!assigned && !['owner', 'admin'].includes(scope.role)) {
    return NextResponse.json({ error: 'Only the assigned manager can configure this brand.' }, { status: 403 });
  }
  const db = await createAdminClient();
  const { data, error } = await db.rpc('publish_creator_hub_item', {
    p_tenant_id: scope.tenantId,
    p_brand_id: brand.id,
    p_item_id: parsed.data.itemId,
    p_kind: parsed.data.kind,
    p_title: parsed.data.title,
    p_content: { body: parsed.data.body, url: parsed.data.url },
    p_required: parsed.data.required,
    p_active: parsed.data.active,
    p_sort_order: parsed.data.sortOrder,
    p_expected_version: parsed.data.expectedVersion,
  });
  if (error) return NextResponse.json({ error: 'Hub item changed or could not be saved. Reload and try again.' }, { status: 409 });
  return NextResponse.json({ ok: true, item: Array.isArray(data) ? data[0] : data });
}
