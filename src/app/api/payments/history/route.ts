import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';

export async function GET(request: NextRequest) {
  try {
    const scope = await getWorkspaceScope();
    if (!scope) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!scope.canViewFinance) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const scopedSlugs = scope.brandScope.kind === 'scoped' ? scope.brandScope.brandSlugs : null;

    const supabase = await createAdminClient();
    const brand = request.nextUrl.searchParams.get('brand') || 'all';

    // Scoped (manager) requesting a brand outside their access → nothing.
    if (scopedSlugs && brand !== 'all' && !scopedSlugs.includes(brand)) {
      return NextResponse.json({ error: 'Forbidden: brand not in your access' }, { status: 403 });
    }

    let query = supabase
      .from('payment_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (brand !== 'all') {
      query = query.eq('brand', brand);
    } else if (scopedSlugs) {
      query = query.in('brand', scopedSlugs.length ? scopedSlugs : ['__none__']);
    }

    const { data: logs, error } = await query;

    // If the table doesn't exist yet, return empty
    if (error && error.message?.includes('does not exist')) {
      return NextResponse.json({ logs: [] });
    }
    if (error) throw error;

    return NextResponse.json({ logs: logs || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load payment history';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
