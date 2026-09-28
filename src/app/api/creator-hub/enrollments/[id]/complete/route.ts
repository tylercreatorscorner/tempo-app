import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { getDiscordIdentity } from '@/lib/applications/discord-identity';

const bodySchema = z.object({
  itemId: z.uuid(),
  acceptAcknowledgement: z.boolean(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: 'Hub unavailable.' }, { status: 404 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid Hub step.' }, { status: 400 });
  const identity = await getDiscordIdentity();
  if (!identity) return NextResponse.json({ error: 'Connect Discord to continue.' }, { status: 401 });
  const db = await createAdminClient();
  const { data: enrollment } = await db.from('creator_hub_enrollments')
    .select('id,application_id,tenant_id,brand_id,discord_user_id,snapshot_finalized_at')
    .eq('id', id).maybeSingle();
  if (!enrollment || !enrollment.snapshot_finalized_at || enrollment.discord_user_id !== identity.id) {
    return NextResponse.json({ error: 'Hub unavailable.' }, { status: 404 });
  }
  const { data: application } = await db.from('creator_application_submissions')
    .select('form_id,status,discord_user_id').eq('id', enrollment.application_id)
    .eq('tenant_id', enrollment.tenant_id).eq('brand_id', enrollment.brand_id).maybeSingle();
  if (!application || application.status !== 'approved' || application.discord_user_id !== identity.id ||
      application.form_id !== identity.formId) {
    return NextResponse.json({ error: 'Hub unavailable.' }, { status: 404 });
  }
  const { data: updated, error } = await db.rpc('record_creator_hub_completion', {
    p_enrollment_id: id,
    p_discord_user_id: identity.id,
    p_enrollment_item_id: parsed.data.itemId,
    p_accept_acknowledgement: parsed.data.acceptAcknowledgement,
  });
  if (error) return NextResponse.json({ error: 'Could not save this step. Reload and try again.' }, { status: 409 });
  return NextResponse.json({ ok: true, status: updated?.status ?? null });
}
