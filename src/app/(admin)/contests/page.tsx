import { redirect } from 'next/navigation';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { ContestsClient } from './components/contests-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Contests — Tempo' };

export default async function ContestsPage() {
  // Owner/admin/manager only — mirrors requireContestScope on the /api/contests
  // routes (coach is excluded: contests carry prize dollars). The APIs enforce
  // this regardless; the page just bounces excluded viewers before render.
  const scope = await getWorkspaceScope();
  if (!scope || !['owner', 'admin', 'manager'].includes(scope.role)) redirect('/dashboard');

  return <ContestsClient />;
}
