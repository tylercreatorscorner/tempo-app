import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { tempoEmbed } from '../embeds';
import { getGuildConfig } from '../config';
import type { TempoCommand } from './index';

const command: TempoCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check if Tempo Bot is online'),

  async execute(interaction: ChatInputCommandInteraction) {
    const guildConfig = interaction.guildId ? getGuildConfig(interaction.guildId) : undefined;
    const latency = Date.now() - interaction.createdTimestamp;

    const embed = tempoEmbed(guildConfig)
      .setTitle('🏓 Pong!')
      .setDescription(`Latency: **${latency}ms**\nAPI Latency: **${interaction.client.ws.ping}ms**`);

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
