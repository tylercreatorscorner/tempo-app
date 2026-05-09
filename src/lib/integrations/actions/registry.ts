/**
 * Action registry — every action an automation can fire is declared here.
 *
 * Adding a new action is 3 things:
 *   1. Implement the handler in `actions/<type>.ts`
 *   2. Declare it in this registry with its UI metadata + handler reference
 *   3. (If it accepts a channel-style picker) register the picker resolver
 *      in `actions/pickers.ts`
 *
 * Keeping this file pure-data + handlers so client UI can import the type
 * + paramSchema metadata via separate files (no server deps in catalog).
 */

import { sendDiscordMessage, listDiscordChannels } from './discord';

// ─── Public types ──────────────────────────────────────────────────────────

export type ActionParamType = 'text' | 'textarea' | 'channel-picker' | 'number';

export interface ActionParam {
  key: string;
  label: string;
  type: ActionParamType;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  /** For 'textarea' — default rows. */
  rows?: number;
  /** For 'number' — min/max. */
  min?: number;
  max?: number;
  /** Optional default value baked into the action template. */
  defaultValue?: string | number;
}

export interface ActionResult {
  ok: boolean;
  /** Free-form summary string — displayed in run history. */
  summary?: string;
  /** Discord/Slack/etc. message id or external reference. */
  externalId?: string;
  status?: number;
  error?: string;
  /** Free-form structured output for downstream steps to chain on. */
  output?: Record<string, unknown>;
}

export interface IntegrationContext {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

export interface ActionDef {
  /** Integration type this action operates on. */
  integrationType: string;
  /** Action identifier — unique within an integrationType. */
  action: string;
  label: string;
  description: string;
  params: ActionParam[];
  /** Implementation. May read env vars (e.g. DISCORD_BOT_TOKEN). */
  handler: (
    integration: IntegrationContext,
    params: Record<string, unknown>,
  ) => Promise<ActionResult>;
}

// ─── Built-in actions ──────────────────────────────────────────────────────

const DISCORD_SEND_MESSAGE: ActionDef = {
  integrationType: 'discord',
  action: 'send_message',
  label: 'Send a message',
  description: 'Posts a single message to a channel in this Discord server.',
  params: [
    {
      key: 'channel_id',
      label: 'Channel',
      type: 'channel-picker',
      required: true,
      helpText: 'Pick the channel to post in.',
    },
    {
      key: 'content',
      label: 'Message',
      type: 'textarea',
      required: true,
      rows: 4,
      placeholder: 'Hello from Tempo 👋',
      helpText: 'Up to 2000 characters. Discord markdown is supported.',
    },
  ],
  async handler(integration, params) {
    const channelId = String(params.channel_id ?? '').trim();
    const content = String(params.content ?? '').trim();
    const result = await sendDiscordMessage({ channelId, content });
    return result.ok
      ? { ok: true, externalId: result.messageId, summary: `Sent to ${channelId}` }
      : { ok: false, status: result.status, error: result.error };
  },
};

const ACTIONS: ActionDef[] = [
  DISCORD_SEND_MESSAGE,
];

// ─── Public API ────────────────────────────────────────────────────────────

export function listActions(): ActionDef[] {
  return ACTIONS;
}

export function listActionsForType(integrationType: string): ActionDef[] {
  return ACTIONS.filter(a => a.integrationType === integrationType);
}

export function findAction(integrationType: string, action: string): ActionDef | undefined {
  return ACTIONS.find(a => a.integrationType === integrationType && a.action === action);
}

// ─── Channel-picker resolver ───────────────────────────────────────────────
//
// Some param types (channel-picker) need to fetch options from the upstream
// system. The /workflows UI calls these via /api/integrations/[id]/channels
// (or similar). Keeping the resolution logic close to the actions so future
// integrations register their picker the same way.

export interface PickerOption {
  value: string;
  label: string;
  groupLabel?: string;
  badge?: string;
}

export async function resolveChannelPicker(integrationType: string, config: Record<string, unknown>): Promise<{ ok: boolean; options?: PickerOption[]; error?: string }> {
  if (integrationType === 'discord') {
    const guildId = (config.guild_id as string | undefined) ?? '';
    if (!guildId) return { ok: false, error: 'No Discord guild configured for this integration' };
    const r = await listDiscordChannels(guildId);
    if (!r.ok) return { ok: false, error: r.error };
    return {
      ok: true,
      options: (r.channels ?? []).map(c => ({
        value: c.id,
        label: c.name,
        groupLabel: c.parentName ?? 'Uncategorized',
        badge: c.isAnnouncement ? '📢' : undefined,
      })),
    };
  }
  return { ok: false, error: `channel-picker not supported for type "${integrationType}"` };
}
