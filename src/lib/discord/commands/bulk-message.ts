/**
 * /bulk-dm [role] [text] — DM all members with a role
 * /bulk-announce [channel] [text] — Post formatted announcement
 */

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  ChannelType,
  type TextChannel,
  EmbedBuilder,
} from 'discord.js';
import { tempoEmbed, errorEmbed } from '../embeds';
import { getGuildConfig } from '../config';
import { sendBulkDMs } from '../relay';

const data = new SlashCommandBuilder()
  .setName('bulk')
  .setDescription('Bulk messaging commands')
  .addSubcommand((sub) =>
    sub
      .setName('dm')
      .setDescription('DM all members with a specific role')
      .addRoleOption((opt) =>
        opt.setName('role').setDescription('Role to target').setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('text').setDescription('Message to send').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('announce')
      .setDescription('Post a formatted announcement to a channel')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Target channel')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('text').setDescription('Announcement body').setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('title').setDescription('Embed title (optional)').setRequired(false),
      )
      .addStringOption((opt) =>
        opt.setName('color').setDescription('Hex color, e.g. #FF5733 (optional)').setRequired(false),
      )
      .addRoleOption((opt) =>
        opt.setName('mention').setDescription('Role to @mention (optional)').setRequired(false),
      ),
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guildConfig = interaction.guildId ? getGuildConfig(interaction.guildId) : undefined;

  if (sub === 'dm') {
    await handleBulkDM(interaction, guildConfig);
  } else if (sub === 'announce') {
    await handleBulkAnnounce(interaction, guildConfig);
  }
}

async function handleBulkDM(
  interaction: ChatInputCommandInteraction,
  guildConfig: ReturnType<typeof getGuildConfig>,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const role = interaction.options.getRole('role', true);
  const text = interaction.options.getString('text', true);

  if (!interaction.guild) {
    await interaction.editReply({ embeds: [errorEmbed('This command must be used in a server.')] });
    return;
  }

  // Fetch guild members with the role
  await interaction.guild.members.fetch();
  const members = interaction.guild.members.cache.filter(
    (m) => m.roles.cache.has(role.id) && !m.user.bot,
  );

  if (members.size === 0) {
    await interaction.editReply({ embeds: [errorEmbed(`No members found with role @${role.name}.`)] });
    return;
  }

  // Show initial progress
  const progressEmbed = tempoEmbed(guildConfig)
    .setTitle('📤 Sending Bulk DMs...')
    .setDescription(`Sending to **${members.size}** members with @${role.name}\n\n⏳ 0/${members.size} sent...`);
  await interaction.editReply({ embeds: [progressEmbed] });

  const userIds = members.map((m) => m.user.id);

  // Update progress periodically
  let lastUpdate = 0;
  const result = await sendBulkDMs(
    interaction.client,
    userIds,
    text,
    { sentBy: interaction.user.tag, channel: 'bulk' },
    1000,
    (sent, total) => {
      // Update every 5 sends to avoid rate limiting the edit
      if (sent - lastUpdate >= 5 || sent === total) {
        lastUpdate = sent;
        const pEmbed = tempoEmbed(guildConfig)
          .setTitle('📤 Sending Bulk DMs...')
          .setDescription(`Sending to **${total}** members with @${role.name}\n\n⏳ ${sent}/${total} sent...`);
        interaction.editReply({ embeds: [pEmbed] }).catch(() => {});
      }
    },
  );

  // Final result
  const embed = tempoEmbed(guildConfig)
    .setTitle('✅ Bulk DM Complete')
    .addFields(
      { name: 'Role', value: `@${role.name}`, inline: true },
      { name: 'Total', value: String(result.total), inline: true },
      { name: '✅ Sent', value: String(result.sent), inline: true },
      { name: '🚫 Blocked', value: String(result.blocked), inline: true },
      { name: '❌ Failed', value: String(result.failed), inline: true },
    );

  if (result.errors.length > 0) {
    const errorSummary = result.errors
      .slice(0, 10)
      .map((e) => `<@${e.userId}>: ${e.error}`)
      .join('\n');
    embed.addFields({ name: 'Errors', value: errorSummary.slice(0, 1024) });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleBulkAnnounce(
  interaction: ChatInputCommandInteraction,
  guildConfig: ReturnType<typeof getGuildConfig>,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.options.getChannel('channel', true) as TextChannel;
  const text = interaction.options.getString('text', true);
  const title = interaction.options.getString('title');
  const colorHex = interaction.options.getString('color');
  const mentionRole = interaction.options.getRole('mention');

  try {
    const embed = new EmbedBuilder()
      .setDescription(text)
      .setTimestamp();

    if (title) embed.setTitle(title);

    if (colorHex) {
      const parsed = parseInt(colorHex.replace('#', ''), 16);
      if (!isNaN(parsed)) embed.setColor(parsed);
    } else if (guildConfig) {
      embed.setColor(parseInt(guildConfig.color.replace('#', ''), 16));
    }

    const content = mentionRole ? `<@&${mentionRole.id}>` : undefined;
    await channel.send({ content, embeds: [embed] });

    const confirmEmbed = tempoEmbed(guildConfig)
      .setTitle('✅ Announcement Posted')
      .addFields(
        { name: 'Channel', value: `<#${channel.id}>`, inline: true },
        { name: 'Mentioned', value: mentionRole ? `@${mentionRole.name}` : 'None', inline: true },
      );

    await interaction.editReply({ embeds: [confirmEmbed] });
  } catch (err: any) {
    await interaction.editReply({ embeds: [errorEmbed(`Failed: ${err.message}`)] });
  }
}

export default { data, execute };
