import { SlashCommandBuilder, type ChatInputCommandInteraction, type AutocompleteInteraction } from 'discord.js';
import { tempoEmbed, errorEmbed } from '../embeds';
import { getGuildConfig } from '../config';
import { getSupabase, getBotBrandRegistry, daysAgo } from '../supabase';
import { uuidToSlug } from '@/lib/data/brand-registry-core';
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
      .from('creators_v2')
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
    const reg = await getBotBrandRegistry();

    try {
      // Get creator info from creators_v2
      const { data: creators } = await supabase
        .from('creators_v2')
        .select('*')
        .ilike('real_name', `%${name}%`)
        .limit(1);

      if (!creators || creators.length === 0) {
        await interaction.editReply({ embeds: [errorEmbed(`Creator "${name}" not found.`)] });
        return;
      }

      const creator = creators[0];

      // Get brand-specific info
      const { data: brandRows } = await supabase
        .from('creator_brands')
        .select('brand_id, role, status')
        .eq('creator_id', creator.id);

      const primaryBrand = brandRows?.[0];
      const status = primaryBrand?.status ?? 'Unknown';
      const role = primaryBrand?.role ?? 'Creator';

      // Get GMV by brand (30d) using tiktok_username from tiktok_accounts
      const { data: accounts } = await supabase
        .from('tiktok_accounts')
        .select('tiktok_username')
        .eq('creator_id', creator.id);

      const usernames = (accounts ?? []).map((a: any) => a.tiktok_username);

      const { data: perf } = usernames.length > 0
        ? await supabase
            .from('daily_creator_stats')
            .select('brand_id, gmv, orders, est_commission')
            .in('tiktok_username', usernames)
            .gte('report_date', daysAgo(30))
        : { data: [] };

      const brandStats = new Map<string, { gmv: number; orders: number; commission: number }>();
      for (const r of perf ?? []) {
        const slug = uuidToSlug(reg, r.brand_id as string) ?? (r.brand_id as string);
        const cur = brandStats.get(slug) ?? { gmv: 0, orders: 0, commission: 0 };
        cur.gmv += r.gmv || 0;
        cur.orders += r.orders || 0;
        cur.commission += r.est_commission || 0;
        brandStats.set(slug, cur);
      }

      // Posting frequency (last 30d)
      const { count: videoCount } = usernames.length > 0
        ? await supabase
            .from('daily_video_product_stats')
            .select('*', { count: 'exact', head: true })
            .in('tiktok_username', usernames)
            .gte('report_date', daysAgo(30))
        : { count: 0 };

      const fmtUsd = (n: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

      const brandLines = [...brandStats.entries()].map(
        ([b, s]) => `**${b}**: ${fmtUsd(s.gmv)} GMV · ${s.orders} orders`,
      );

      const totalGmv = [...brandStats.values()].reduce((s, b) => s + b.gmv, 0);
      const postsPerWeek = ((videoCount ?? 0) / 30 * 7).toFixed(1);

      const embed = tempoEmbed(guildConfig)
        .setTitle(`👤 ${creator.real_name}`)
        .setDescription(`Status: **${status}** · Role: **${role}**`)
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
        value: `[View Profile](https://tempo-app-wheat.vercel.app/creators/${encodeURIComponent(creator.id)})`,
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[tempo-bot] creator command error:', err);
      await interaction.editReply({ embeds: [errorEmbed('Failed to fetch creator profile. Try again later.')] });
    }
  },
};

export default command;
