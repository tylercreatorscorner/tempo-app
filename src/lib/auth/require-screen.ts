/**
 * Page and route guards that read the permission matrix.
 *
 * ── Additive on purpose ─────────────────────────────────────────────────────
 *
 * 🚨 THESE ARE ADDED ALONGSIDE THE EXISTING CHECKS, NOT IN PLACE OF THEM. The
 * seed reproduces today's behaviour exactly, so `old && can()` changes nothing
 * on the day it ships — but the moment someone edits a role, access changes for
 * real. Replacing 144 hand-written predicates in one pass is 144 chances to
 * invert a condition and accidentally GRANT something; an AND can only ever
 * deny. The old checks come out later, once the matrix has been live and
 * boring for a while.
 *
 * ⚠️ CAPABILITY ONLY. Neither helper knows anything about brands. A route that
 * touches one brand's data still needs isBrandInScope() as well: can() answers
 * "may they do this at all", brandScope answers "to which clients".
 */
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { getWorkspaceScope, type WorkspaceScope } from '@/lib/auth/workspace-scope';
import { can, type Screen, type Level } from '@/lib/auth/permissions';

/**
 * For a server page. Redirects rather than throwing, because a page that a
 * person cannot open should land them somewhere they can.
 *
 * ⚠️ Sends them to /dashboard, which every workspace role can read. If a role
 * ever loses dashboard too this would loop, so that is checked first and such a
 * person is sent to the login screen instead of bouncing forever.
 */
export async function requireScreen(
  screen: Screen,
  level: Level = 'read',
): Promise<WorkspaceScope> {
  const scope = await getWorkspaceScope();
  if (!scope) redirect('/login');
  if (!can(scope, screen, level)) {
    if (screen !== 'dashboard' && can(scope, 'dashboard', 'read')) redirect('/dashboard');
    redirect('/login');
  }
  return scope;
}

/**
 * For an API route. Returns the scope on success, or a Response to return.
 *
 * Reads as:
 *   const g = await guardScreen('payments', 'write');
 *   if (g instanceof NextResponse) return g;
 *   // g is the scope
 */
export async function guardScreen(
  screen: Screen,
  level: Level = 'read',
): Promise<WorkspaceScope | NextResponse> {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!can(scope, screen, level)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return scope;
}
