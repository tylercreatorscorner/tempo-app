/**
 * /scan — Scan guild members and match against managed creators
 */
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { tempoEmbed } from '../embeds';
import { getGuildConfig, getBrandForGuild } from '../config';
import { getSupabase } from '../supabase';
import type { TempoCommand } from './index';

/** Simple Levenshtein distance */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

interface ManagedCreator {
  id: number;
  real_name: string | null;
  discord_name: string | null;
  discord_id: string | null;
  brand: string | null;
}

interface MatchResult {
  matched_creator_id: number | null;
  match_type: 'exact' | 'fuzzy' | 'none';
  match_confidence: number;
  match_reason: string | null;
}

function findBestMatch(
  username: string,
  displayName: string | null,
  creators: ManagedCreator[]
): MatchResult {
  const uLower = username.toLowerCase();
  const dLower = displayName?.toLowerCase() ?? '';

  // 1. Exact username match on discord_name
  for (const c of creators) {
    if (c.discord_name && c.discord_name.toLowerCase() === uLower) {
      return {
        matched_creator_id: c.id,
        match_type: 'exact',
        match_confidence: 1.0,
        match_reason: `Username "${username}" exactly matches discord_name "${c.discord_name}"`,
      };
    }
  }

  // 2. Display name matches real_name exactly
  if (dLower) {
    for (const c of creators) {
      if (c.real_name && c.real_name.toLowerCase() === dLower) {
        return {
          matched_creator_id: c.id,
          match_type: 'fuzzy',
          match_confidence: 0.8,
          match_reason: `Display name "${displayName}" matches real_name "${c.real_name}"`,
        };
      }
    }
  }

  // 3. Contains check
  let bestMatch: MatchResult = {
    matched_creator_id: null,
    match_type: 'none',
    match_confidence: 0,
    match_reason: null,
  };

  for (const c of creators) {
    const rLower = c.real_name?.toLowerCase() ?? '';
    if (!rLower || rLower.length < 3) continue;

    // Username contains real_name or vice versa
    if (uLower.includes(rLower) || rLower.includes(uLower)) {
      const conf = 0.6;
      if (conf > bestMatch.match_confidence) {
        bestMatch = {
          matched_creator_id: c.id,
          match_type: 'fuzzy',
          match_confidence: conf,
          match_reason: `Username "${username}" contains/matches real_name "${c.real_name}"`,
        };
      }
    }

    // Display name contains real_name
    if (dLower && (dLower.includes(rLower) || rLower.includes(dLower))) {
      const conf = 0.6;
      if (conf > bestMatch.match_confidence) {
        bestMatch = {
          matched_creator_id: c.id,
          match_type: 'fuzzy',
          match_confidence: conf,
          match_reason: `Display name "${displayName}" contains/matches real_name "${c.real_name}"`,
        };
      }
    }

    // Levenshtein similarity on discord_name
    if (c.discord_name) {
      const sim = similarity(uLower, c.discord_name.toLowerCase());
      if (sim >= 0.7) {
        const conf = Math.round(sim * 100) / 100;
        if (conf > bestMatch.match_confidence) {
          bestMatch = {
            matched_creator_id: c.id,
            match_type: 'fuzzy',
            match_confidence: Math.min(conf, 0.9),
            match_reason: `Username "${username}" similar to discord_name "${c.discord_name}" (${Math.round(sim * 100)}%)`,
          };
        }
      }
    }
  }

  return bestMatch;
}

const command: TempoCommand = {
  data: new SlashCommandBuilder()
    .setName('scan')
    .setDescription('Scan server members and match them to managed creators')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false) as unknown as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }

    const guildConfig = getGuildConfig(interaction.guildId);
    const brand = getBrandForGuild(interaction.guildId);
    if (!guildConfig || !brand) {
      await interaction.reply({ content: 'This server is not configured in Tempo.', ephemeral: true });
      return;
    }

    await interaction.deferReply();

    const supabase = getSupabase();

    // Fetch managed creators for this brand
    const { data: creators, error: creatorsErr } = await supabase
      .from('managed_creators')
      .select('id, real_name, discord_name, discord_id, brand')
      .eq('brand', brand);

    if (creatorsErr || !creators) {
      await interaction.editReply('Failed to fetch creators from database.');
      return;
    }

    // Fetch existing queue entries for this guild
    const { data: existingQueue } = await supabase
      .from('discord_match_queue')
      .select('discord_user_id')
      .eq('guild_id', interaction.guildId);

    const existingUserIds = new Set((existingQueue ?? []).map((e: { discord_user_id: string }) => e.discord_user_id));

    // Already-linked discord IDs
    const linkedDiscordIds = new Set(
      creators.filter((c: ManagedCreator) => c.discord_id).map((c: ManagedCreator) => c.discord_id)
    );

    // Fetch all guild members
    const members = await interaction.guild.members.fetch();

    let scanned = 0;
    let exact = 0;
    let fuzzy = 0;
    let unmatched = 0;
    let skipped = 0;

    const inserts: Array<Record<string, unknown>> = [];

    for (const [, member] of members) {
      if (member.user.bot) continue;

      const userId = member.user.id;

      // Skip if already in queue
      if (existingUserIds.has(userId)) {
        skipped++;
        continue;
      }

      // Skip if already linked
      if (linkedDiscordIds.has(userId)) {
        skipped++;
        continue;
      }

      const username = member.user.username;
      const displayName = member.displayName !== username ? member.displayName : null;
      const avatarUrl = member.user.displayAvatarURL({ size: 128 });

      const match = findBestMatch(username, displayName, creators as ManagedCreator[]);

      inserts.push({
        guild_id: interaction.guildId,
        discord_user_id: userId,
        discord_username: username,
        discord_display_name: displayName,
        discord_avatar_url: avatarUrl,
        matched_creator_id: match.matched_creator_id,
        match_type: match.match_type,
        match_confidence: match.match_confidence,
        match_reason: match.match_reason,
        status: 'pending',
      });

      if (match.match_type === 'exact') exact++;
      else if (match.match_type === 'fuzzy') fuzzy++;
      else unmatched++;
      scanned++;
    }

    // Batch insert
    if (inserts.length > 0) {
      const { error: insertErr } = await supabase
        .from('discord_match_queue')
        .upsert(inserts, { onConflict: 'guild_id,discord_user_id' });

      if (insertErr) {
        await interaction.editReply(`Scan failed: ${insertErr.message}`);
        return;
      }
    }

    const embed = tempoEmbed(guildConfig)
      .setTitle('🔍 Server Scan Complete')
      .setDescription(
        `Scanned **${scanned}** members in **${guildConfig.displayName}**\n` +
        `Skipped **${skipped}** (already queued or linked)\n\n` +
        `✅ Exact matches: **${exact}**\n` +
        `🟡 Fuzzy matches: **${fuzzy}**\n` +
        `⬜ Unmatched: **${unmatched}**\n\n` +
        `Review matches at [Tempo Dashboard](https://tempo-app-wheat.vercel.app/discord-scan)`
      );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
