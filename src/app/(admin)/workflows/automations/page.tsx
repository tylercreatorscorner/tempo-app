import { Suspense } from 'react';
import { AutomationsClient } from './automations-client';

export const dynamic = 'force-dynamic';

export default function AutomationsPage() {
  return (
    <Suspense>
      <AutomationsClient />
    </Suspense>
  );
}
