import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { listIntegrations } from '@/lib/data/integrations';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { IntegrationsClient } from './integrations-client';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  // Tenant integration infra (Slack OAuth, API keys) is owner/admin only.
  // This page had no gate — a manager direct-navigating must be bounced.
  const scope = await getWorkspaceScope();
  if (!scope || scope.brandScope.kind === 'scoped') redirect('/workflows/automations');

  const supabase = await createAdminClient();
  const [integrations, brandsRes] = await Promise.all([
    listIntegrations(),
    supabase
      .from('brands_v2')
      .select('id, slug, name, display_name')
      .eq('is_archived', false)
      .order('name'),
  ]);

  const brands = (brandsRes.data ?? []).map(b => ({
    id: b.id,
    slug: b.slug,
    name: b.name,
    displayName: b.display_name || b.name,
  }));

  return (
    <Suspense>
      <IntegrationsClient initialIntegrations={integrations} brands={brands} />
    </Suspense>
  );
}
