import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';

export async function POST(request: NextRequest) {
  try {
    const scope = await getWorkspaceScope();
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { creatorIds, content } = await request.json();

    if (!content?.trim() || !creatorIds?.length) {
      return NextResponse.json({ error: 'Content and creatorIds are required' }, { status: 400 });
    }

    const supabase = await createAdminClient();

    // Scoped (manager): every target must be a creator in their brands.
    if (scope.brandScope.kind === 'scoped') {
      const ids = scope.brandScope.brandIds;
      const { data: allowed } = await supabase
        .from('creator_brands')
        .select('creator_id')
        .in('creator_id', creatorIds)
        .in('brand_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
      const ok = new Set((allowed ?? []).map((r) => r.creator_id));
      const bad = creatorIds.filter((id: unknown) => !ok.has(id));
      if (bad.length > 0) {
        return NextResponse.json(
          { error: 'Forbidden: some recipients are not in your brands' }, { status: 403 });
      }
    }

    const rows = creatorIds.map((id: number) => ({
      creator_id: id,
      direction: 'outbound',
      channel: 'bulk',
      content: content.trim(),
      status: 'sent',
      sent_by: 'admin',
    }));

    const { error } = await supabase.from('creator_messages').insert(rows);

    if (error) throw error;

    return NextResponse.json({ queued: creatorIds.length });
  } catch (err: unknown) {
    console.error('Failed to send bulk messages:', err);
    return NextResponse.json({ error: 'Failed to send bulk messages' }, { status: 500 });
  }
}
