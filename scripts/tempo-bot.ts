#!/usr/bin/env tsx
/**
 * Tempo Bot — Entry point
 *
 * Run with: npx tsx scripts/tempo-bot.ts
 * Or in production: node --import tsx scripts/tempo-bot.ts
 *
 * Requires .env in project root with:
 *   DISCORD_BOT_TOKEN=...
 *   DISCORD_CLIENT_ID=...
 */

import 'dotenv/config';
import { startBot, registerCommands } from '../src/lib/discord/bot';
import { getRegisteredGuilds } from '../src/lib/discord/config';

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

if (!TOKEN) {
  console.error('[tempo-bot] Missing DISCORD_BOT_TOKEN in environment');
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error('[tempo-bot] Missing DISCORD_CLIENT_ID in environment');
  process.exit(1);
}

async function main() {
  console.log('[tempo-bot] Starting Tempo Bot...');

  // Register commands for known guilds (fast, instant updates)
  const guilds = getRegisteredGuilds();
  for (const guildId of guilds) {
    try {
      await registerCommands(TOKEN!, CLIENT_ID!, guildId);
    } catch (err) {
      console.error(`[tempo-bot] Failed to register commands for guild ${guildId}:`, err);
    }
  }

  // Also register globally for any new servers
  try {
    await registerCommands(TOKEN!, CLIENT_ID!);
  } catch (err) {
    console.error('[tempo-bot] Failed to register global commands:', err);
  }

  // Start the bot
  const client = await startBot(TOKEN!);

  // Graceful shutdown
  const shutdown = () => {
    console.log('[tempo-bot] Shutting down...');
    client.destroy();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[tempo-bot] Fatal error:', err);
  process.exit(1);
});
