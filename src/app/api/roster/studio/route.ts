import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { can } from '@/lib/auth/permissions';
import { getRosterStudio } from '@/lib/data/roster-studio';
import { parseRosterStudioQuery } from '@/lib/roster/studio-model';

export const maxDuration = 60;

/** Optional context for the current page only. It never delays the primary roster response. */
export async function GET(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!can(scope, 'roster', 'read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const input = parseRosterStudioQuery(new URL(request.url).searchParams, today);
  if (!input) return NextResponse.json({ error: 'Choose up to 100 creator rows and a valid reporting date.' }, { status: 400 });
  const result = await getRosterStudio(scope, input);
  return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'private, no-store' } });
}
