import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { can } from '@/lib/auth/permissions';
import { randomBytes } from 'crypto';
import { messageReply } from '@/lib/messages/access';

export async function POST(request: NextRequest) {
  try {
    const scope = await getWorkspaceScope();
    if (!scope) return messageReply({ error: 'Unauthorized' }, 401);
    if (!scope.tenantId || !scope.userId || scope.impersonating || !['owner', 'admin'].includes(scope.role)
      || scope.brandScope.kind !== 'all' || !can(scope, 'roster', 'read') || !can(scope, 'roster', 'write')) return messageReply({ error: 'Forbidden' }, 403);
    if (request.headers.get('origin') !== request.nextUrl.origin) return messageReply({ error: 'Invalid request origin' }, 403);
    if (!request.headers.get('content-type')?.includes('application/json')) return messageReply({ error: 'Send JSON invite details' }, 415);
    const raw = await request.text();
    if (raw.length > 10000) return messageReply({ error: 'Invite request is too large' }, 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return messageReply({ error: 'Invalid invite details' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return messageReply({ error: 'Invalid invite details' }, 400);
    const input = body as Record<string, unknown>;
    const brand = typeof input.brand === 'string' ? input.brand.trim() : '';
    const maxUses = input.max_uses ?? 100, expiresDays = input.expires_days ?? 7;
    if (!brand || brand.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(brand)
      || !Number.isInteger(maxUses) || Number(maxUses) < 1 || Number(maxUses) > 1000
      || !Number.isInteger(expiresDays) || Number(expiresDays) < 1 || Number(expiresDays) > 90
      || (input.tenant_id !== undefined && input.tenant_id !== scope.tenantId)) return messageReply({ error: 'Invalid invite details' }, 400);
    const db = await createAdminClient();
    const owned = await db.from('brands_v2').select('id,slug').eq('tenant_id', scope.tenantId)
      .eq('slug', brand).eq('is_archived', false).maybeSingle();
    if (owned.error) return messageReply({ error: 'Could not verify this brand. Please retry.' }, 503);
    if (!owned.data) return messageReply({ error: 'Select an active brand in your workspace' }, 404);
    const code = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + Number(expiresDays) * 86400000).toISOString();
    const { data, error } = await db.from('invites').insert({
      brand: owned.data.slug, tenant_id: scope.tenantId, created_by: scope.email || scope.userId,
      code, expires_at: expiresAt, max_uses: maxUses, current_uses: 0, active: true,
    }).select().single();
    if (error || !data) return messageReply({ error: 'Could not create this invite. Please retry.' }, 503);
    return messageReply({ invite: data, join_url: `/join/${code}` });
  } catch {
    return messageReply({ error: 'Could not create this invite. Please retry.' }, 503);
  }
}
