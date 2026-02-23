/**
 * /reminder create [creator] [text] [when] — Schedule a reminder DM
 * /reminder posting [days] — Auto-remind inactive creators
 */

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { tempoEmbed, errorEmbed } from '../embeds';
import { getGuildConfig } from '../config';
import { getSupabase, daysAgo } from '../supabase';
import { sendTrackedDM } from '../relay';

const data = new SlashCommandBuilder()
  .setName('reminder')
  .setDescription('Reminder commands')
  .addSubcommand((sub) =>
    sub
      .setName('create')
      .setDescription('Schedule a reminder DM to a creator')
      .addStringOption((opt) =>
        opt.setName('creator').setDescription('Creator name').setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('text').setDescription('Reminder message').setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('when')
          .setDescription('When to send: 1h, 4h, tomorrow, monday, or YYYY-MM-DD HH:MM')
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('posting')
      .setDescription('Auto-remind creators who haven\'t posted in X days')
      .addIntegerOption((opt) =>
        opt
          .setName('days')
          .setDescription('Days of inactivity before reminding (default 7)')
          .setRequired(false),
      ),
  );

/** Parse a "when" string to a Date */
function parseWhen(when: string): Date | null {
  const now = new Date();

  // Hours: 1h, 4h, 24h
  const hoursMatch = when.match(/^(\d+)h$/i);
  if (hoursMatch) {
    const h = parseInt(hoursMatch[1]);
    return new Date(now.getTime() + h * 60 * 60 * 1000);
  }

  // Minutes: 30m, 15m
  const minMatch = when.match(/^(\d+)m$/i);
  if (minMatch) {
    const m = parseInt(minMatch[1]);
    return new Date(now.getTime() + m * 60 * 1000);
  }

  // tomorrow
  if (when.toLowerCase() === 'tomorrow') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  // Day of week
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIdx = days.indexOf(when.toLowerCase());
  if (dayIdx >= 0) {
    const d = new Date(now);
    const diff = (dayIdx - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  // Custom datetime: YYYY-MM-DD HH:MM
  const parsed = new Date(when);
  if (!isNaN(parsed.getTime())) return parsed;

  return null;
}

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guildConfig = interaction.guildId ? getGuildConfig(interaction.guildId) : undefined;

  if (sub === 'create') {
    await handleCreate(interaction, guildConfig);
  } else if (sub === 'posting') {
    await handlePostingReminder(interaction, guildConfig);
  }
}

async function handleCreate(
  interaction: ChatInputCommandInteraction,
  guildConfig: ReturnType<typeof getGuildConfig>,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const creatorName = interaction.options.getString('creator', true);
  const text = interaction.options.getString('text', true);
  const when = interaction.options.getString('when', true);
  const supabase = getSupabase();

  const scheduledFor = parseWhen(when);
  if (!scheduledFor) {
    await interaction.editReply({
      embeds: [errorEmbed(`Could not parse time "${when}". Use: 1h, 4h, tomorrow, monday, or YYYY-MM-DD HH:MM`)],
    });
    return;
  }

  // Look up creator
  const { data: creators } = await supabase
    .from('managed_creators')
    .select('id, creator_name, discord_user_id, tenant_id')
    .ilike('creator_name', `%${creatorName}%`)
    .limit(1);

  const creator = creators?.[0];
  if (!creator) {
    await interaction.editReply({
      embeds: [errorEmbed(`Creator "${creatorName}" not found in managed_creators.`)],
    });
    return;
  }

  // Store reminder
  const { error } = await supabase.from('reminders').insert({
    tenant_id: creator.tenant_id,
    target_type: 'creator',
    target_id: creator.discord_user_id ?? String(creator.id),
    content: text,
    scheduled_for: scheduledFor.toISOString(),
    created_by: interaction.user.tag,
  });

  if (error) {
    await interaction.editReply({ embeds: [errorEmbed(`Failed to save reminder: ${error.message}`)] });
    return;
  }

  const embed = tempoEmbed(guildConfig)
    .setTitle('⏰ Reminder Scheduled')
    .addFields(
      { name: 'Creator', value: `@${creator.creator_name}`, inline: true },
      { name: 'When', value: `<t:${Math.floor(scheduledFor.getTime() / 1000)}:F>`, inline: true },
      { name: 'Message', value: text.slice(0, 1024) },
    );

  await interaction.editReply({ embeds: [embed] });
}

async function handlePostingReminder(
  interaction: ChatInputCommandInteraction,
  guildConfig: ReturnType<typeof getGuildConfig>,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const days = interaction.options.getInteger('days') ?? 7;
  const supabase = getSupabase();
  const cutoff = daysAgo(days);
  const brand = guildConfig?.brandSlug;

  // Find creators who haven't posted recently
  // Get all managed creators for this brand
  const { data: allCreators } = await supabase
    .from('managed_creators')
    .select('id, creator_name, discord_user_id, tenant_id');

  if (!allCreators?.length) {
    await interaction.editReply({ embeds: [errorEmbed('No managed creators found.')] });
    return;
  }

  // Get creators with recent activity
  const { data: activeData } = await supabase
    .from('creator_performance')
    .select('creator_name')
    .gte('report_date', cutoff)
    .gt('videos_published', 0);

  const activeNames = new Set((activeData ?? []).map((r) => r.creator_name?.toLowerCase()));

  // Filter to inactive creators with Discord IDs
  const inactive = allCreators.filter(
    (c) => c.discord_user_id && !activeNames.has(c.creator_name?.toLowerCase()),
  );

  if (inactive.length === 0) {
    const embed = tempoEmbed(guildConfig)
      .setTitle('✅ All Creators Active')
      .setDescription(`All managed creators with linked Discord accounts have posted in the last ${days} days.`);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Send reminders
  let sent = 0;
  let failed = 0;
  const reminded: string[] = [];

  for (const creator of inactive) {
    const msg = `Hey! 👋 You haven't posted for ${guildConfig?.displayName ?? 'the brand'} in ${days}+ days. Need any help or have questions? We're here for you!`;
    const result = await sendTrackedDM(
      interaction.client,
      creator.discord_user_id!,
      msg,
      {
        tenantId: creator.tenant_id,
        creatorId: creator.id,
        sentBy: 'system',
        channel: 'dm',
      },
    );

    if (result.success) {
      sent++;
      reminded.push(creator.creator_name);
    } else {
      failed++;
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 1000));
  }

  const embed = tempoEmbed(guildConfig)
    .setTitle('📬 Posting Reminders Sent')
    .addFields(
      { name: 'Inactive Days', value: String(days), inline: true },
      { name: '✅ Sent', value: String(sent), inline: true },
      { name: '❌ Failed', value: String(failed), inline: true },
    );

  if (reminded.length > 0) {
    embed.addFields({
      name: 'Reminded',
      value: reminded.map((n) => `@${n}`).join(', ').slice(0, 1024),
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

export default { data, execute };
