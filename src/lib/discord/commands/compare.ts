import { SlashCommandBuilder, type ChatInputCommandInteraction, type AutocompleteInteraction } from 'discord.js';
import { tempoEmbed, errorEmbed } from '../embeds';
import { getGuildConfig, getBrandForGuild } from '../config';
import { getSupabase, daysAgo } from '../supabase';
import { brandSlugToUuid } from '@/lib/utils/constants';
import type { TempoCommand } from './index';

async function getCreatorStats(brand: string, name: string) {
  const supabase = getSupabase();
  const brandUuid = brandSlugToUuid(brand);
  const since7 = daysAgo(7);
  const since14 = daysAgo(14);
  const since30 = daysAgo(30);

  const { data: d7 } = await supabase
    .from('daily_creator_stats')
    .select('gmv, orders')
    .eq('brand_id', brandUuid)
    .ilike('tiktok_username', `%${name}%`)
    .gte('report_date', since7);

  const { data: d30 } = await supabase
    .from('daily_creator_stats')
    .select('gmv, orders')
    .eq('brand_id', brandUuid)
    .ilike('tiktok_username', `%${name}%`)
    .gte('report_date', since30);

  // Prior 7d for growth
  const { data: dPrior } = await supabase
    .from('daily_creator_stats')
    .select('gmv')
    .eq('brand_id', brandUuid)
    .ilike('tiktok_username', `%${name}%`)
    .gte('report_date', since14)
    .lt('report_date', since7);

  const { count: videos } = await supabase
    .from('daily_video_product_stats')
    .select('*', { count: 'exact', head: true })
    .eq('brand_id', brandUuid)
    .ilike('tiktok_username', `%${name}%`)
    .gte('report_date', since30);

  const gmv7 = (d7 ?? []).reduce((s, r) => s + (r.gmv || 0), 0);
  const gmv30 = (d30 ?? []).reduce((s, r) => s + (r.gmv || 0), 0);
  const orders30 = (d30 ?? []).reduce((s, r) => s + (r.orders || 0), 0);
  const priorGmv = (dPrior ?? []).reduce((s, r) => s + (r.gmv || 0), 0);
  const growth = priorGmv > 0 ? ((gmv7 - priorGmv) / priorGmv) * 100 : 0;

  return { gmv7, gmv30, orders30, videos: videos ?? 0, growth };
}

const command: TempoCommand = {
  data: new SlashCommandBuilder()
    .setName('compare')
    .setDescription('Compare two creators side-by-side')
    .addStringOption((opt) =>
      opt.setName('creator1').setDescription('First creator').setRequired(true).setAutocomplete(true),
    )
    .addStringOption((opt) =>
      opt.setName('creator2').setDescription('Second creator').setRequired(true).setAutocomplete(true),
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
    const c1 = interaction.options.getString('creator1', true);
    const c2 = interaction.options.getString('creator2', true);

    if (!brand) {
      await interaction.reply({ embeds: [errorEmbed('This server is not linked to a brand.')], ephemeral: true });
      return;
    }

    await interaction.deferReply();

    try {
      const [s1, s2] = await Promise.all([
        getCreatorStats(brand, c1),
        getCreatorStats(brand, c2),
      ]);

      const fmtUsd = (n: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

      const embed = tempoEmbed(guildConfig)
        .setTitle(`⚔️ Compare: @${c1} vs @${c2}`)
        .addFields(
          { name: `📊 @${c1}`, value: [
            `💰 GMV (7d): ${fmtUsd(s1.gmv7)}`,
            `💰 GMV (30d): ${fmtUsd(s1.gmv30)}`,
            `🛒 Orders: ${s1.orders30}`,
            `🎬 Videos: ${s1.videos}`,
            `📈 Growth: ${s1.growth >= 0 ? '+' : ''}${s1.growth.toFixed(0)}%`,
          ].join('\n'), inline: true },
          { name: `📊 @${c2}`, value: [
            `💰 GMV (7d): ${fmtUsd(s2.gmv7)}`,
            `💰 GMV (30d): ${fmtUsd(s2.gmv30)}`,
            `🛒 Orders: ${s2.orders30}`,
            `🎬 Videos: ${s2.videos}`,
            `📈 Growth: ${s2.growth >= 0 ? '+' : ''}${s2.growth.toFixed(0)}%`,
          ].join('\n'), inline: true },
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[tempo-bot] compare command error:', err);
      await interaction.editReply({ embeds: [errorEmbed('Failed to compare creators. Try again later.')] });
    }
  },
};

export default command;
