import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { tempoEmbed, errorEmbed } from '../embeds';
import { getGuildConfig } from '../config';
import { getSupabase, daysAgo, getBotBrandRegistry } from '../supabase';
import { brandSlugToUuid } from '@/lib/utils/constants';
import { brandLabel } from '@/lib/data/brand-registry-core';
import type { TempoCommand } from './index';

const command: TempoCommand = {
  data: new SlashCommandBuilder()
    .setName('brand')
    .setDescription('Brand performance summary')
    .addStringOption((opt) =>
      opt
        .setName('name')
        .setDescription('Brand name')
        .setRequired(true)
        .addChoices(
          { name: 'JiYu', value: 'jiyu' },
          { name: 'Catakor', value: 'catakor' },
          { name: "Physician's Choice", value: 'physicians_choice' },
          { name: 'Toplux', value: 'toplux' },
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const guildConfig = interaction.guildId ? getGuildConfig(interaction.guildId) : undefined;
    const brandSlug = interaction.options.getString('name', true);
    const brandUuid = brandSlugToUuid(brandSlug);

    await interaction.deferReply();
    const supabase = getSupabase();

    try {
      // 30d performance
      const { data: perf } = await supabase
        .from('daily_creator_stats')
        .select('tiktok_username, gmv, orders, items_sold, est_commission')
        .eq('brand_id', brandUuid)
        .gte('report_date', daysAgo(30));

      const rows = perf ?? [];
      const totalGmv = rows.reduce((s, r) => s + (r.gmv || 0), 0);
      const totalOrders = rows.reduce((s, r) => s + (r.orders || 0), 0);
      const totalCommission = rows.reduce((s, r) => s + (r.est_commission || 0), 0);

      // Top creators by GMV
      const creatorGmv = new Map<string, number>();
      for (const r of rows) {
        creatorGmv.set(r.tiktok_username, (creatorGmv.get(r.tiktok_username) ?? 0) + (r.gmv || 0));
      }
      const topCreators = [...creatorGmv.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      // WoW growth
      const { data: d7 } = await supabase
        .from('daily_creator_stats')
        .select('gmv')
        .eq('brand_id', brandUuid)
        .gte('report_date', daysAgo(7));
      const { data: dPrior } = await supabase
        .from('daily_creator_stats')
        .select('gmv')
        .eq('brand_id', brandUuid)
        .gte('report_date', daysAgo(14))
        .lt('report_date', daysAgo(7));

      const gmv7 = (d7 ?? []).reduce((s, r) => s + (r.gmv || 0), 0);
      const gmvPrior = (dPrior ?? []).reduce((s, r) => s + (r.gmv || 0), 0);
      const wowGrowth = gmvPrior > 0 ? ((gmv7 - gmvPrior) / gmvPrior) * 100 : 0;

      const fmtUsd = (n: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
      const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);

      const reg = await getBotBrandRegistry();
      const brandColor = reg.bySlug.get(brandSlug)?.color;
      const brandName = brandLabel(reg, brandSlug);

      const medals = ['🥇', '🥈', '🥉', '4.', '5.'];
      const creatorLines = topCreators.map(([name, gmv], i) =>
        `${medals[i]} @${name} — ${fmtUsd(gmv)}`,
      );

      const embed = tempoEmbed(guildConfig);
      if (brandColor) {
        embed.setColor(parseInt(brandColor.replace('#', ''), 16));
      }
      embed
        .setTitle(`🏷️ ${brandName} — Performance`)
        .setDescription(`Last 30 days`)
        .addFields(
          { name: '💰 Total GMV', value: fmtUsd(totalGmv), inline: true },
          { name: '🛒 Orders', value: fmt(totalOrders), inline: true },
          { name: '💵 Commission', value: fmtUsd(totalCommission), inline: true },
          { name: '📈 WoW Growth', value: `${wowGrowth >= 0 ? '+' : ''}${wowGrowth.toFixed(1)}%`, inline: true },
          { name: '🏆 Top Creators', value: creatorLines.join('\n') || 'No data' },
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[tempo-bot] brand command error:', err);
      await interaction.editReply({ embeds: [errorEmbed('Failed to fetch brand data. Try again later.')] });
    }
  },
};

export default command;
