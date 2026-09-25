import { redirect } from 'next/navigation';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { CoachingWorkspace } from './workspace';

export const metadata = { title: 'Coaching preview' };
export default async function CoachingPage() {
  const scope = await getWorkspaceScope();
  // Design review only. Real coach/brand access is introduced with the data layer.
  if (!scope || scope.impersonating || !['owner', 'admin'].includes(scope.role)) redirect('/reporting');
  return <CoachingWorkspace />;
}
