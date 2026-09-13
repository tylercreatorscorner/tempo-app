import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope, isBrandInScope } from '@/lib/auth/workspace-scope';
import { reportGuard, getClientReportRegistry, clientReportContext } from '@/lib/auth/client-report-access';
import { expandSlugs } from '@/lib/data/brand-registry-core';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const denied = reportGuard(scope, 'read');
  if (denied) return denied;
  try {
    const brand = request.nextUrl.searchParams.get('brand') || 'all';
    const reg = brand === 'all' ? await getClientReportRegistry(scope) : (await clientReportContext(scope, brand)).registry;
    // The banner's All brands means all assigned brands, including for managers.
    const slugs = brand === 'all'
      ? reg.rows.filter(b => isBrandInScope(scope, b)).flatMap(b => expandSlugs(reg, b.slug))
      : expandSlugs(reg, brand);
    const ids = [...new Set(slugs.map(s => reg.bySlug.get(s)?.id).filter((id): id is string => !!id))];
    if (!ids.length) return NextResponse.json({ latestReportDate: null, daysOld: null });
    const admin = await createAdminClient();
    const { data, error } = await admin.from('daily_creator_stats').select('report_date')
      .in('brand_id', ids).order('report_date', { ascending: false }).limit(1);
    if (error) throw new Error('Failed to load freshness');
    const date = data?.[0]?.report_date;
    const latest = date ? new Date(date + 'T12:00:00Z') : null;
    return NextResponse.json({ latestReportDate: date ?? null, daysOld: latest ? Math.floor((Date.now() - latest.getTime()) / 86_400_000) : null });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load freshness' }, { status: 500 });
  }
}
