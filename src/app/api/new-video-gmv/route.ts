import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope, isBrandInScope } from '@/lib/auth/workspace-scope';
import { getDataAnchorDate } from '@/lib/data/data-anchor';
import { resolveDateRange } from '@/lib/data/date-utils';
import { validVideoRange } from '@/lib/data/new-video-gmv';

export const maxDuration = 40;

export async function GET(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const params = request.nextUrl.searchParams;
  const brand = params.get('brand');
  const range = params.get('range') ?? 'last7';
  const start = params.get('start') ?? '';
  const end = params.get('end') ?? '';
  const postStart = params.get('postStart') ?? '';
  const postEnd = params.get('postEnd') ?? '';
  if ((postStart || postEnd) && !validVideoRange(postStart,postEnd)) {
    return NextResponse.json({ error: 'Choose a complete, valid video posting range up to 400 days apart.' }, { status: 400 });
  }
  if (range === 'custom' && !validVideoRange(start,end)) {
    return NextResponse.json({ error: 'Choose valid dates up to 400 days apart.' }, { status: 400 });
  }
  try {
    const db = await createAdminClient();
    const { data: brands, error: brandError } = await db.from('brands_v2')
      .select('id,slug,tenant_id').eq('tenant_id',scope.tenantId)
      .eq('is_archived',false).is('parent_brand_id',null);
    if (brandError) throw brandError;
    const allowed = (brands ?? []).filter(b => isBrandInScope(scope,b));
    if (brand && !allowed.some(b => b.slug===brand)) {
      return NextResponse.json({ error: 'Brand unavailable' }, { status: 403 });
    }
    const slugs = allowed.filter(b => !brand || b.slug===brand).map(b => b.slug);
    const anchor = range === 'custom' || slugs.length === 0 ? null : await getDataAnchorDate(slugs);
    const { startDate, endDate } = resolveDateRange(range,start,end,anchor);
    if (!validVideoRange(startDate,endDate)) return NextResponse.json({ error:'Invalid date range' },{status:400});
    const { data, error } = await db.rpc('get_manager_video_gmv_selection', {
      p_tenant_id:scope.tenantId,p_brand_slugs:slugs,p_start:startDate,p_end:endDate,
      p_post_start:postStart || null,p_post_end:postEnd || null,
    }).abortSignal(AbortSignal.timeout(30000));
    if (error || !data) throw error ?? new Error('Missing video metrics');
    return NextResponse.json({...data,start:startDate,end:endDate,postStart:postStart || null,postEnd:postEnd || null}, {headers:{'Cache-Control':'private, no-store'}});
  } catch (error) {
    console.error('[new-video-gmv] load failed:',error);
    return NextResponse.json({ error:'New video GMV could not be loaded.' },{status:503});
  }
}
