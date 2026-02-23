import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { helpEmbed } from '../embeds';
import type { TempoCommand } from './index';

const command: TempoCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('List all Tempo Bot commands'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply({ embeds: [helpEmbed()], ephemeral: true });
  },
};

export default command;
