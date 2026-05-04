import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { tempoEmbed, errorEmbed } from '../embeds';
import { getGuildConfig } from '../config';
import { sendDailyBrief } from '../scheduler';
import type { TempoCommand } from './index';

const command: TempoCommand = {
  data: new SlashCommandBuilder()
    .setName('brief')
    .setDescription('Post the daily performance brief to the configured channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false) as unknown as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }

    const guildConfig = getGuildConfig(interaction.guildId);
    if (!guildConfig) {
      await interaction.reply({
        embeds: [errorEmbed('This server is not configured in Tempo.')],
        ephemeral: true,
      });
      return;
    }

    if (!guildConfig.channels.dailyBrief) {
      await interaction.reply({
        embeds: [errorEmbed(
          'No `dailyBrief` channel configured for this server.\n' +
          'Set it in the guild config to enable automated briefs.',
        )],
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      await sendDailyBrief(interaction.client, interaction.guildId);

      const embed = tempoEmbed(guildConfig)
        .setTitle('✅ Daily Brief Posted')
        .setDescription(`Brief sent to <#${guildConfig.channels.dailyBrief}>`);

      await interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
      console.error('[tempo-bot] brief command error:', err);
      await interaction.editReply({ embeds: [errorEmbed(`Failed to send brief: ${err.message}`)] });
    }
  },
};

export default command;
