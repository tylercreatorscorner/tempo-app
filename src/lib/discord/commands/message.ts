/**
 * /tempo message [creator] [text] — DM a creator
 * /tempo message-channel [channel] [text] — Post to a channel
 */

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  ChannelType,
  type TextChannel,
} from 'discord.js';
import { tempoEmbed, errorEmbed } from '../embeds';
import { getGuildConfig } from '../config';
import { getSupabase } from '../supabase';
import { sendTrackedDM } from '../relay';

const data = new SlashCommandBuilder()
  .setName('message')
  .setDescription('Send messages to creators')
  .addSubcommand((sub) =>
    sub
      .setName('creator')
      .setDescription('DM a managed creator')
      .addStringOption((opt) =>
        opt.setName('creator').setDescription('Creator name or handle').setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('text').setDescription('Message to send').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('channel')
      .setDescription('Post an announcement to a channel')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Target channel')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('text').setDescription('Message to post').setRequired(true),
      ),
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guildConfig = interaction.guildId ? getGuildConfig(interaction.guildId) : undefined;

  if (sub === 'creator') {
    await handleCreatorDM(interaction, guildConfig);
  } else if (sub === 'channel') {
    await handleChannelPost(interaction, guildConfig);
  }
}

async function handleCreatorDM(
  interaction: ChatInputCommandInteraction,
  guildConfig: ReturnType<typeof getGuildConfig>,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const creatorName = interaction.options.getString('creator', true);
  const text = interaction.options.getString('text', true);
  const supabase = getSupabase();

  // Look up creator in managed_creators
  const { data: creators } = await supabase
    .from('managed_creators')
    .select('id, creator_name, discord_user_id, tenant_id')
    .ilike('creator_name', `%${creatorName}%`)
    .limit(1);

  const creator = creators?.[0];

  if (creator?.discord_user_id) {
    // Send DM
    const result = await sendTrackedDM(
      interaction.client,
      creator.discord_user_id,
      text,
      {
        tenantId: creator.tenant_id,
        creatorId: creator.id,
        sentBy: interaction.user.tag,
        channel: 'dm',
      },
    );

    const statusEmoji = result.success ? '✅' : result.status === 'blocked' ? '🚫' : '❌';
    const embed = tempoEmbed(guildConfig)
      .setTitle(`${statusEmoji} Message ${result.success ? 'Sent' : 'Failed'}`)
      .addFields(
        { name: 'To', value: `@${creator.creator_name}`, inline: true },
        { name: 'Status', value: result.status, inline: true },
        { name: 'Message', value: text.slice(0, 1024) },
      );

    if (result.error) {
      embed.addFields({ name: 'Error', value: result.error });
    }

    await interaction.editReply({ embeds: [embed] });
  } else {
    // Fallback: post in relay channel with @mention or just show not found
    const relayChannelId = guildConfig?.channels.alerts;
    if (relayChannelId && interaction.guild) {
      try {
        const channel = (await interaction.guild.channels.fetch(relayChannelId)) as TextChannel;
        const mention = creator?.discord_user_id
          ? `<@${creator.discord_user_id}>`
          : `**@${creatorName}**`;
        await channel.send(`📨 Message for ${mention}:\n\n${text}`);

        const embed = tempoEmbed(guildConfig)
          .setTitle('📨 Message Posted to Channel')
          .setDescription(
            creator
              ? `Creator found but no Discord ID linked. Posted in <#${relayChannelId}>.`
              : `Creator "${creatorName}" not found in database. Posted in <#${relayChannelId}>.`,
          )
          .addFields({ name: 'Message', value: text.slice(0, 1024) });

        await interaction.editReply({ embeds: [embed] });
      } catch {
        await interaction.editReply({
          embeds: [errorEmbed(`Could not post to relay channel.`)],
        });
      }
    } else {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            creator
              ? `Creator "${creator.creator_name}" has no Discord ID linked.`
              : `Creator "${creatorName}" not found. Make sure they're in managed_creators.`,
          ),
        ],
      });
    }
  }
}

async function handleChannelPost(
  interaction: ChatInputCommandInteraction,
  guildConfig: ReturnType<typeof getGuildConfig>,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.options.getChannel('channel', true) as TextChannel;
  const text = interaction.options.getString('text', true);

  try {
    await channel.send(text);

    const embed = tempoEmbed(guildConfig)
      .setTitle('✅ Message Posted')
      .addFields(
        { name: 'Channel', value: `<#${channel.id}>`, inline: true },
        { name: 'Message', value: text.slice(0, 1024) },
      );

    await interaction.editReply({ embeds: [embed] });
  } catch (err: any) {
    await interaction.editReply({
      embeds: [errorEmbed(`Failed to post: ${err.message}`)],
    });
  }
}

export default { data, execute };
