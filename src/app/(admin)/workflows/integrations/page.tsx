import { Suspense } from 'react';
import { listIntegrations } from '@/lib/data/integrations';
import { createAdminClient } from '@/lib/supabase/server';
import { IntegrationsClient } from './integrations-client';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
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
