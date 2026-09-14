import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { authorizeCreator } from '@/lib/auth/authorize-creator';
import { can } from '@/lib/auth/permissions';
import { fetchDiscordAvatars } from '@/lib/discord/avatars';

// Repair an expired portrait only for an already-authorized creator identity.
// No arbitrary URL/user lookup, identity matching, or database mutation.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getWorkspaceScope();
  if (!scope) return new NextResponse(null, { status: 401 });
  if (!can(scope, 'roster', 'read')) return new NextResponse(null, { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 });
  const denied = await authorizeCreator(scope, id);
  if (denied) return denied;
  const admin = await createAdminClient();
  const { data, error } = await admin.from('creators_v2')
    .select('discord_id, discord_avatar').eq('id', id).eq('tenant_id', scope.tenantId).maybeSingle();
  if (error || !data) return new NextResponse(null, { status: 404 });
  // Legacy imports sometimes stored the linked Discord ID only in the CDN URL.
  const stored = typeof data.discord_avatar === 'string' ? data.discord_avatar : '';
  const discordId = data.discord_id || stored.match(/^https:\/\/cdn\.discordapp\.com\/avatars\/(\d{17,20})\//)?.[1];
  if (typeof discordId !== 'string' || !/^\d{17,20}$/.test(discordId)) return new NextResponse(null, { status: 404 });
  const avatars = await fetchDiscordAvatars([discordId]);
  const url = avatars[discordId];
  if (!url) return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'private, max-age=60' } });
  return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'private, max-age=3600' } });
}
