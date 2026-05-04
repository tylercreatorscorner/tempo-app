/**
 * Tempo Bot — Rich embed builders
 *
 * Consistent formatting across all commands with brand colors and Tempo branding.
 */

import { EmbedBuilder } from 'discord.js';
import { TEMPO_DEFAULTS, type GuildConfig } from './config';

/** Create a base embed with Tempo branding */
export function tempoEmbed(guildConfig?: GuildConfig): EmbedBuilder {
  const color = guildConfig
    ? parseInt(guildConfig.color.replace('#', ''), 16)
    : TEMPO_DEFAULTS.color;

  return new EmbedBuilder()
    .setColor(color)
    .setThumbnail('https://tempo-app-wheat.vercel.app/tempo-icon.png')
    .setFooter({ text: 'Tempo • tempoapp.ai' })
    .setTimestamp();
}

/** Error embed — red, with error message */
export function errorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xE74C3C)
    .setTitle('❌ Error')
    .setDescription(message)
    .setFooter({ text: TEMPO_DEFAULTS.footerText })
    .setTimestamp();
}

/** Stats embed for a single creator */
export function creatorStatsEmbed(
  guildConfig: GuildConfig | undefined,
  creatorName: string,
  period: string,
  stats: {
    gmv: number;
    orders: number;
    videos: number;
    impressions: number;
    itemsSold: number;
  },
): EmbedBuilder {
  const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);
  const fmtUsd = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

  return tempoEmbed(guildConfig)
    .setTitle(`📊 Creator Stats — @${creatorName}`)
    .setDescription(`Period: **${period}**`)
    .addFields(
      { name: '💰 GMV', value: fmtUsd(stats.gmv), inline: true },
      { name: '🛒 Orders', value: fmt(stats.orders), inline: true },
      { name: '📦 Items Sold', value: fmt(stats.itemsSold), inline: true },
      { name: '🎬 Videos', value: fmt(stats.videos), inline: true },
      { name: '👀 Impressions', value: fmt(stats.impressions), inline: true },
    );
}

/** Leaderboard embed — top creators ranked by GMV */
export function leaderboardEmbed(
  guildConfig: GuildConfig | undefined,
  brandName: string,
  period: string,
  creators: Array<{ name: string; gmv: number; videos: number }>,
): EmbedBuilder {
  const fmtUsd = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
  const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);

  const medals = ['🥇', '🥈', '🥉'];
  const lines = creators.slice(0, 10).map((c, i) => {
    const prefix = i < 3 ? medals[i] : `**${i + 1}.**`;
    return `${prefix} **@${c.name}** — ${fmtUsd(c.gmv)} (${fmt(c.videos)} videos)`;
  });

  return tempoEmbed(guildConfig)
    .setTitle(`🏆 Leaderboard — ${brandName}`)
    .setDescription(`**${period}**\n\n${lines.join('\n')}`);
}

/** Help embed — list all commands */
export function helpEmbed(): EmbedBuilder {
  return tempoEmbed()
    .setTitle('📖 Tempo Bot — Commands')
    .setDescription('TikTok Shop analytics right in your Discord server.')
    .addFields(
      { name: '/ping', value: 'Check if the bot is online', inline: false },
      { name: '/stats [creator] [period]', value: 'Creator stats or brand summary', inline: false },
      { name: '/leaderboard [brand] [period]', value: 'Top creators ranked by GMV', inline: false },
      { name: '/alerts', value: 'Performance alerts & warnings', inline: false },
      { name: '/creator [name]', value: 'Detailed creator profile', inline: false },
      { name: '/compare [creator1] [creator2]', value: 'Side-by-side creator comparison', inline: false },
      { name: '/brand [name]', value: 'Brand performance summary', inline: false },
      { name: '/help', value: 'Show this help message', inline: false },
      { name: '/message creator [name] [text]', value: 'DM a managed creator', inline: false },
      { name: '/message channel [channel] [text]', value: 'Post announcement to a channel', inline: false },
      { name: '/bulk dm [role] [text]', value: 'DM all members with a role', inline: false },
      { name: '/bulk announce [channel] [text]', value: 'Post formatted announcement', inline: false },
      { name: '/reminder create [creator] [text] [when]', value: 'Schedule a reminder DM', inline: false },
      { name: '/reminder posting [days]', value: 'Remind inactive creators', inline: false },
      { name: '/myrank [period]', value: 'See your rank & earnings as a creator (only visible to you)', inline: false },
      { name: '/topvideos [period] [limit]', value: 'Top performing videos ranked by GMV', inline: false },
      { name: '/brief', value: 'Post the daily performance brief (admin)', inline: false },
      { name: '/weekly', value: 'Post the weekly recap (admin)', inline: false },
    );
}
