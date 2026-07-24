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
  Partials,
  REST,
  Routes,
  Events,
  type Interaction,
  type TextChannel,
} from 'discord.js';
import { commands, commandMap } from './commands';
import { getGuildConfig } from './config';
import { logMessage } from './relay';
import { getSupabase } from './supabase';
import { startReminderChecker, scheduleDailyBriefs } from './scheduler';

// ── Liveness heartbeat ───────────────────────────────────────────────────────
// The DM pipeline died silently in March and nothing surfaced it. The bot now
// stamps bot_status (single row, id=1) on ready + every 3 minutes; the Comms
// hub health endpoint reads it and shows "bot offline since X" past 10 min.
// ⚠️ This file runs as a STANDALONE Node process — only the bot's own supabase
// client here, never @/lib/supabase/server (next/headers would crash the bot).
const HEARTBEAT_INTERVAL_MS = 3 * 60 * 1000;

async function upsertHeartbeat(): Promise<void> {
  try {
    const now = new Date().toISOString();
    const { error } = await getSupabase().from('bot_status').upsert({
      id: 1,
      last_seen_at: now,
      version: process.env.RAILWAY_GIT_COMMIT_SHA ?? 'dev',
      updated_at: now,
    });
    if (error) console.error('[tempo-bot] heartbeat upsert failed:', error.message);
  } catch (err) {
    console.error('[tempo-bot] heartbeat failed:', err);
  }
}

// Backup ticker for the broadcast drain: Vercel's per-minute crons require
// the Pro plan, so the always-on bot ALSO pings the drain endpoint each
// minute when configured (TEMPO_APP_URL + CRON_SECRET in the bot env). The
// drain is idempotent under doubled ticks (conditional pending->sending
// claims), so cron + ticker running together is safe.
function startBroadcastDrainTicker(): void {
  const appUrl = (process.env.TEMPO_APP_URL ?? '').replace(/\/$/, '');
  const secret = process.env.CRON_SECRET;
  if (!appUrl || !secret) {
    console.log('[tempo-bot] broadcast drain ticker disabled (TEMPO_APP_URL/CRON_SECRET not set)');
    return;
  }
  const tick = async () => {
    try {
      const res = await fetch(`${appUrl}/api/cron/send-broadcasts`, {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(55_000),
      });
      if (!res.ok) console.error(`[tempo-bot] drain tick HTTP ${res.status}`);
    } catch (err) {
      console.error('[tempo-bot] drain tick failed:', err);
    }
  };
  setInterval(() => { void tick(); }, 60_000);
}

/** Create a configured Discord client */
export function createClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [
      Partials.Channel,
      Partials.Message,
      Partials.User,
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
    startReminderChecker(client);
    scheduleDailyBriefs(client);
    void upsertHeartbeat();
    setInterval(() => { void upsertHeartbeat(); }, HEARTBEAT_INTERVAL_MS);
    startBroadcastDrainTicker();
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    // Handle autocomplete
    if (interaction.isAutocomplete()) {
      const command = commandMap.get(interaction.commandName);
      if (command?.autocomplete) {
        try {
          await command.autocomplete(interaction);
        } catch (error) {
          console.error(`[tempo-bot] Autocomplete error for /${interaction.commandName}:`, error);
          await interaction.respond([]).catch(() => {});
        }
      }
      return;
    }

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

  // Inbound DM listener — log creator replies and forward to relay channel
  client.on(Events.MessageCreate, async (msg) => {
    // Only handle DMs from non-bots
    if (!msg.author.bot && msg.channel.isDMBased()) {
      console.log(`[tempo-bot] Inbound DM from ${msg.author.tag}: ${msg.content.slice(0, 100)}`);

      // Log inbound message
      await logMessage({
        discordUserId: msg.author.id,
        direction: 'inbound',
        channel: 'dm',
        content: msg.content,
        status: 'delivered',
        sentBy: msg.author.tag,
      });

      // Forward to relay channels in all guilds where bot is present
      for (const [guildId, guild] of client.guilds.cache) {
        const config = getGuildConfig(guildId);
        const relayChannelId = config?.channels.relay ?? config?.channels.alerts;
        if (relayChannelId) {
          try {
            const channel = (await guild.channels.fetch(relayChannelId)) as TextChannel;
            if (channel) {
              await channel.send(
                `📩 **Inbound DM from ${msg.author.tag}** (<@${msg.author.id}>):\n>>> ${msg.content.slice(0, 1900)}`,
              );
            }
          } catch {
            // Silently skip if channel not accessible
          }
        }
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
