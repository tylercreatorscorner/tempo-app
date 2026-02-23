/**
 * Tempo Bot — Multi-tenant Discord configuration
 *
 * Maps Discord guild (server) IDs to brand/tenant slugs.
 * This is the source of truth for which server belongs to which brand.
 */

import { BRAND_COLORS, BRAND_DISPLAY_NAMES, ACTIVE_BRANDS } from '@/lib/utils/constants';

export interface GuildConfig {
  brandSlug: string;
  displayName: string;
  color: string;
  /** Channel IDs where the bot is allowed to respond (empty = all channels) */
  allowedChannels: string[];
  /** Role IDs that can use admin commands */
  adminRoles: string[];
}

/**
 * Guild-to-brand mapping. Add entries as brands onboard.
 * In production this would come from Supabase, but we start with a static map.
 */
const GUILD_MAP: Record<string, GuildConfig> = {
  // JiYu Discord server
  '1339335585776533708': {
    brandSlug: 'jiyu',
    displayName: BRAND_DISPLAY_NAMES['jiyu'] ?? 'JiYu',
    color: BRAND_COLORS['jiyu'] ?? '#E91E8C',
    allowedChannels: [],
    adminRoles: [],
  },
  // Tyler's personal server (dev/testing)
  '1093295115495297084': {
    brandSlug: 'jiyu', // defaults to JiYu for testing
    displayName: 'Tempo Dev',
    color: '#6C5CE7',
    allowedChannels: [],
    adminRoles: [],
  },
};

/** Look up guild config; returns undefined for unknown servers */
export function getGuildConfig(guildId: string): GuildConfig | undefined {
  return GUILD_MAP[guildId];
}

/** Get brand slug for a guild, with fallback */
export function getBrandForGuild(guildId: string): string | null {
  return GUILD_MAP[guildId]?.brandSlug ?? null;
}

/** All registered guild IDs */
export function getRegisteredGuilds(): string[] {
  return Object.keys(GUILD_MAP);
}

/** Tempo brand defaults */
export const TEMPO_DEFAULTS = {
  name: 'Tempo',
  color: 0x6C5CE7, // purple
  iconUrl: '', // TODO: add Tempo bot avatar URL
  footerText: 'Tempo — TikTok Shop Analytics',
  activeBrands: ACTIVE_BRANDS,
} as const;
