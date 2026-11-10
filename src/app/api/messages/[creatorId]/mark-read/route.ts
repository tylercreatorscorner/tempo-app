import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { messageGuard, messageReply, messageTarget } from '@/lib/messages/access';

export async function POST(request: NextRequest, { params }: { params: Promise<{ creatorId: string }> }) {
  try {
    const scope = await getWorkspaceScope();
    const denied = messageGuard(scope, true);
    if (denied || !scope) return denied!;
    if (request.headers.get('origin') !== request.nextUrl.origin) return messageReply({ error: 'Invalid request origin' }, 403);
    const { creatorId } = await params;
    const db = await createAdminClient();
    const target = await messageTarget(scope, db, creatorId, request.nextUrl.searchParams.get('discord_user_id'));
    if (target instanceof NextResponse) return target;
    const { data, error } = await db.from('creator_messages').update({ read_at: new Date().toISOString() })
      .eq('tenant_id', scope.tenantId).or(target).eq('direction', 'inbound').is('read_at', null).select('id');
    if (error || !data) throw new Error('Read state unavailable.');
    return messageReply({ marked_read: data.length });
  } catch {
    return messageReply({ error: 'Could not update read status. Please retry.' }, 503);
  }
}
