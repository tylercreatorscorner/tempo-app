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
import { sendSlackMessage, listSlackChannels } from './slack';
import { sendEmail } from './resend';
import { sendSms } from './twilio';
import { generateDailyDrop } from './anthropic';

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
  /** Per-install secrets (OAuth access tokens, API keys). Some actions read
   *  from env (Discord bot token, Tempo's Anthropic key) so they leave this
   *  null. Others (Slack, Twilio when user-provided) need it. */
  credentials: Record<string, unknown> | null;
}

/** Context the dispatcher hands to action handlers — used by AI actions to
 *  log token usage tied to the run + tenant, and by future actions that
 *  need the current run id for chaining. Optional for handlers that don't
 *  care (Discord/Slack/Resend/Twilio). */
export interface ActionContext {
  automationRunId?: string | null;
  tenantId?: string | null;
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
    ctx: ActionContext,
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

const SLACK_SEND_MESSAGE: ActionDef = {
  integrationType: 'slack',
  action: 'send_message',
  label: 'Send a message',
  description: 'Posts a single message to a channel in this Slack workspace.',
  params: [
    {
      key: 'channel_id',
      label: 'Channel',
      type: 'channel-picker',
      required: true,
      helpText: 'Pick the channel to post in. The bot must be a member of private channels.',
    },
    {
      key: 'content',
      label: 'Message',
      type: 'textarea',
      required: true,
      rows: 4,
      placeholder: 'Hello from Tempo 👋',
      helpText: 'Slack mrkdwn supported (`*bold*`, `_italic_`, `<https://...|link text>`).',
    },
  ],
  async handler(integration, params) {
    const token = (integration.credentials?.access_token as string | undefined) ?? '';
    const channelId = String(params.channel_id ?? '').trim();
    const text = String(params.content ?? '').trim();
    const result = await sendSlackMessage({ channelId, text, token });
    return result.ok
      ? { ok: true, externalId: result.ts, summary: `Sent to ${result.channel ?? channelId}` }
      : { ok: false, status: result.status, error: result.error };
  },
};

const RESEND_SEND_EMAIL: ActionDef = {
  integrationType: 'resend',
  action: 'send_email',
  label: 'Send an email',
  description: 'Sends a transactional email to one or more recipients via Resend.',
  params: [
    {
      key: 'to',
      label: 'To',
      type: 'text',
      required: true,
      placeholder: 'creator@example.com',
      helpText: 'One address, or several comma-separated.',
    },
    {
      key: 'subject',
      label: 'Subject',
      type: 'text',
      required: true,
      placeholder: 'Your weekly Tempo recap',
    },
    {
      key: 'body',
      label: 'Body',
      type: 'textarea',
      required: true,
      rows: 8,
      placeholder: 'Hey there,\n\nHere is what happened this week...',
      helpText: 'Plain text. Blank lines start a new paragraph.',
    },
    {
      key: 'reply_to',
      label: 'Reply-to (optional)',
      type: 'text',
      placeholder: 'tyler@creatorscorner.com',
      helpText: 'Where replies should land. Defaults to the From address.',
    },
  ],
  async handler(_integration, params) {
    const to = String(params.to ?? '').trim();
    const subject = String(params.subject ?? '').trim();
    const body = String(params.body ?? '').trim();
    const replyTo = params.reply_to ? String(params.reply_to).trim() || undefined : undefined;
    const cc = params.cc ? String(params.cc).trim() || undefined : undefined;
    const result = await sendEmail({ to, subject, body, replyTo, cc });
    return result.ok
      ? { ok: true, externalId: result.id, summary: `Sent to ${to}` }
      : { ok: false, status: result.status, error: result.error };
  },
};

const TWILIO_SEND_SMS: ActionDef = {
  integrationType: 'twilio',
  action: 'send_sms',
  label: 'Send an SMS',
  description: 'Texts one or more phone numbers. Each recipient is billed separately.',
  params: [
    {
      key: 'to',
      label: 'To',
      type: 'text',
      required: true,
      placeholder: '+18885551234',
      helpText: 'E.164 format with country code. Several can be comma-separated (up to 100 per send).',
    },
    {
      key: 'body',
      label: 'Message',
      type: 'textarea',
      required: true,
      rows: 4,
      placeholder: 'Hey {first_name}, your renewal is up next week — text back any questions!',
      helpText: '160 chars = 1 segment (1 billing unit). Longer messages auto-segment. Reply STOP/HELP is handled by Twilio.',
    },
  ],
  async handler(_integration, params) {
    const to = String(params.to ?? '').trim();
    const body = String(params.body ?? '').trim();
    const result = await sendSms({ to, body });
    if (!result.ok) {
      return { ok: false, status: result.status, error: result.error };
    }
    // Partial-success (some recipients failed): treat the action as ok but
    // surface the failure detail in the summary so the run log shows it.
    if (result.failures && result.failures.length > 0) {
      return {
        ok: true,
        externalId: result.sid,
        summary: `Sent ${result.sentCount} of ${result.sentCount! + result.failures.length} (${result.failures.length} failed)`,
        output: { failures: result.failures },
      };
    }
    return {
      ok: true,
      externalId: result.sid,
      summary: result.sentCount && result.sentCount > 1 ? `Sent to ${result.sentCount} recipients` : `Sent to ${to}`,
    };
  },
};

const ANTHROPIC_GENERATE_DAILY_DROP: ActionDef = {
  integrationType: 'anthropic',
  action: 'generate_daily_drop',
  label: 'Generate Daily Drop',
  description: 'Drafts a Discord-ready Daily Drop post for a brand using yesterday\'s GMV, top creators, and top video.',
  params: [
    {
      key: 'brand_slug',
      label: 'Brand',
      type: 'text',
      required: true,
      placeholder: 'catakor',
      helpText: 'The brand slug (e.g. catakor, jiyu, leefar, physicians_choice).',
    },
    {
      key: 'tone',
      label: 'Tone',
      type: 'text',
      defaultValue: 'energetic and concise',
      helpText: 'How the post should feel — "energetic and concise", "playful", "serious and analytical", etc.',
    },
  ],
  async handler(integration, params, ctx) {
    return generateDailyDrop({
      integration,
      params,
      automationRunId: ctx.automationRunId ?? null,
      tenantId: ctx.tenantId ?? null,
    });
  },
};

const ACTIONS: ActionDef[] = [
  DISCORD_SEND_MESSAGE,
  SLACK_SEND_MESSAGE,
  RESEND_SEND_EMAIL,
  TWILIO_SEND_SMS,
  ANTHROPIC_GENERATE_DAILY_DROP,
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

export async function resolveChannelPicker(
  integrationType: string,
  config: Record<string, unknown>,
  credentials: Record<string, unknown> | null,
): Promise<{ ok: boolean; options?: PickerOption[]; error?: string }> {
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
  if (integrationType === 'slack') {
    const token = (credentials?.access_token as string | undefined) ?? '';
    if (!token) return { ok: false, error: 'Slack access token missing — re-connect the integration' };
    const r = await listSlackChannels(token);
    if (!r.ok) return { ok: false, error: r.error };
    return {
      ok: true,
      options: (r.channels ?? []).map(c => ({
        value: c.id,
        label: c.name,
        groupLabel: c.isPrivate ? 'Private channels' : 'Public channels',
        badge: c.isPrivate ? '🔒' : undefined,
      })),
    };
  }
  return { ok: false, error: `channel-picker not supported for type "${integrationType}"` };
}
