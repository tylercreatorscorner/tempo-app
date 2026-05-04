/**
 * POST /api/invoices/bulk
 *
 * Bulk-update the status of multiple invoices in one transactional update.
 *
 * Body:
 *   { ids: string[], status: 'pending' | 'sent' | 'paid' | 'void' }
 *
 * Auto-stamps sent_at / paid_at when the matching status is set, mirroring
 * the per-invoice PATCH behavior. Returns count of rows updated + the rows.
 *
 * Limit: 100 ids per call (sanity guard).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const STATUSES = new Set(['pending', 'sent', 'paid', 'void']);
const MAX_IDS = 100;

export async function POST(req: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { ids?: unknown; status?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { ids, status } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 });
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: `Too many ids (max ${MAX_IDS})` }, { status: 400 });
  }
  if (!ids.every((id) => typeof id === 'string')) {
    return NextResponse.json({ error: 'ids must be strings' }, { status: 400 });
  }
  if (typeof status !== 'string' || !STATUSES.has(status)) {
    return NextResponse.json(
      { error: `status must be one of ${[...STATUSES].join(', ')}` },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === 'sent') update.sent_at = new Date().toISOString();
  if (status === 'paid') update.paid_at = new Date().toISOString();

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('invoices')
    .update(update)
    .in('id', ids as string[])
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ count: data?.length ?? 0, invoices: data ?? [] });
}
