import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { tempoEmbed, errorEmbed } from '../embeds';
import { getGuildConfig, getBrandForGuild } from '../config';
import { getSupabase, getBotBrandRegistry, daysAgo, periodToDays } from '../supabase';
import { slugToUuid } from '@/lib/data/brand-registry-core';
import type { TempoCommand } from './index';

const command: TempoCommand = {
  data: new SlashCommandBuilder()
    .setName('myrank')
    .setDescription('See your rank and stats as a creator for this brand')
    .addStringOption((opt) =>
      opt
        .setName('period')
        .setDescription('Time period')
        .setRequired(false)
        .addChoices(
          { name: 'Last 7 days', value: '7d' },
          { name: 'Last 30 days', value: '30d' },
          { name: 'This month', value: 'month' },
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const guildConfig = interaction.guildId ? getGuildConfig(interaction.guildId) : undefined;
    const brand = interaction.guildId ? getBrandForGuild(interaction.guildId) : null;

    if (!brand) {
      await interaction.reply({ embeds: [errorEmbed('This server is not linked to a brand.')], ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const supabase = getSupabase();
    const reg = await getBotBrandRegistry();
    const brandUuid = slugToUuid(reg, brand.toLowerCase().replace(/['\s]/g, '_'));
    const period = interaction.options.getString('period') ?? '7d';
    const days = periodToDays(period);
    const since = daysAgo(days);
    const discordId = interaction.user.id;

    try {
      // Find the creator record linked to this Discord user
      const { data: creators } = await supabase
        .from('creators_v2')
        .select('id, real_name')
        .eq('discord_id', discordId)
        .limit(1);

      if (!creators || creators.length === 0) {
        await interaction.editReply({
          embeds: [errorEmbed(
            "You're not linked to a creator account yet.\nAsk your manager to run `/scan` and approve your match!",
          )],
        });
        return;
      }

      const creator = creators[0];

      // Get their TikTok usernames for this brand
      const { data: accounts } = await supabase
        .from('tiktok_accounts')
        .select('tiktok_username')
        .eq('creator_id', creator.id)
        .eq('brand_id', brandUuid);

      const usernames = (accounts ?? []).map((a: any) => a.tiktok_username as string);

      if (usernames.length === 0) {
        await interaction.editReply({
          embeds: [errorEmbed("No TikTok account linked for this brand yet. Contact your manager!")],
        });
        return;
      }

      // Get this creator's aggregated stats
      const { data: myStats } = await supabase
        .from('daily_creator_stats')
        .select('gmv, orders, items_sold, est_commission, videos')
        .eq('brand_id', brandUuid)
        .in('tiktok_username', usernames)
        .gte('report_date', since);

      const myGmv = (myStats ?? []).reduce((s, r) => s + (r.gmv || 0), 0);
      const myOrders = (myStats ?? []).reduce((s, r) => s + (r.orders || 0), 0);
      const myCommission = (myStats ?? []).reduce((s, r) => s + (r.est_commission || 0), 0);
      const myVideos = (myStats ?? []).reduce((s, r) => s + (r.videos || 0), 0);

      // Get all brand creators' GMV for ranking
      const { data: allStats } = await supabase
        .from('daily_creator_stats')
        .select('tiktok_username, gmv')
        .eq('brand_id', brandUuid)
        .gte('report_date', since);

      // Aggregate per creator username
      const creatorGmv = new Map<string, number>();
      for (const r of allStats ?? []) {
        creatorGmv.set(r.tiktok_username, (creatorGmv.get(r.tiktok_username) ?? 0) + (r.gmv || 0));
      }

      // Collapse my multiple usernames into one bucket for ranking
      const myKey = usernames[0];
      let myTotal = 0;
      for (const u of usernames) {
        myTotal += creatorGmv.get(u) ?? 0;
        creatorGmv.delete(u);
      }
      creatorGmv.set(myKey, myTotal);

      const ranked = [...creatorGmv.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name);

      const myRank = ranked.indexOf(myKey) + 1;
      const totalCreators = ranked.length;

      const fmtUsd = (n: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

      const periodLabels: Record<string, string> = {
        '7d': 'Last 7 days',
        '30d': 'Last 30 days',
        month: 'This month',
      };

      const rankEmoji = myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : '📊';
      const displayName = creator.real_name ?? interaction.user.username;

      const embed = tempoEmbed(guildConfig)
        .setTitle(`${rankEmoji} Your Stats — ${displayName}`)
        .setDescription(`Period: **${periodLabels[period] ?? period}**`)
        .addFields(
          { name: '🏆 Rank', value: `#${myRank} of ${totalCreators}`, inline: true },
          { name: '💰 GMV', value: fmtUsd(myGmv), inline: true },
          { name: '💵 Est. Commission', value: fmtUsd(myCommission), inline: true },
          { name: '🛒 Orders', value: String(myOrders), inline: true },
          { name: '🎬 Videos', value: String(myVideos), inline: true },
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[tempo-bot] myrank command error:', err);
      await interaction.editReply({ embeds: [errorEmbed('Failed to fetch your stats. Try again later.')] });
    }
  },
};

export default command;
