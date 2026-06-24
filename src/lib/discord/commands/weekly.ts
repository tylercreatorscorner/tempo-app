import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type TextChannel,
} from 'discord.js';
import { tempoEmbed, errorEmbed } from '../embeds';
import { getGuildConfig, getBrandForGuild } from '../config';
import { getSupabase, daysAgo, getBotBrandRegistry } from '../supabase';
import { brandLabel, slugToUuid } from '@/lib/data/brand-registry-core';
import { generateWeeklyRecapPost } from '../generators';
import type { TempoCommand } from './index';
import type { BrandSummary, CreatorRanking, ProductSummary } from '@/types/database';

const command: TempoCommand = {
  data: new SlashCommandBuilder()
    .setName('weekly')
    .setDescription('Post the weekly performance recap to the configured channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false) as unknown as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }

    const guildConfig = getGuildConfig(interaction.guildId);
    const brand = getBrandForGuild(interaction.guildId);

    if (!guildConfig || !brand) {
      await interaction.reply({
        embeds: [errorEmbed('This server is not configured in Tempo.')],
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const supabase = getSupabase();
    const reg = await getBotBrandRegistry();
    const brandUuid = slugToUuid(reg, brand);
    const since = daysAgo(7);

    try {
      // Aggregate brand summary from daily_creator_stats
      const { data: statsData } = await supabase
        .from('daily_creator_stats')
        .select('tiktok_username, gmv, orders, items_sold, videos')
        .eq('brand_id', brandUuid)
        .gte('report_date', since);

      const rows = statsData ?? [];
      const summary: BrandSummary = {
        total_gmv: rows.reduce((s, r) => s + (r.gmv || 0), 0),
        total_orders: rows.reduce((s, r) => s + (r.orders || 0), 0),
        total_items_sold: rows.reduce((s, r) => s + (r.items_sold || 0), 0),
        total_videos: rows.reduce((s, r) => s + (r.videos || 0), 0),
        unique_creators: new Set(rows.map((r) => r.tiktok_username)).size,
        avg_aov: 0,
      };

      // Creator rankings
      const creatorMap = new Map<string, { gmv: number; orders: number; items: number; videos: number }>();
      for (const r of rows) {
        const cur = creatorMap.get(r.tiktok_username) ?? { gmv: 0, orders: 0, items: 0, videos: 0 };
        cur.gmv += r.gmv || 0;
        cur.orders += r.orders || 0;
        cur.items += r.items_sold || 0;
        cur.videos += r.videos || 0;
        creatorMap.set(r.tiktok_username, cur);
      }

      const topCreators: CreatorRanking[] = [...creatorMap.entries()]
        .map(([name, s]) => ({
          creator_name: name,
          total_gmv: s.gmv,
          total_orders: s.orders,
          total_items_sold: s.items,
          total_videos: s.videos,
          days_active: 7,
        }))
        .sort((a, b) => b.total_gmv - a.total_gmv)
        .slice(0, 5);

      // Top products from daily_video_product_stats
      const { data: vidData } = await supabase
        .from('daily_video_product_stats')
        .select('product_name, gmv, orders, items_sold')
        .eq('brand_id', brandUuid)
        .gte('report_date', since);

      const productMap = new Map<string, { gmv: number; orders: number; items: number }>();
      for (const r of vidData ?? []) {
        const cur = productMap.get(r.product_name) ?? { gmv: 0, orders: 0, items: 0 };
        cur.gmv += r.gmv || 0;
        cur.orders += r.orders || 0;
        cur.items += r.items_sold || 0;
        productMap.set(r.product_name, cur);
      }

      const topProducts: ProductSummary[] = [...productMap.entries()]
        .map(([name, s]) => ({
          product_name: name,
          total_gmv: s.gmv,
          total_orders: s.orders,
          total_items_sold: s.items,
        }))
        .sort((a, b) => b.total_gmv - a.total_gmv)
        .slice(0, 3);

      // Build date label
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 7);
      const dateLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

      const message = generateWeeklyRecapPost(brandLabel(reg, brand), summary, topCreators, topProducts, dateLabel);

      // Post to the daily brief channel, or fall back to current channel
      const channelId = guildConfig.channels.dailyBrief;
      let targetChannel: TextChannel;

      if (channelId) {
        targetChannel = (await interaction.guild.channels.fetch(channelId)) as TextChannel;
      } else {
        targetChannel = interaction.channel as TextChannel;
      }

      await targetChannel.send(message);

      const embed = tempoEmbed(guildConfig)
        .setTitle('✅ Weekly Recap Posted')
        .setDescription(`Recap sent to <#${targetChannel.id}>`);

      await interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
      console.error('[tempo-bot] weekly command error:', err);
      await interaction.editReply({ embeds: [errorEmbed(`Failed to post weekly recap: ${err.message}`)] });
    }
  },
};

export default command;
