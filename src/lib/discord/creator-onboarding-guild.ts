// Creator onboarding is deliberately restricted to the verified JiYu pilot.
// The bot's older slug map also includes a development server and cannot
// authorize a tenant's access to a real Discord guild.
const JIYU = {
  tenantId: '00000000-0000-0000-0000-000000000001',
  brandId: 'b0000000-0000-0000-0000-000000000003',
  guildId: '1339335585776533708',
} as const;

export function isCreatorOnboardingGuild(tenantId: string, brandId: string, guildId: string): boolean {
  return tenantId === JIYU.tenantId && brandId === JIYU.brandId && guildId === JIYU.guildId;
}

export function creatorOnboardingGuilds(tenantId: string, brandId: string): string[] {
  return tenantId === JIYU.tenantId && brandId === JIYU.brandId ? [JIYU.guildId] : [];
}
