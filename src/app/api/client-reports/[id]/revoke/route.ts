/**
 * POST /api/client-reports/[id]/revoke — kill a share link.
 *
 * Sets revoked_at; the public /r/[token] page renders a revoked notice from
 * then on. The row stays for the outbox history.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope, isBrandInScope } from '@/lib/auth/workspace-scope';

export const runtime = 'nodejs';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const supabase = await createAdminClient();

  const { data: row, error: fetchErr } = await supabase
    .from('client_reports')
    .select('id, brand_slug, revoked_at')
    .eq('id', id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (row.brand_slug === 'all' ? scope.brandScope.kind !== 'all' : !isBrandInScope(scope, { slug: row.brand_slug })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!row.revoked_at) {
    const { error } = await supabase
      .from('client_reports')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
