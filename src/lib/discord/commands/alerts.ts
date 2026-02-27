import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { tempoEmbed, errorEmbed } from '../embeds';
import { getGuildConfig, getBrandForGuild } from '../config';
import { getSupabase, daysAgo } from '../supabase';
import { brandSlugToUuid } from '@/lib/utils/constants';
import type { TempoCommand } from './index';

const command: TempoCommand = {
  data: new SlashCommandBuilder()
    .setName('alerts')
    .setDescription('Show performance alerts and warnings'),

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
    const alerts: string[] = [];

    try {
      // 1. Brand WoW GMV decline (>20%)
      const { data: thisWeek } = await supabase
        .from('daily_creator_stats')
        .select('gmv')
        .eq('brand_id', brandUuid)
        .gte('report_date', daysAgo(7));
      const { data: lastWeek } = await supabase
        .from('daily_creator_stats')
        .select('gmv')
        .eq('brand_id', brandUuid)
        .gte('report_date', daysAgo(14))
        .lt('report_date', daysAgo(7));

      const twGmv = (thisWeek ?? []).reduce((s, r) => s + (r.gmv || 0), 0);
      const lwGmv = (lastWeek ?? []).reduce((s, r) => s + (r.gmv || 0), 0);

      if (lwGmv > 0) {
        const change = ((twGmv - lwGmv) / lwGmv) * 100;
        if (change < -20) {
          const fmtUsd = (n: number) =>
            new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
          alerts.push(`📉 **GMV Decline:** Brand GMV dropped **${change.toFixed(0)}%** WoW (${fmtUsd(lwGmv)} → ${fmtUsd(twGmv)})`);
        }
      }

      // 2. Creators who haven't posted in 5+ days
      const { data: recentVids } = await supabase
        .from('daily_video_product_stats')
        .select('tiktok_username, report_date')
        .eq('brand_id', brandUuid)
        .gte('report_date', daysAgo(30));

      const lastPost = new Map<string, string>();
      for (const v of recentVids ?? []) {
        const cur = lastPost.get(v.tiktok_username);
        if (!cur || v.report_date > cur) {
          lastPost.set(v.tiktok_username, v.report_date);
        }
      }

      const fiveDaysAgo = daysAgo(5);
      const inactive: string[] = [];
      for (const [name, date] of lastPost) {
        if (date < fiveDaysAgo) {
          const daysSince = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
          inactive.push(`@${name} (${daysSince}d ago)`);
        }
      }
      if (inactive.length > 0) {
        alerts.push(`😴 **Inactive Creators (5+ days):**\n${inactive.join(', ')}`);
      }

      // 3. Slacking creators (< 2 posts in 7 days)
      const { data: weekVids } = await supabase
        .from('daily_video_product_stats')
        .select('tiktok_username')
        .eq('brand_id', brandUuid)
        .gte('report_date', daysAgo(7));

      const postCounts = new Map<string, number>();
      for (const v of weekVids ?? []) {
        postCounts.set(v.tiktok_username, (postCounts.get(v.tiktok_username) ?? 0) + 1);
      }

      // Get all managed creators for this brand
      const { data: managed } = await supabase
        .from('creator_brands')
        .select('creator:creators_v2(real_name)')
        .eq('brand_id', brandUuid)
        .eq('status', 'Active');

      const slacking: string[] = [];
      for (const mc of managed ?? []) {
        const creator = mc.creator as unknown as { real_name: string } | null;
        const name = creator?.real_name;
        if (!name) continue;
        const count = postCounts.get(name) ?? 0;
        if (count < 2) {
          slacking.push(`@${name} (${count} posts)`);
        }
      }
      if (slacking.length > 0) {
        alerts.push(`📉 **Low Activity (<2 posts/7d):**\n${slacking.join(', ')}`);
      }

      const embed = tempoEmbed(guildConfig)
        .setTitle('📉 Alerts')
        .setDescription(alerts.length > 0 ? alerts.join('\n\n') : '✅ No alerts — everything looks good!');

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[tempo-bot] alerts command error:', err);
      await interaction.editReply({ embeds: [errorEmbed('Failed to check alerts. Try again later.')] });
    }
  },
};

export default command;
