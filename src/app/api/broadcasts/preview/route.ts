import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { resolveAudience, AudienceError, type SkipReason } from '@/lib/comms/audience';
import { loadRequestCriteria, brandScopeViolation, parseChannel } from '@/lib/comms/broadcasts';

export const runtime = 'nodejs';

// Pacing used by the cron drain (~1.1s per DM) — the estimate mirrors it.
const SECONDS_PER_SEND = 1.1;
const EXAMPLES_PER_REASON = 3;

// POST /api/broadcasts/preview — dry-run an audience resolve.
// Body: { segmentId?, criteria?, channel, audienceLabel? }
// → { eligible, skipped: [{reason, count, examples}], estSeconds }
export async function POST(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let payload: { segmentId?: unknown; criteria?: unknown; channel?: unknown; audienceLabel?: unknown };
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const channel = parseChannel(payload.channel);
  if (!channel) return NextResponse.json({ error: 'Invalid channel' }, { status: 400 });

  const loaded = await loadRequestCriteria(scope, payload);
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });

  const violation = brandScopeViolation(scope, loaded.criteria);
  if (violation) return NextResponse.json({ error: violation }, { status: 403 });

  try {
    const audience = await resolveAudience(scope, loaded.criteria, channel);

    // Group skips by reason with a few example handles for the preview UI.
    const byReason = new Map<SkipReason, { count: number; examples: string[] }>();
    for (const s of audience.skipped) {
      const slot = byReason.get(s.reason) ?? { count: 0, examples: [] };
      slot.count += 1;
      if (slot.examples.length < EXAMPLES_PER_REASON && s.handle) slot.examples.push(s.handle);
      byReason.set(s.reason, slot);
    }

    return NextResponse.json({
      eligible: audience.eligible.length,
      skipped: Array.from(byReason.entries()).map(([reason, v]) => ({
        reason, count: v.count, examples: v.examples,
      })),
      estSeconds: Math.ceil(audience.eligible.length * SECONDS_PER_SEND),
    });
  } catch (err) {
    if (err instanceof AudienceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[/api/broadcasts/preview] audience resolve failed:', err);
    return NextResponse.json({ error: 'Failed to resolve audience' }, { status: 500 });
  }
}
