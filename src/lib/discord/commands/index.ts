/**
 * Command registry — collects all slash commands for registration and dispatch.
 */

import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SharedSlashCommand,
} from 'discord.js';

export interface TempoCommand {
  data: SharedSlashCommand;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

import ping from './ping';
import stats from './stats';
import leaderboard from './leaderboard';
import help from './help';
import alerts from './alerts';
import creator from './creator';
import compare from './compare';
import brand from './brand';
import message from './message';
import bulk from './bulk-message';
import reminder from './reminder';
import scan from './scan';

/** All registered commands */
export const commands: TempoCommand[] = [
  ping, stats, leaderboard, help,
  alerts, creator, compare, brand,
  message, bulk, reminder, scan,
];

/** Map of command name → handler for fast lookup */
export const commandMap = new Map<string, TempoCommand>(
  commands.map((cmd) => [cmd.data.name, cmd]),
);
