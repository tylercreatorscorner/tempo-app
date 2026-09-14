import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';
import { SamplesClient } from '@/components/samples/samples-client';

export const dynamic = 'force-dynamic';
export default async function SamplesPage() {
  const scope = await getWorkspaceScope();
  if (!scope || scope.impersonating || !['owner','admin'].includes(scope.role)) redirect('/dashboard');
  const db = await createAdminClient();
  const { data, error } = await db.from('brands_v2').select('slug, name')
    .eq('tenant_id', scope.tenantId).eq('is_umbrella', false).order('name');
  if (error) throw new Error('Could not load sample brands');
  return <div className="space-y-6">
    <div><Link href="/settings" className="text-sm text-muted-foreground">← Settings</Link>
      <h1 className="text-2xl font-semibold mt-3">Sample requests</h1>
      <p className="text-sm text-muted-foreground mt-1">Track product requests, shipments, and the content creators delivered.</p></div>
    <SamplesClient brands={data ?? []} />
  </div>;
}
