import { SlashCommandBuilder, type ChatInputCommandInteraction, type AutocompleteInteraction } from 'discord.js';
import { tempoEmbed, errorEmbed } from '../embeds';
import { getGuildConfig } from '../config';
import { getSupabase, daysAgo } from '../supabase';
import type { TempoCommand } from './index';

const command: TempoCommand = {
  data: new SlashCommandBuilder()
    .setName('creator')
    .setDescription('Detailed creator profile')
    .addStringOption((opt) =>
      opt.setName('name').setDescription('Creator name').setRequired(true).setAutocomplete(true),
    ),

  async autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused();
    const supabase = getSupabase();
    const { data } = await supabase
      .from('managed_creators')
      .select('real_name')
      .ilike('real_name', `%${focused}%`)
      .limit(25);
    const choices = (data ?? []).map((r: any) => ({ name: r.real_name, value: r.real_name }));
    await interaction.respond(choices);
  },

  async execute(interaction: ChatInputCommandInteraction) {
    const guildConfig = interaction.guildId ? getGuildConfig(interaction.guildId) : undefined;
    const name = interaction.options.getString('name', true);

    await interaction.deferReply();
    const supabase = getSupabase();

    try {
      // Get creator info
      const { data: creators } = await supabase
        .from('managed_creators')
        .select('*')
        .ilike('real_name', `%${name}%`)
        .limit(1);

      if (!creators || creators.length === 0) {
        await interaction.editReply({ embeds: [errorEmbed(`Creator "${name}" not found.`)] });
        return;
      }

      const creator = creators[0];

      // Get GMV by brand (30d)
      const { data: perf } = await supabase
        .from('creator_performance')
        .select('brand, gmv, orders, est_commission')
        .ilike('creator_name', `%${name}%`)
        .gte('report_date', daysAgo(30));

      const brandStats = new Map<string, { gmv: number; orders: number; commission: number }>();
      for (const r of perf ?? []) {
        const cur = brandStats.get(r.brand) ?? { gmv: 0, orders: 0, commission: 0 };
        cur.gmv += r.gmv || 0;
        cur.orders += r.orders || 0;
        cur.commission += r.est_commission || 0;
        brandStats.set(r.brand, cur);
      }

      // Posting frequency (last 30d)
      const { count: videoCount } = await supabase
        .from('video_performance')
        .select('*', { count: 'exact', head: true })
        .ilike('creator_name', `%${name}%`)
        .gte('report_date', daysAgo(30));

      const fmtUsd = (n: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

      const brandLines = [...brandStats.entries()].map(
        ([b, s]) => `**${b}**: ${fmtUsd(s.gmv)} GMV · ${s.orders} orders`,
      );

      const totalGmv = [...brandStats.values()].reduce((s, b) => s + b.gmv, 0);
      const postsPerWeek = ((videoCount ?? 0) / 30 * 7).toFixed(1);

      const embed = tempoEmbed(guildConfig)
        .setTitle(`👤 ${creator.real_name}`)
        .setDescription(`Status: **${creator.status}** · Role: **${creator.role ?? 'Creator'}**`)
        .addFields(
          { name: '💰 Total GMV (30d)', value: fmtUsd(totalGmv), inline: true },
          { name: '🎬 Videos (30d)', value: `${videoCount ?? 0}`, inline: true },
          { name: '📊 Posts/Week', value: postsPerWeek, inline: true },
        );

      if (brandLines.length > 0) {
        embed.addFields({ name: '🏷️ GMV by Brand', value: brandLines.join('\n') });
      }

      embed.addFields({
        name: '🔗 Dashboard',
        value: `[View Profile](https://tempo-app-wheat.vercel.app/creators/${encodeURIComponent(creator.real_name)})`,
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[tempo-bot] creator command error:', err);
      await interaction.editReply({ embeds: [errorEmbed('Failed to fetch creator profile. Try again later.')] });
    }
  },
};

export default command;
