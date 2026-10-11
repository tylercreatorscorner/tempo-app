/**
 * Tempo Bot — Multi-tenant Discord configuration
 *
 * Maps Discord guild (server) IDs to brand/tenant slugs.
 * This is the source of truth for which server belongs to which brand.
 */

import {getSupabase} from './supabase';

export interface ChannelMapping {
  /** Channel for daily brief posts */
  dailyBrief?: string;
  /** Channel for alert notifications */
  alerts?: string;
  /** Channel for relay notifications (inbound DMs from creators) */
  relay?: string;
}

/** Messaging relay configuration */
export const RELAY_CONFIG = {
  /** Milliseconds between bulk DMs (default 1000) */
  bulkDmRateLimit: 1000,
  /** How often to check for due reminders in ms (default 60000) */
  reminderCheckInterval: 60_000,
} as const;

export type PermissionLevel = 'everyone' | 'admin';

export interface GuildConfig {
  brandSlug: string;
  displayName: string;
  color: string;
  /** Channel IDs where the bot is allowed to respond (empty = all channels) */
  allowedChannels: string[];
  /** Role IDs that can use admin commands */
  adminRoles: string[];
  /** Channel mappings for automated messages */
  channels: ChannelMapping;
  /** Command permission overrides (command name → level) */
  permissions: Partial<Record<string, PermissionLevel>>;
}

/**
 * Guild-to-brand mapping. Add entries as brands onboard.
 * In production this would come from Supabase, but we start with a static map.
 */
const GUILD_MAP: Record<string, GuildConfig> = {
  // JiYu Discord server
  '1339335585776533708': {
    brandSlug: 'jiyu',
    displayName: 'JiYu',
    color: '#E91E8C',
    allowedChannels: [],
    adminRoles: [],
    channels: {},
    permissions: { alerts: 'admin' },
  },
  // Toplux Nutrition Discord server — brand removed from the system
  // 2026-08-26 (migration 161). Guild mapping dropped so the bot resolves no
  // brand there rather than one that does not exist.
  // Cata-Kor Discord server
  '1166776019655602236': {
    brandSlug: 'catakor',
    displayName: 'Cata-Kor',
    color: '#00C853',
    allowedChannels: [],
    adminRoles: [],
    channels: {},
    permissions: { alerts: 'admin' },
  },
  // Physician's Choice Discord server
  '1181985490363240499': {
    brandSlug: 'physicians_choice',
    displayName: "Physician's Choice",
    color: '#2196F3',
    allowedChannels: [],
    adminRoles: [],
    channels: {},
    permissions: { alerts: 'admin' },
  },
  // Tyler's personal server (dev/testing)
  '1093295115495297084': {
    brandSlug: 'jiyu', // defaults to JiYu for testing
    displayName: 'Tempo Dev',
    color: '#6C5CE7',
    allowedChannels: [],
    adminRoles: [],
    channels: {
      dailyBrief: '1465474331365736552', // ping channel for testing
      alerts: '1465474331365736552',
    },
    permissions: {},
  },
};

/** Look up guild config; returns undefined for unknown servers */
let configuredGuilds:Record<string,GuildConfig> = {};
let checkedAt=0;
let refreshing:Promise<void>|null=null;
/** Brand setup is the source for new servers; preserve explicitly configured
 * channel/role overrides for established servers. Failed reads never retain
 * new database mappings or silently turn an unknown server into a brand.
 */
export async function refreshGuildConfigs(){
 if(Date.now()-checkedAt<60000)return;
 if(refreshing)return refreshing;
 refreshing=(async()=>{
  try{
   const {data,error,count}=await getSupabase().from('brands_v2')
    .select('slug,name,display_name,color,discord_guild_id',{count:'exact'}).eq('is_archived',false).not('discord_guild_id','is',null);
   if(error||!data||count!==data.length)throw Error('Guild configuration unavailable');
   const next:Record<string,GuildConfig>={};
   const duplicates=new Set<string>();
   for(const brand of data){const guild=brand.discord_guild_id;if(!/^\d{17,20}$/.test(guild))continue;if(next[guild]){duplicates.add(guild);continue;}
    const legacy=GUILD_MAP[guild];
    next[guild]={brandSlug:brand.slug,displayName:brand.display_name||brand.name,color:brand.color&&/^#[a-f0-9]{6}$/i.test(brand.color)?brand.color:'#7855d7',allowedChannels:legacy?.allowedChannels??[],adminRoles:legacy?.adminRoles??[],channels:legacy?.channels??{},permissions:legacy?.permissions??{alerts:'admin'}};
   }
   for(const guild of duplicates)delete next[guild];
   configuredGuilds=next;
  }catch{configuredGuilds={};}
  finally{checkedAt=Date.now();}
 })();
 try{await refreshing;}finally{refreshing=null;}
}
export function getGuildConfig(guildId: string): GuildConfig | undefined {
  return configuredGuilds[guildId]??GUILD_MAP[guildId];
}

/** Get brand slug for a guild, with fallback */
export function getBrandForGuild(guildId: string): string | null {
  return getGuildConfig(guildId)?.brandSlug ?? null;
}

/** All registered guild IDs */
export function getRegisteredGuilds(): string[] {
  return [...new Set([...Object.keys(GUILD_MAP),...Object.keys(configuredGuilds)])];
}

/** Tempo brand defaults */
export const TEMPO_DEFAULTS = {
  name: 'Tempo',
  color: 0x6C5CE7, // purple
  iconUrl: '', // TODO: add Tempo bot avatar URL
  footerText: 'Tempo — TikTok Shop Analytics',
} as const;
