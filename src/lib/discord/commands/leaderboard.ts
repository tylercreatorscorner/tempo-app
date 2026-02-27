import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { leaderboardEmbed, errorEmbed } from '../embeds';
import { getGuildConfig, getBrandForGuild } from '../config';
import { getSupabase, daysAgo, periodToDays } from '../supabase';
import { BRAND_DISPLAY_NAMES, brandSlugToUuid } from '@/lib/utils/constants';
import type { TempoCommand } from './index';

const command: TempoCommand = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Top creators ranked by GMV')
    .addStringOption((opt) =>
      opt.setName('brand').setDescription('Brand to filter (defaults to this server\'s brand)').setRequired(false),
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
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const guildConfig = interaction.guildId ? getGuildConfig(interaction.guildId) : undefined;
    const defaultBrand = interaction.guildId ? getBrandForGuild(interaction.guildId) : null;
    const brand = interaction.options.getString('brand') ?? defaultBrand;
    const period = interaction.options.getString('period') ?? '7d';

    if (!brand) {
      await interaction.reply({ embeds: [errorEmbed('This server is not linked to a brand.')], ephemeral: true });
      return;
    }

    await interaction.deferReply();
    const supabase = getSupabase();
    const brandUuid = brandSlugToUuid(brand);
    const days = periodToDays(period);
    const since = daysAgo(days);

    try {
      const { data, error } = await supabase
        .from('daily_creator_stats')
        .select('tiktok_username, gmv, orders')
        .eq('brand_id', brandUuid)
        .gte('report_date', since);

      if (error) throw error;

      // Aggregate by creator
      const map = new Map<string, { gmv: number; orders: number; videos: number }>();
      for (const row of data ?? []) {
        const key = row.tiktok_username;
        const cur = map.get(key) ?? { gmv: 0, orders: 0, videos: 0 };
        cur.gmv += row.gmv || 0;
        cur.orders += row.orders || 0;
        map.set(key, cur);
      }

      // Get video counts per creator
      const { data: vids } = await supabase
        .from('daily_video_product_stats')
        .select('tiktok_username')
        .eq('brand_id', brandUuid)
        .gte('report_date', since);

      const vidCounts = new Map<string, number>();
      for (const v of vids ?? []) {
        vidCounts.set(v.tiktok_username, (vidCounts.get(v.tiktok_username) ?? 0) + 1);
      }

      for (const [name, entry] of map) {
        entry.videos = vidCounts.get(name) ?? 0;
      }

      const creators = [...map.entries()]
        .map(([name, s]) => ({ name, gmv: s.gmv, orders: s.orders, videos: s.videos }))
        .sort((a, b) => b.gmv - a.gmv)
        .slice(0, 10);

      const brandName = BRAND_DISPLAY_NAMES[brand] ?? brand;
      const periodLabels: Record<string, string> = {
        '7d': 'Last 7 days', '14d': 'Last 14 days', '30d': 'Last 30 days',
      };

      const embed = leaderboardEmbed(guildConfig, brandName, periodLabels[period] ?? period, creators);
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[tempo-bot] leaderboard command error:', err);
      await interaction.editReply({ embeds: [errorEmbed('Failed to fetch leaderboard. Try again later.')] });
    }
  },
};

export default command;
