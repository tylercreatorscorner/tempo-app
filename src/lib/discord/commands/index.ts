/**
 * Command registry — collects all slash commands for registration and dispatch.
 */

import type {
  ChatInputCommandInteraction,
  SharedSlashCommand,
} from 'discord.js';

export interface TempoCommand {
  data: SharedSlashCommand;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

import ping from './ping';
import stats from './stats';
import leaderboard from './leaderboard';
import whatsHot from './whats-hot';
import help from './help';

/** All registered commands */
export const commands: TempoCommand[] = [ping, stats, leaderboard, whatsHot, help];

/** Map of command name → handler for fast lookup */
export const commandMap = new Map<string, TempoCommand>(
  commands.map((cmd) => [cmd.data.name, cmd]),
);
