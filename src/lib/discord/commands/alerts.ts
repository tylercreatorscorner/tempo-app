import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { tempoEmbed, errorEmbed } from '../embeds';
import { getGuildConfig, getBrandForGuild } from '../config';
import { getSupabase, daysAgo } from '../supabase';
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
    const alerts: string[] = [];

    try {
      // 1. Brand WoW GMV decline (>20%)
      const { data: thisWeek } = await supabase
        .from('creator_performance')
        .select('gmv')
        .eq('brand', brand)
        .gte('report_date', daysAgo(7));
      const { data: lastWeek } = await supabase
        .from('creator_performance')
        .select('gmv')
        .eq('brand', brand)
        .gte('report_date', daysAgo(14))
        .lt('report_date', daysAgo(7));

      const twGmv = (thisWeek ?? []).reduce((s, r) => s + (r.gmv || 0), 0);
      const lwGmv = (lastWeek ?? []).reduce((s, r) => s + (r.gmv || 0), 0);

      if (lwGmv > 0) {
        const change = ((twGmv - lwGmv) / lwGmv) * 100;
        if (change < -20) {
          const fmtUsd = (n: number) =>
            new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
          alerts.push(`🚨 **GMV Decline:** Brand GMV dropped **${change.toFixed(0)}%** WoW (${fmtUsd(lwGmv)} → ${fmtUsd(twGmv)})`);
        }
      }

      // 2. Creators who haven't posted in 5+ days
      const { data: recentVids } = await supabase
        .from('video_performance')
        .select('creator_name, report_date')
        .eq('brand', brand)
        .gte('report_date', daysAgo(30));

      const lastPost = new Map<string, string>();
      for (const v of recentVids ?? []) {
        const cur = lastPost.get(v.creator_name);
        if (!cur || v.report_date > cur) {
          lastPost.set(v.creator_name, v.report_date);
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
        alerts.push(`⚠️ **Inactive Creators (5+ days):**\n${inactive.join(', ')}`);
      }

      // 3. Slacking creators (< 2 posts in 7 days)
      const { data: weekVids } = await supabase
        .from('video_performance')
        .select('creator_name')
        .eq('brand', brand)
        .gte('report_date', daysAgo(7));

      const postCounts = new Map<string, number>();
      for (const v of weekVids ?? []) {
        postCounts.set(v.creator_name, (postCounts.get(v.creator_name) ?? 0) + 1);
      }

      // Get all managed creators for this brand to check who's slacking
      const { data: managed } = await supabase
        .from('managed_creators')
        .select('real_name')
        .eq('brand', brand)
        .eq('status', 'active');

      const slacking: string[] = [];
      for (const mc of managed ?? []) {
        const count = postCounts.get(mc.real_name) ?? 0;
        if (count < 2) {
          slacking.push(`@${mc.real_name} (${count} posts)`);
        }
      }
      if (slacking.length > 0) {
        alerts.push(`😴 **Low Activity (<2 posts/7d):**\n${slacking.join(', ')}`);
      }

      const embed = tempoEmbed(guildConfig)
        .setTitle('🚨 Alerts')
        .setDescription(alerts.length > 0 ? alerts.join('\n\n') : '✅ No alerts — everything looks good!');

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[tempo-bot] alerts command error:', err);
      await interaction.editReply({ embeds: [errorEmbed('Failed to check alerts. Try again later.')] });
    }
  },
};

export default command;
