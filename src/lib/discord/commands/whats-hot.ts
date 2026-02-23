import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { whatsHotEmbed, errorEmbed } from '../embeds';
import { getGuildConfig, getBrandForGuild } from '../config';
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

    try {
      // TODO: Query What's Hot data from Supabase
      // const videos = await queryWhatsHot(brand);

      const videos: Array<{ title: string; creator: string; views: number; gmv: number }> = [];

      const embed = whatsHotEmbed(guildConfig, videos);
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[tempo-bot] whats-hot command error:', err);
      await interaction.editReply({ embeds: [errorEmbed('Failed to fetch trending videos. Try again later.')] });
    }
  },
};

export default command;
