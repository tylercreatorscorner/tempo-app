import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';
import { getActiveConnection } from '@/lib/tiktok/connections';
import { searchSampleApplications, sampleFulfillments, SAMPLE_STATUSES } from '@/lib/tiktok/samples';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope || scope.impersonating || !['owner', 'admin'].includes(scope.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const params = request.nextUrl.searchParams;
  const brand = params.get('brand') ?? '';
  const status = params.get('status') ?? '';
  const username = params.get('username') ?? '';
  const pageToken = params.get('pageToken') ?? '';
  const applicationId = params.get('applicationId');
  const format = params.get('format') ?? 'VIDEO';
  if (!brand || brand.length > 100 || username.length > 100 || pageToken.length > 4096 ||
      (status && !(SAMPLE_STATUSES as readonly string[]).includes(status)) ||
      (applicationId !== null && !/^\d{1,30}$/.test(applicationId)) || !['VIDEO', 'LIVE'].includes(format)) {
    return NextResponse.json({ error: 'Invalid sample filters' }, { status: 400 });
  }
  const admin = await createAdminClient();
  // A role alone is not authority to access another workspace's seller token.
  // Query the globally keyed shop slug and fail closed on ambiguity.
  const { data: ownedBrand, error } = await admin.from('brands_v2')
    .select('tenant_id, is_umbrella').eq('slug', brand).maybeSingle();
  if (error || !ownedBrand || ownedBrand.tenant_id !== scope.tenantId || ownedBrand.is_umbrella) {
    return NextResponse.json({ error: 'Brand unavailable' }, { status: 404 });
  }
  try {
    const connection = await getActiveConnection(brand);
    if (!connection.ok) return NextResponse.json({ error: connection.message }, { status: 409 });
    const result = applicationId
      ? { fulfillments: await sampleFulfillments(connection.client, applicationId, format as 'VIDEO' | 'LIVE') }
      : await searchSampleApplications(connection.client, { status, username, pageToken });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    // Vendor errors can contain request context; don't echo them to the browser.
    return NextResponse.json({ error: 'TikTok sample data could not be loaded. Check the connection and sample-read permission, then retry.' }, { status: 502 });
  }
}
