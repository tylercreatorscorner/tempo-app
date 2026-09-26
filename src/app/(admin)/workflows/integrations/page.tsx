import { TikTokShopSection } from '@/components/settings/tiktok-shop-section';
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
  if (!scope || !['owner', 'admin'].includes(scope.role)) redirect('/workflows/automations');

  const supabase = await createAdminClient();
  const [integrations, brandsRes] = await Promise.all([
    listIntegrations(),
    supabase
      .from('brands_v2')
      .select('id, slug, name, display_name')
      .eq('is_archived', false).eq('tenant_id', scope.tenantId)
      .order('name'),
  ]);

  if (brandsRes.error) throw new Error('Could not load brands.');
  const brands = (brandsRes.data ?? []).map(b => ({
    id: b.id,
    slug: b.slug,
    name: b.name,
    displayName: b.display_name || b.name,
  }));

  return (
    <Suspense>
      <div className="space-y-5"><IntegrationsClient initialIntegrations={integrations} brands={brands} /><section className="rounded-xl border border-border bg-card p-4"><h2 className="font-semibold mb-3">TikTok Shop API</h2><TikTokShopSection /></section></div>
    </Suspense>
  );
}
