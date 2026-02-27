import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { errorEmbed, tempoEmbed } from '../embeds';
import { getGuildConfig, getBrandForGuild } from '../config';
import { getSupabase, daysAgo } from '../supabase';
import { brandSlugToUuid } from '@/lib/utils/constants';
import type { TempoCommand } from './index';

const command: TempoCommand = {
  data: new SlashCommandBuilder()
    .setName('whats-hot')
    .setDescription('See trending and rising videos'),

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

    try {
      // Get videos from last 3 days
      const { data: recent, error: e1 } = await supabase
        .from('daily_video_product_stats')
        .select('video_id, video_title, tiktok_username, gmv, orders, video_url')
        .eq('brand_id', brandUuid)
        .gte('report_date', daysAgo(3));
      if (e1) throw e1;

      // Get videos from prior 3 days (days 4-6 ago)
      const { data: prior, error: e2 } = await supabase
        .from('daily_video_product_stats')
        .select('video_id, gmv')
        .eq('brand_id', brandUuid)
        .gte('report_date', daysAgo(6))
        .lt('report_date', daysAgo(3));
      if (e2) throw e2;

      // Aggregate recent by video_id
      const recentMap = new Map<string, { title: string; creator: string; gmv: number; link?: string }>();
      for (const r of recent ?? []) {
        const cur = recentMap.get(r.video_id) ?? { title: r.video_title || 'Untitled', creator: r.tiktok_username, gmv: 0, link: r.video_url };
        cur.gmv += r.gmv || 0;
        recentMap.set(r.video_id, cur);
      }

      // Aggregate prior by video_id
      const priorMap = new Map<string, number>();
      for (const r of prior ?? []) {
        priorMap.set(r.video_id, (priorMap.get(r.video_id) ?? 0) + (r.gmv || 0));
      }

      // Calculate growth
      const entries = [...recentMap.entries()].map(([id, r]) => {
        const priorGmv = priorMap.get(id) ?? 0;
        const growth = priorGmv > 0 ? ((r.gmv - priorGmv) / priorGmv) * 100 : (r.gmv > 0 ? 100 : 0);
        return { ...r, id, growth };
      });

      entries.sort((a, b) => b.growth - a.growth);
      const top5 = entries.slice(0, 5);

      const fmtUsd = (n: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

      const lines = top5.map((v, i) => {
        const title = v.title.length > 50 ? v.title.slice(0, 47) + '...' : v.title;
        const linkText = v.link ? ` [🔗](${v.link})` : '';
        return `**${i + 1}.** ${title}${linkText}\n   👤 @${v.creator} · 📈 ${v.growth.toFixed(0)}% · 💰 ${fmtUsd(v.gmv)}`;
      });

      const embed = tempoEmbed(guildConfig)
        .setTitle('🔥 What\'s Hot')
        .setDescription(lines.join('\n\n') || 'No trending videos right now.');
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[tempo-bot] whats-hot command error:', err);
      await interaction.editReply({ embeds: [errorEmbed('Failed to fetch trending videos. Try again later.')] });
    }
  },
};

export default command;
