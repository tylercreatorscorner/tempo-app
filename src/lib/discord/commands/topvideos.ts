import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { tempoEmbed, errorEmbed } from '../embeds';
import { getGuildConfig, getBrandForGuild } from '../config';
import { getSupabase, daysAgo, periodToDays } from '../supabase';
import { brandSlugToUuid } from '@/lib/utils/constants';
import type { TempoCommand } from './index';

const command: TempoCommand = {
  data: new SlashCommandBuilder()
    .setName('topvideos')
    .setDescription('Top performing videos for this brand')
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
    )
    .addIntegerOption((opt) =>
      opt
        .setName('limit')
        .setDescription('Number of videos to show (default 5, max 10)')
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const guildConfig = interaction.guildId ? getGuildConfig(interaction.guildId) : undefined;
    const brand = interaction.guildId ? getBrandForGuild(interaction.guildId) : null;

    if (!brand) {
      await interaction.reply({ embeds: [errorEmbed('This server is not linked to a brand.')], ephemeral: true });
      return;
    }

    await interaction.deferReply();
    const supabase = getSupabase();
    const brandUuid = brandSlugToUuid(brand);
    const period = interaction.options.getString('period') ?? '7d';
    const limit = Math.min(Math.max(interaction.options.getInteger('limit') ?? 5, 1), 10);
    const days = periodToDays(period);
    const since = daysAgo(days);

    try {
      const { data, error } = await supabase
        .from('daily_video_product_stats')
        .select('video_id, video_title, video_url, tiktok_username, gmv, orders, items_sold')
        .eq('brand_id', brandUuid)
        .gte('report_date', since);

      if (error) throw error;

      // Aggregate by video_id — sum across products and days
      const videoMap = new Map<string, {
        title: string;
        url: string | null;
        creator: string;
        gmv: number;
        orders: number;
        items: number;
      }>();

      for (const r of data ?? []) {
        const cur = videoMap.get(r.video_id) ?? {
          title: r.video_title ?? r.video_id,
          url: r.video_url ?? null,
          creator: r.tiktok_username,
          gmv: 0,
          orders: 0,
          items: 0,
        };
        cur.gmv += r.gmv || 0;
        cur.orders += r.orders || 0;
        cur.items += r.items_sold || 0;
        videoMap.set(r.video_id, cur);
      }

      const topVideos = [...videoMap.values()]
        .sort((a, b) => b.gmv - a.gmv)
        .slice(0, limit);

      if (topVideos.length === 0) {
        await interaction.editReply({
          embeds: [errorEmbed(`No video data found for the last ${days} days.`)],
        });
        return;
      }

      const fmtUsd = (n: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
      const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);

      const medals = ['🥇', '🥈', '🥉'];
      const lines = topVideos.map((v, i) => {
        const prefix = i < 3 ? medals[i] : `**${i + 1}.**`;
        const rawTitle = v.title || 'Untitled';
        const title = rawTitle.length > 42 ? rawTitle.slice(0, 39) + '…' : rawTitle;
        const link = v.url ? `[${title}](${v.url})` : `**${title}**`;
        return `${prefix} ${link}\n   @${v.creator} — ${fmtUsd(v.gmv)} · ${fmt(v.orders)} orders`;
      });

      const periodLabels: Record<string, string> = {
        '7d': 'Last 7 days',
        '14d': 'Last 14 days',
        '30d': 'Last 30 days',
      };

      const embed = tempoEmbed(guildConfig)
        .setTitle(`🎬 Top Videos — ${periodLabels[period] ?? period}`)
        .setDescription(lines.join('\n\n'));

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[tempo-bot] topvideos command error:', err);
      await interaction.editReply({ embeds: [errorEmbed('Failed to fetch video data. Try again later.')] });
    }
  },
};

export default command;
