/**
 * Tempo Bot — API management endpoint
 *
 * POST /api/discord/bot — Health check and management
 * Can be extended for webhook-based interaction handling if needed.
 */

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    bot: 'tempo',
    message: 'Tempo Bot management endpoint. Bot runs as a separate long-lived process.',
  });
}

export async function POST(request: Request) {
  // Verify a simple shared secret for management ops
  const auth = request.headers.get('authorization');
  const secret = process.env.TEMPO_BOT_MANAGEMENT_SECRET;

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const action = (body as Record<string, unknown>).action;

  switch (action) {
    case 'health':
      return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
    default:
      return NextResponse.json({ error: 'Unknown action', availableActions: ['health'] }, { status: 400 });
  }
}
