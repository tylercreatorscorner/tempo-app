/**
 * Tempo Bot — Discord.js bot client
 *
 * Environment variables required:
 *   DISCORD_BOT_TOKEN    — Bot token from Discord Developer Portal
 *   DISCORD_CLIENT_ID    — Application client ID
 *   DISCORD_CLIENT_SECRET — Application client secret (for OAuth later)
 *
 * This module exports the bot setup but does NOT auto-connect.
 * Use scripts/tempo-bot.ts as the entry point to start the bot.
 */

import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Events,
  type Interaction,
} from 'discord.js';
import { commands, commandMap } from './commands';

/** Create a configured Discord client */
export function createClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });
}

/** Register slash commands globally (or per-guild for faster dev iteration) */
export async function registerCommands(
  token: string,
  clientId: string,
  guildId?: string,
): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token);
  const body = commands.map((cmd) => cmd.data.toJSON());

  if (guildId) {
    // Guild-specific registration (instant, good for dev)
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    console.log(`[tempo-bot] Registered ${body.length} commands for guild ${guildId}`);
  } else {
    // Global registration (takes up to 1 hour to propagate)
    await rest.put(Routes.applicationCommands(clientId), { body });
    console.log(`[tempo-bot] Registered ${body.length} global commands`);
  }
}

/** Set up event handlers on the client */
export function setupEventHandlers(client: Client): void {
  client.once(Events.ClientReady, (c) => {
    console.log(`[tempo-bot] Logged in as ${c.user.tag} — serving ${c.guilds.cache.size} guilds`);
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commandMap.get(interaction.commandName);
    if (!command) {
      console.warn(`[tempo-bot] Unknown command: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[tempo-bot] Error executing /${interaction.commandName}:`, error);

      const content = '⚠️ Something went wrong. Please try again later.';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content, ephemeral: true }).catch(() => {});
      }
    }
  });

  client.on(Events.Error, (error) => {
    console.error('[tempo-bot] Client error:', error);
  });
}

/** Full bot initialization — create client, set up handlers, login */
export async function startBot(token: string): Promise<Client> {
  const client = createClient();
  setupEventHandlers(client);
  await client.login(token);
  return client;
}
