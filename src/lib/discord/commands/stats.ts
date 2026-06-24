import { SlashCommandBuilder, type ChatInputCommandInteraction, type AutocompleteInteraction } from 'discord.js';
import { creatorStatsEmbed, errorEmbed, tempoEmbed } from '../embeds';
import { getGuildConfig, getBrandForGuild } from '../config';
import { getSupabase, getBotBrandRegistry, daysAgo, periodToDays } from '../supabase';
import { slugToUuid } from '@/lib/data/brand-registry-core';
import type { TempoCommand } from './index';

const command: TempoCommand = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View creator performance stats')
    .addStringOption((opt) =>
      opt.setName('creator').setDescription('Creator username').setRequired(false).setAutocomplete(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('period')
        .setDescription('Time period')
        .setRequired(false)
        .addChoices(
          { name: 'Last 7 days', value: '7d' },
          { name: 'Last 14 days', value: '14d' },
          { name: 'Last 30 days', value: '30d' },
          { name: 'This month', value: 'month' },
        ),
    ),

  async autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused();
    const supabase = getSupabase();
    const { data } = await supabase
      .from('creators_v2')
      .select('real_name')
      .ilike('real_name', `%${focused}%`)
      .limit(25);
    const choices = (data ?? []).map((r: any) => ({ name: r.real_name, value: r.real_name }));
    await interaction.respond(choices);
  },

  async execute(interaction: ChatInputCommandInteraction) {
    const guildConfig = interaction.guildId ? getGuildConfig(interaction.guildId) : undefined;
    const brand = interaction.guildId ? getBrandForGuild(interaction.guildId) : null;
    const creator = interaction.options.getString('creator');
    const period = interaction.options.getString('period') ?? '7d';

    if (!brand) {
      await interaction.reply({ embeds: [errorEmbed('This server is not linked to a brand.')], ephemeral: true });
      return;
    }

    await interaction.deferReply();
    const supabase = getSupabase();
    const reg = await getBotBrandRegistry();
    const brandUuid = slugToUuid(reg, brand);
    const days = periodToDays(period);
    const since = daysAgo(days);

    try {
      if (!creator) {
        // Brand summary
        const { data, error } = await supabase
          .from('daily_creator_stats')
          .select('gmv, orders, items_sold, est_commission')
          .eq('brand_id', brandUuid)
          .gte('report_date', since);

        if (error) throw error;
        const rows = data ?? [];
        const totals = rows.reduce(
          (acc, r) => ({
            gmv: acc.gmv + (r.gmv || 0),
            orders: acc.orders + (r.orders || 0),
            items: acc.items + (r.items_sold || 0),
            commission: acc.commission + (r.est_commission || 0),
          }),
          { gmv: 0, orders: 0, items: 0, commission: 0 },
        );
        const fmtUsd = (n: number) =>
          new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
        const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);

        const embed = tempoEmbed(guildConfig)
          .setTitle(`📊 Brand Summary — ${brand}`)
          .setDescription(`Period: **Last ${days} days**`)
          .addFields(
            { name: '💰 GMV', value: fmtUsd(totals.gmv), inline: true },
            { name: '🛒 Orders', value: fmt(totals.orders), inline: true },
            { name: '📦 Items Sold', value: fmt(totals.items), inline: true },
            { name: '💵 Est. Commission', value: fmtUsd(totals.commission), inline: true },
          );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Creator-specific stats
      const { data, error } = await supabase
        .from('daily_creator_stats')
        .select('gmv, orders, items_sold, est_commission')
        .eq('brand_id', brandUuid)
        .ilike('tiktok_username', `%${creator}%`)
        .gte('report_date', since);

      if (error) throw error;
      const rows = data ?? [];

      if (rows.length === 0) {
        await interaction.editReply({ embeds: [errorEmbed(`No data found for creator "${creator}" in the last ${days} days.`)] });
        return;
      }

      const totals = rows.reduce(
        (acc, r) => ({
          gmv: acc.gmv + (r.gmv || 0),
          orders: acc.orders + (r.orders || 0),
          itemsSold: acc.itemsSold + (r.items_sold || 0),
          commission: acc.commission + (r.est_commission || 0),
        }),
        { gmv: 0, orders: 0, itemsSold: 0, commission: 0 },
      );

      // Also get 7d and 30d GMV for context
      const { data: data7d } = await supabase
        .from('daily_creator_stats')
        .select('gmv')
        .eq('brand_id', brandUuid)
        .ilike('tiktok_username', `%${creator}%`)
        .gte('report_date', daysAgo(7));
      const gmv7d = (data7d ?? []).reduce((s, r) => s + (r.gmv || 0), 0);

      const { data: data30d } = await supabase
        .from('daily_creator_stats')
        .select('gmv')
        .eq('brand_id', brandUuid)
        .ilike('tiktok_username', `%${creator}%`)
        .gte('report_date', daysAgo(30));
      const gmv30d = (data30d ?? []).reduce((s, r) => s + (r.gmv || 0), 0);

      // Count videos
      const { count: videoCount } = await supabase
        .from('daily_video_product_stats')
        .select('*', { count: 'exact', head: true })
        .eq('brand_id', brandUuid)
        .ilike('tiktok_username', `%${creator}%`)
        .gte('report_date', since);

      const periodLabels: Record<string, string> = {
        '7d': 'Last 7 days', '14d': 'Last 14 days', '30d': 'Last 30 days', 'month': 'This month',
      };
      const fmtUsd = (n: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
      const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);

      const embed = tempoEmbed(guildConfig)
        .setTitle(`📊 Creator Stats — @${creator}`)
        .setDescription(`Period: **${periodLabels[period] ?? period}**`)
        .addFields(
          { name: '💰 GMV (7d)', value: fmtUsd(gmv7d), inline: true },
          { name: '💰 GMV (30d)', value: fmtUsd(gmv30d), inline: true },
          { name: '🛒 Orders', value: fmt(totals.orders), inline: true },
          { name: '📦 Items Sold', value: fmt(totals.itemsSold), inline: true },
          { name: '🎬 Videos', value: fmt(videoCount ?? 0), inline: true },
          { name: '💵 Est. Commission', value: fmtUsd(totals.commission), inline: true },
        );
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[tempo-bot] stats command error:', err);
      await interaction.editReply({ embeds: [errorEmbed('Failed to fetch creator stats. Try again later.')] });
    }
  },
};

export default command;
