import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { can } from '@/lib/auth/permissions';
import { applicationBrand } from '@/lib/applications/access';
import { createAdminClient } from '@/lib/supabase/server';
import { getGuildConfig } from '@/lib/discord/config';
import { creatorOnboardingGuilds, isCreatorOnboardingGuild } from '@/lib/discord/creator-onboarding-guild';
import { validateCreatorHubDestination } from '@/lib/discord/creator-onboarding';

const saveSchema = z.object({
  brandId: z.uuid(),
  guildId: z.string().regex(/^\d{17,20}$/),
  startHereChannelId: z.string().regex(/^\d{17,20}$/),
  creatorRoleId: z.string().regex(/^\d{17,20}$/),
  coachingCategoryId: z.string().regex(/^\d{17,20}$/),
  staffRoleIds: z.array(z.string().regex(/^\d{17,20}$/)).min(1).max(10),
  enabled: z.boolean(),
});

async function authorizedBrand(brandId: string) {
  const scope = await getWorkspaceScope();
  if (!scope || scope.impersonating || !['owner', 'admin'].includes(scope.role) ||
      !can(scope, 'roster', 'write')) {
    console.warn('Discord onboarding setup denied at workspace guard', {
      hasScope: Boolean(scope), impersonating: Boolean(scope?.impersonating),
      roleAllowed: Boolean(scope && ['owner', 'admin'].includes(scope.role)),
      rosterWriteAllowed: Boolean(scope && can(scope, 'roster', 'write')),
    });
    return null;
  }
  const brand = await applicationBrand(scope, brandId);
  if (!brand) console.warn('Discord onboarding setup denied at brand guard');
  return brand ? { scope, brand } : null;
}

export async function GET(request: Request) {
  const brandId = new URL(request.url).searchParams.get('brandId') ?? '';
  if (!z.uuid().safeParse(brandId).success) return NextResponse.json({ error: 'Invalid brand.' }, { status: 400 });
  const access = await authorizedBrand(brandId);
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const guilds = creatorOnboardingGuilds(access.scope.tenantId, access.brand.id)
    .map(id => ({ id, name: getGuildConfig(id)?.displayName ?? access.brand.name }));
  const db = await createAdminClient();
  const { data: saved } = await db.from('creator_hub_discord_destinations')
    .select('guild_id,start_here_channel_id,creator_role_id,coaching_category_id,staff_role_ids,enabled')
    .eq('tenant_id', access.scope.tenantId).eq('brand_id', brandId).maybeSingle();
  const guildId = guilds.find(guild => guild.id === saved?.guild_id)?.id ?? guilds[0]?.id;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!guildId || !botToken) return NextResponse.json({ guilds, saved, roles: [], channels: [],
    error: !guildId ? 'No Tempo Bot server is mapped to this brand.' : 'Tempo Bot is not configured on this deployment.' });
  const headers = { Authorization: `Bot ${botToken}` };
  const [rolesResponse, channelsResponse] = await Promise.all([
    fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, { headers, cache: 'no-store' }),
    fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, { headers, cache: 'no-store' }),
  ]);
  if (!rolesResponse.ok || !channelsResponse.ok) return NextResponse.json({ guilds, saved, roles: [], channels: [],
    error: 'Tempo Bot could not read this server’s roles and channels.' });
  const roles = (await rolesResponse.json() as Array<{ id: string; name: string; position: number }>)
    .filter(role => role.id !== guildId).sort((a, b) => b.position - a.position)
    .map(role => ({ id: role.id, name: role.name }));
  const channels = (await channelsResponse.json() as Array<{ id: string; name: string; type: number }>)
    .filter(channel => [0, 4, 5].includes(channel.type))
    .map(channel => ({ id: channel.id, name: channel.name, type: channel.type }));
  return NextResponse.json({ guilds, saved, roles, channels, error: null });
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Check the Discord destination.' }, { status: 400 });
  const access = await authorizedBrand(parsed.data.brandId);
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { brand, scope } = access;
  if (parsed.data.enabled && !isCreatorOnboardingGuild(scope.tenantId, brand.id, parsed.data.guildId)) {
    return NextResponse.json({ error: 'Discord onboarding is limited to the JiYu pilot for now.' }, { status: 409 });
  }
  if (!isCreatorOnboardingGuild(scope.tenantId, brand.id, parsed.data.guildId)) {
    return NextResponse.json({ error: 'This Discord server is not mapped to the brand.' }, { status: 403 });
  }
  if (parsed.data.enabled) {
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) return NextResponse.json({ error: 'Tempo Bot is not configured here.' }, { status: 503 });
    try {
      await validateCreatorHubDestination({ tenantId: scope.tenantId, brandId: brand.id, guildId: parsed.data.guildId,
        startHereChannelId: parsed.data.startHereChannelId, creatorRoleId: parsed.data.creatorRoleId,
        coachingCategoryId: parsed.data.coachingCategoryId, staffRoleIds: parsed.data.staffRoleIds }, botToken);
    } catch (cause) {
      return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Discord preflight failed.' }, { status: 409 });
    }
  }
  const db = await createAdminClient();
  const { error } = await db.from('creator_hub_discord_destinations').upsert({
    tenant_id: scope.tenantId, brand_id: brand.id,
    guild_id: parsed.data.guildId, start_here_channel_id: parsed.data.startHereChannelId,
    creator_role_id: parsed.data.creatorRoleId, coaching_category_id: parsed.data.coachingCategoryId,
    staff_role_ids: parsed.data.staffRoleIds, enabled: parsed.data.enabled,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'brand_id' });
  if (error) return NextResponse.json({ error: 'Could not save Discord setup.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
