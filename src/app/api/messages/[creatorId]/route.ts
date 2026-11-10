import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { messageGuard, messageReply, messageTarget } from '@/lib/messages/access';

export async function GET(request: NextRequest, { params }: { params: Promise<{ creatorId: string }> }) {
  try {
    const scope = await getWorkspaceScope();
    const denied = messageGuard(scope);
    if (denied || !scope) return denied!;
    const { creatorId } = await params;
    const url = new URL(request.url);
    const rawPage = url.searchParams.get('page') ?? '1';
    if (!/^[1-9]\d{0,5}$/.test(rawPage)) return messageReply({ error: 'Invalid message page' }, 400);
    const page = Number(rawPage), limit = 50, offset = (page - 1) * limit;
    const db = await createAdminClient();
    const target = await messageTarget(scope, db, creatorId, url.searchParams.get('discord_user_id'));
    if (target instanceof NextResponse) return target;
    const { data, error, count } = await db.from('creator_messages').select('*', { count: 'exact' })
      .eq('tenant_id', scope.tenantId).or(target)
      .order('sent_at', { ascending: false }).order('id', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error || !data || count === null) throw new Error('Message history unavailable.');
    return messageReply({ messages: [...data].reverse(), total: count, page, hasMore: count > offset + limit });
  } catch {
    return messageReply({ error: 'Could not load messages. Please retry.' }, 503);
  }
}
