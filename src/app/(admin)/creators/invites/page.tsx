import { InvitesClient } from './invites-client';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { assertCreatorInviteScope, CreatorInviteError } from '@/lib/auth/creator-invite-access';
import { PageHeader } from '@/components/ui/page-header';
import { NavigationLink } from '@/components/ui/navigation-link';
import layout from '@/components/ui/workspace-layout.module.css';

/**
 * Admin control panel for distributing creator-portal invite links over Discord.
 * Page and API share the same roster capability and whole-workspace access gate.
 */
export default async function CreatorInvitesPage() {
  const scope = await getWorkspaceScope();
  let allowed = true;
  try { assertCreatorInviteScope(scope); } catch (error) {
    if (!(error instanceof CreatorInviteError)) throw error;
    allowed = false;
  }
  if (!allowed) return (
    <div className={layout.page}>
      <PageHeader title="Portal invites" subtitle="Help creators access their Tempo portal." />
      <section className={layout.panel} aria-labelledby="portal-invite-access-heading">
        <h2 id="portal-invite-access-heading">Portal invitations require full creator access</h2>
        <p className="mt-2">Ask a workspace owner or admin with invitation permissions to create or send a portal link.</p>
        {scope?.impersonating && <p className="mt-2">Exit the member preview to return to your own permissions.</p>}
        <NavigationLink href={scope ? '/dashboard' : '/login'} className="mt-3">
          {scope ? 'Back to workspace' : 'Sign in'}
        </NavigationLink>
      </section>
    </div>
  );
  return <InvitesClient />;
}
