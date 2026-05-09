/**
 * GET /api/integrations/actions
 *
 * Returns the catalog of every action an automation can fire — used by the
 * /workflows/automations builder UI to render the right form fields based
 * on the user's integration choice.
 *
 * Excludes the handler function (server-only, not serializable).
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { listActions } from '@/lib/integrations/actions/registry';

export const runtime = 'nodejs';

export async function GET() {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const actions = listActions().map(a => ({
    integrationType: a.integrationType,
    action: a.action,
    label: a.label,
    description: a.description,
    params: a.params,
  }));

  return NextResponse.json({ actions });
}
