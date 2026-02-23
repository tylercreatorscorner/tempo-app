/**
 * Tempo Bot — Scheduled messages foundation
 *
 * Ready-to-call functions for daily briefs and scheduled reports.
 * Not yet wired to actual cron — call manually or integrate later.
 */

import type { Client, TextChannel } from 'discord.js';
import { tempoEmbed } from './embeds';
import { getGuildConfig, getBrandForGuild } from './config';
import { getSupabase, daysAgo } from './supabase';
import { BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';

interface ScheduledMessage {
  guildId: string;
  channelId: string;
  cronExpression: string;
  generateMessage: () => Promise<string | { embeds: any[] }>;
}

// In-memory store — replace with persistence if needed
const scheduledMessages: ScheduledMessage[] = [];

/** Register a scheduled message (foundation — no cron runner yet) */
export function scheduleMessage(
  guildId: string,
  channelId: string,
  message: (() => Promise<string | { embeds: any[] }>),
  cronExpression: string,
): void {
  scheduledMessages.push({ guildId, channelId, cronExpression, generateMessage: message });
  console.log(`[tempo-bot] Scheduled message for guild ${guildId} channel ${channelId} at "${cronExpression}"`);
}

/** Get all scheduled messages */
export function getScheduledMessages(): readonly ScheduledMessage[] {
  return scheduledMessages;
}

/** Check for due reminders and send them */
export async function checkReminders(client: Client): Promise<void> {
  try {
    const supabase = getSupabase();
    const now = new Date().toISOString();

    const { data: dueReminders } = await supabase
      .from('reminders')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .limit(50);

    if (!dueReminders?.length) return;

    for (const reminder of dueReminders) {
      try {
        if (reminder.target_type === 'creator') {
          const user = await client.users.fetch(reminder.target_id).catch(() => null);
          if (user) {
            await user.send(reminder.content);
          }
        } else if (reminder.target_type === 'channel') {
          const channel = await client.channels.fetch(reminder.target_id).catch(() => null);
          if (channel && 'send' in channel) {
            await (channel as TextChannel).send(reminder.content);
          }
        }

        await supabase
          .from('reminders')
          .update({ status: 'sent' })
          .eq('id', reminder.id);
      } catch (err) {
        console.error(`[tempo-bot] Failed to send reminder ${reminder.id}:`, err);
      }
    }

    if (dueReminders.length > 0) {
      console.log(`[tempo-bot] Processed ${dueReminders.length} reminders`);
    }
  } catch (err) {
    console.error('[tempo-bot] Reminder check failed:', err);
  }
}

let reminderInterval: ReturnType<typeof setInterval> | null = null;

/** Start the reminder checker on an interval */
export function startReminderChecker(client: Client, intervalMs = 60_000): void {
  if (reminderInterval) clearInterval(reminderInterval);
  reminderInterval = setInterval(() => checkReminders(client), intervalMs);
  console.log(`[tempo-bot] Reminder checker started (every ${intervalMs / 1000}s)`);
}

/** Stop the reminder checker */
export function stopReminderChecker(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
    console.log('[tempo-bot] Reminder checker stopped');
  }
}

/** Generate and post a daily brief to the configured channel */
export async function sendDailyBrief(client: Client, guildId: string): Promise<void> {
  const guildConfig = getGuildConfig(guildId);
  if (!guildConfig?.channels.dailyBrief) {
    console.warn(`[tempo-bot] No dailyBrief channel configured for guild ${guildId}`);
    return;
  }

  const brand = getBrandForGuild(guildId);
  if (!brand) return;

  const supabase = getSupabase();
  const brandName = BRAND_DISPLAY_NAMES[brand] ?? brand;

  try {
    // Yesterday's performance
    const yesterday = daysAgo(1);
    const { data: yesterdayData } = await supabase
      .from('creator_performance')
      .select('gmv, orders, items_sold')
      .eq('brand', brand)
      .eq('report_date', yesterday);

    const rows = yesterdayData ?? [];
    const gmv = rows.reduce((s, r) => s + (r.gmv || 0), 0);
    const orders = rows.reduce((s, r) => s + (r.orders || 0), 0);
    const items = rows.reduce((s, r) => s + (r.items_sold || 0), 0);

    // 7d trend
    const { data: d7 } = await supabase
      .from('creator_performance')
      .select('gmv')
      .eq('brand', brand)
      .gte('report_date', daysAgo(7));
    const gmv7 = (d7 ?? []).reduce((s, r) => s + (r.gmv || 0), 0);

    const { data: dPrior } = await supabase
      .from('creator_performance')
      .select('gmv')
      .eq('brand', brand)
      .gte('report_date', daysAgo(14))
      .lt('report_date', daysAgo(7));
    const gmvPrior = (dPrior ?? []).reduce((s, r) => s + (r.gmv || 0), 0);
    const trend = gmvPrior > 0 ? ((gmv7 - gmvPrior) / gmvPrior) * 100 : 0;

    // Top creator yesterday
    const creatorMap = new Map<string, number>();
    for (const r of rows) {
      // We don't have creator_name in the select above — let's just skip top creator for now
    }

    const fmtUsd = (n: number) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
    const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);

    const trendEmoji = trend >= 0 ? '📈' : '📉';
    const embed = tempoEmbed(guildConfig)
      .setTitle(`☀️ Good Morning — ${brandName} Daily Brief`)
      .setDescription(`Here's how yesterday went:`)
      .addFields(
        { name: '💰 Yesterday GMV', value: fmtUsd(gmv), inline: true },
        { name: '🛒 Orders', value: fmt(orders), inline: true },
        { name: '📦 Items', value: fmt(items), inline: true },
        { name: `${trendEmoji} WoW Trend`, value: `${trend >= 0 ? '+' : ''}${trend.toFixed(1)}%`, inline: true },
        { name: '💰 7-Day GMV', value: fmtUsd(gmv7), inline: true },
      );

    const channel = await client.channels.fetch(guildConfig.channels.dailyBrief) as TextChannel;
    if (channel) {
      await channel.send({ embeds: [embed] });
      console.log(`[tempo-bot] Sent daily brief to guild ${guildId}`);
    }
  } catch (err) {
    console.error(`[tempo-bot] Failed to send daily brief for guild ${guildId}:`, err);
  }
}
