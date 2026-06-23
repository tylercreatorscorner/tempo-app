/**
 * Cron handler — fired by Vercel cron on a fixed cadence (see vercel.json).
 *
 * Each invocation:
 *  1. Pulls all active schedules whose next_run_at <= now()
 *  2. Generates the report text for each
 *  3. Posts to the schedule's webhook URL
 *  4. Updates last_run_at / last_run_status / last_run_error / next_run_at
 *
 * Failures don't block other schedules — each is processed independently.
 *
 * Vercel Cron auth: Vercel sends a `Authorization: Bearer ${CRON_SECRET}` header
 * for cron-triggered requests. We reject anything else so the endpoint isn't
 * publicly callable in production.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { generateReport, type ReportType, type ReportPeriod } from '@/lib/data/reports';
import { deliverToWebhook } from '@/lib/messaging/webhook';
import { nextRunFromLabel } from '@/lib/data/schedule-frequency';
import {
  getWhatsCookingData, getWhosCookingData, getDailyDropData,
  formatWhatsCookingDiscord, formatWhosCookingDiscord, formatDailyDropDiscord,
} from '@/lib/data/discord-posts';
import { getBrandRegistry, brandLabel, type BrandRegistry } from '@/lib/data/brand-registry';

interface ScheduleRow {
  id: string;
  tenant_id: string;
  report_type: string;
  source: string;
  brand: string;
  period: string;
  cron_label: string;
  destination_kind: string;
  webhook_url: string;
}

async function generateForSchedule(s: ScheduleRow, reg: BrandRegistry): Promise<string> {
  const brandName = s.brand === 'all' ? 'All Brands' : brandLabel(reg, s.brand);
  const period = (s.period || '7d') as '7d' | '30d';

  if (s.source === 'reporting') {
    return generateReport(s.report_type as ReportType, s.brand, period as ReportPeriod);
  }
  if (s.source === 'discord-posts') {
    switch (s.report_type) {
      case 'whats-cooking': {
        const data = await getWhatsCookingData(s.brand, period);
        return formatWhatsCookingDiscord(data, brandName, period);
      }
      case 'whos-cooking': {
        const data = await getWhosCookingData(s.brand, period);
        return formatWhosCookingDiscord(data, brandName, period);
      }
      case 'daily-drop': {
        const data = await getDailyDropData(s.brand);
        return formatDailyDropDiscord(data, brandName);
      }
      default:
        throw new Error(`Unknown discord-posts type: ${s.report_type}`);
    }
  }
  throw new Error(`Unknown source: ${s.source}`);
}

export async function GET(request: NextRequest) {
  // Vercel Cron auth
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = await createAdminClient();
  const now = new Date().toISOString();

  // Pull all due, active schedules
  const { data: due, error } = await admin
    .from('report_schedules')
    .select('*')
    .eq('active', true)
    .lte('next_run_at', now);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  const reg = await getBrandRegistry();

  for (const s of (due ?? []) as ScheduleRow[]) {
    let ok = false;
    let errorMsg: string | undefined;

    try {
      const content = await generateForSchedule(s, reg);
      const delivery = await deliverToWebhook(s.webhook_url, content);
      ok = delivery.ok;
      if (!delivery.ok) errorMsg = `${delivery.status}: ${delivery.error}`;
    } catch (err: unknown) {
      ok = false;
      errorMsg = err instanceof Error ? err.message : 'Unknown error';
    }

    // Persist outcome + advance next_run_at no matter what (so failures don't loop forever)
    const next = nextRunFromLabel(s.cron_label, new Date()).toISOString();
    await admin
      .from('report_schedules')
      .update({
        last_run_at: now,
        last_run_status: ok ? 'sent' : 'failed',
        last_run_error: ok ? null : (errorMsg ?? null),
        next_run_at: next,
      })
      .eq('id', s.id);

    results.push({ id: s.id, ok, error: errorMsg });
  }

  return NextResponse.json({ checked: due?.length ?? 0, results });
}
