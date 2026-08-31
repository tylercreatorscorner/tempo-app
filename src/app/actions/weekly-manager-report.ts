'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { assertNotImpersonating } from '@/lib/auth/platform-admin';
import { saveWeeklyReport, type SaveWeeklyReportInput } from '@/lib/data/weekly-manager-report';

/**
 * Submit (or amend) one brand's weekly manager report.
 *
 * ⚠️ The computed figures are NOT accepted from the client. saveWeeklyReport
 * recomputes them server-side and freezes them onto the row. Taking a
 * manager-supplied capture rate over the wire would reintroduce by the back
 * door exactly the hand entry this replaces.
 *
 * Authorisation is left to RLS on weekly_manager_reports, which admits internal
 * staff and the ACCOUNTABLE manager for that brand (brand_manager_assignments),
 * and nobody else. Doing it here as well would be a second rule to keep in sync.
 */
export async function submitWeeklyReport(
  input: SaveWeeklyReportInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Server actions bypass the /api/* read-only middleware gate, so the
  // "viewing as" guard has to be explicit here.
  await assertNotImpersonating();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You are signed out. Reload and try again.' };

  if (!input.clientHealth) {
    return { ok: false, error: 'Client health is required. It is half the reason this report exists.' };
  }
  if (!input.renewalRisk) {
    return { ok: false, error: 'Renewal risk is required.' };
  }

  const result = await saveWeeklyReport(input, user.id);
  if (result.ok) revalidatePath('/reporting/weekly');
  return result;
}
