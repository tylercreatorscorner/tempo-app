import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { leaderboardEmbed, errorEmbed } from '../embeds';
import { getGuildConfig, getBrandForGuild } from '../config';
import { BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';
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
          { name: 'This month', value: 'month' },
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

    try {
      // TODO: Query Supabase for leaderboard data
      // const creators = await queryLeaderboard(brand, period);

      const creators: Array<{ name: string; gmv: number; videos: number }> = [];

      const brandName = BRAND_DISPLAY_NAMES[brand] ?? brand;
      const periodLabels: Record<string, string> = {
        '7d': 'Last 7 days',
        '14d': 'Last 14 days',
        '30d': 'Last 30 days',
        'month': 'This month',
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
