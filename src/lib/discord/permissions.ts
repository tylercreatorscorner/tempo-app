import { ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';

/**
 * In-handler admin guard for sensitive commands (mass-DM, arbitrary send/post).
 *
 * `setDefaultMemberPermissions(Administrator)` on a command is only a *client-side
 * default* that a guild admin can override in the server's Integrations settings,
 * so it is NOT a hard guarantee. Sensitive commands enforce here as well: any
 * member without the Administrator permission (including in a DM context, where
 * memberPermissions is null) is rejected. Pure module — safe for the standalone
 * bot (no next/headers).
 */
export async function requireAdmin(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
  if (!isAdmin) {
    await interaction
      .reply({ content: '🚫 This command is restricted to server admins.', ephemeral: true })
      .catch(() => {});
  }
  return isAdmin;
}
