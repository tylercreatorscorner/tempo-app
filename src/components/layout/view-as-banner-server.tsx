import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { ViewAsBanner } from './view-as-banner';

/** Renders the "viewing as" banner only when a platform admin is impersonating
 *  (getWorkspaceScope resolves the impersonated member + sets .impersonating). */
export async function ViewAsBannerServer() {
  const scope = await getWorkspaceScope();
  if (!scope?.impersonating) return null;
  return <ViewAsBanner name={scope.impersonating.name ?? 'this member'} />;
}
