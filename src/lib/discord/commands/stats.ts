import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { creatorStatsEmbed, errorEmbed } from '../embeds';
import { getGuildConfig, getBrandForGuild } from '../config';
import type { TempoCommand } from './index';

const command: TempoCommand = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View creator performance stats')
    .addStringOption((opt) =>
      opt.setName('creator').setDescription('Creator username').setRequired(false),
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
          { name: 'This month', value: 'month' },
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const guildConfig = interaction.guildId ? getGuildConfig(interaction.guildId) : undefined;
    const brand = interaction.guildId ? getBrandForGuild(interaction.guildId) : null;
    const creator = interaction.options.getString('creator');
    const period = interaction.options.getString('period') ?? '7d';

    if (!brand) {
      await interaction.reply({ embeds: [errorEmbed('This server is not linked to a brand.')], ephemeral: true });
      return;
    }

    if (!creator) {
      await interaction.reply({ embeds: [errorEmbed('Please specify a creator username.')], ephemeral: true });
      return;
    }

    await interaction.deferReply();

    try {
      // TODO: Query Supabase for actual creator stats
      // const stats = await queryCreatorStats(brand, creator, period);

      // Placeholder data — replace with real Supabase query
      const stats = {
        gmv: 0,
        orders: 0,
        videos: 0,
        impressions: 0,
        itemsSold: 0,
      };

      const periodLabels: Record<string, string> = {
        '7d': 'Last 7 days',
        '14d': 'Last 14 days',
        '30d': 'Last 30 days',
        'month': 'This month',
      };

      const embed = creatorStatsEmbed(guildConfig, creator, periodLabels[period] ?? period, stats);
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[tempo-bot] stats command error:', err);
      await interaction.editReply({ embeds: [errorEmbed('Failed to fetch creator stats. Try again later.')] });
    }
  },
};

export default command;
