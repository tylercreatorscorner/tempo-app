/**
 * Permission guard for the team section.
 *
 * ⚠️ A LAYOUT, not a change to the page, for two reasons: several of these
 * pages are client components and cannot run a server guard inline, and a
 * layout also covers every nested route under this one for free.
 *
 * ⚠️ ADDITIVE. The pages and API routes underneath keep whatever checks they
 * already had; this only ever denies further. The seeded roles reproduce
 * today's access exactly, so this changes nothing until a role is edited.
 *
 * ⚠️ Capability only. Anything here that reads one brand's data still needs
 * its own brand-scope check: this answers "may they open it", not "whose data".
 */
import { requireScreen } from '@/lib/auth/require-screen';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  // Managers get only the scoped invitation view. The page and server action
  // independently enforce that boundary; the owner/admin matrix is unchanged.
  const scope = await getWorkspaceScope();
  if (scope?.role === 'manager' && !scope.impersonating
    && scope.brandScope.kind === 'scoped' && scope.brandScope.brandIds.length > 0) return <>{children}</>;
  await requireScreen('team');
  return <>{children}</>;
}
