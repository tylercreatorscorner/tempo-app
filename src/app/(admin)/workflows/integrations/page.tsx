import { Suspense } from 'react';
import { listIntegrations } from '@/lib/data/integrations';
import { IntegrationsClient } from './integrations-client';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  const integrations = await listIntegrations();
  return (
    <Suspense>
      <IntegrationsClient initialIntegrations={integrations} />
    </Suspense>
  );
}
