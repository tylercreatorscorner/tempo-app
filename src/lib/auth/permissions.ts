/**
 * The one place that answers "may this person do this".
 *
 * Replaces predicates that were written into code in 135 files: 144
 * requireAdmin/requireRole calls, 51 canViewFinance gates and 18 direct
 * `role === '…'` comparisons, each answering one question at one call site.
 *
 * ── Two axes, kept separate ─────────────────────────────────────────────────
 *
 * ⚠️ THIS FILE IS THE CAPABILITY AXIS ONLY: what may they do. The REACH axis
 * (which brands) stays in getWorkspaceScope / isBrandInScope / brandScope,
 * already working across 81 call sites and deliberately untouched. Folding
 * reach in here would mean a permission row per screen PER BRAND and an
 * unusable matrix at 16 clients.
 *
 * A route usually needs BOTH: can() for the verb, isBrandInScope() for the
 * noun. Neither substitutes for the other.
 */
import type { WorkspaceScope } from '@/lib/auth/workspace-scope';

/**
 * Every screen a role can be granted, and the level vocabulary.
 *
 * ⚠️ THIS LIST IS THE CONTRACT. It matches the seed in the RBAC migration and
 * the nav, so the matrix cannot offer a screen the app does not enforce, and
 * the app cannot enforce one the matrix cannot show. Adding a screen means
 * adding it here, in the seed, and on its route: an unseeded screen is DENIED
 * to everyone but owner/admin, which is the safe direction to fail.
 */
export const SCREENS = [
  'dashboard',
  'roster', 'retention', 'affiliates', 'segments', 'contests', 'drops',
  'posts',
  'reporting',
  'messages',
  'earnings', 'invoicing', 'payments',
  'products',
  'settings', 'team', 'upload', 'automations', 'integrations', 'outreach',
] as const;

export type Screen = (typeof SCREENS)[number];
export type Level = 'read' | 'write' | 'configure';

/** Human labels for the matrix. Kept beside the list so one cannot drift. */
export const SCREEN_LABELS: Record<Screen, string> = {
  dashboard: 'Dashboard',
  roster: 'Roster',
  retention: 'Retention',
  affiliates: 'Affiliates',
  segments: 'Segments',
  contests: 'Contests',
  drops: 'Drops',
  posts: 'Posts',
  reporting: 'Reporting',
  messages: 'Comms',
  earnings: 'Earnings',
  invoicing: 'Invoicing',
  payments: 'Payments',
  products: 'Products',
  settings: 'Settings',
  team: 'Team & roles',
  upload: 'Data pipeline',
  automations: 'Automations',
  integrations: 'Integrations',
  outreach: 'Outreach',
};

/** Grouped for the matrix, in nav order. */
export const SCREEN_GROUPS: { label: string; screens: Screen[] }[] = [
  { label: 'Overview', screens: ['dashboard'] },
  { label: 'Creators', screens: ['roster', 'retention', 'affiliates', 'segments', 'contests', 'drops'] },
  { label: 'Content', screens: ['posts'] },
  { label: 'Reporting', screens: ['reporting'] },
  { label: 'Comms', screens: ['messages'] },
  { label: 'Finance', screens: ['earnings', 'invoicing', 'payments'] },
  { label: 'Products', screens: ['products'] },
  { label: 'Settings', screens: ['settings', 'team', 'upload', 'automations', 'integrations', 'outreach'] },
];

/** The finance screens, named once. */
const FINANCE_SCREENS = new Set<Screen>(['earnings', 'invoicing', 'payments']);

export type PermissionSet = Set<string>;

/** Encoding used inside the set. Never built by hand at a call site. */
export const permKey = (screen: string, level: string) => `${screen}:${level}`;

/**
 * May this scope do `level` on `screen`?
 *
 * 🚨 FAILS CLOSED, AND THAT IS THE WHOLE DESIGN. A missing permission row, an
 * unrecognised screen, a scope that failed to resolve, or a permission set that
 * could not be loaded all return FALSE. The obvious implementation — look the
 * row up and grant if present — grants access whenever a lookup fails, a seed
 * is missed, or a new screen ships before its rows do. Every new screen is
 * locked until someone unlocks it on purpose.
 *
 * 🚨 TWO INVARIANTS SIT ABOVE THE MATRIX AND CANNOT BE TICKED INTO EXISTENCE.
 * Both were properties of the old hardcoded code that a data-driven matrix
 * would otherwise quietly give up:
 *
 *   1. A COACH NEVER SEES FINANCE. Today this holds because the code refuses to
 *      read can_view_finance for coaches, so a stray true in the database
 *      grants nothing. Under a bare matrix it becomes a checkbox someone ticks
 *      by accident. It stays hardcoded here.
 *
 *   2. FINANCE STILL HONOURS can_view_finance. The flag governs the agency's
 *      books and is per-PERSON, not per-role: two managers with the same role
 *      legitimately differ. The matrix can only take finance away, never grant
 *      it to someone whose flag is off.
 *
 * Both are AND-ed with the matrix, so the matrix can only ever be more
 * restrictive than the old behaviour, never less.
 */
export function can(
  scope: Pick<WorkspaceScope, 'role' | 'canViewFinance'> & { permissions?: PermissionSet },
  screen: Screen,
  level: Level = 'read',
): boolean {
  if (!scope) return false;

  // Finance is gated by the person's own flag first, whatever the role says.
  if (FINANCE_SCREENS.has(screen)) {
    if (scope.role === 'coach') return false;
    if (!scope.canViewFinance) return false;
  }

  const perms = scope.permissions;
  // ⚠️ An unresolved set is not "allow everything". It is a failure to answer,
  // and the answer to a question we cannot answer is no.
  if (!perms) return false;

  return perms.has(permKey(screen, level));
}

/**
 * Convenience for route handlers: the check plus the response.
 * Returns null when allowed, so a caller reads `const denied = ...; if (denied) return denied;`
 */
export function denyUnless(
  scope: (Pick<WorkspaceScope, 'role' | 'canViewFinance'> & { permissions?: PermissionSet }) | null,
  screen: Screen,
  level: Level = 'read',
): { status: number; error: string } | null {
  if (!scope) return { status: 401, error: 'Unauthorized' };
  if (!can(scope, screen, level)) return { status: 403, error: 'Forbidden' };
  return null;
}
